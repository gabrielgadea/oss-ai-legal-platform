"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    deleteAtlasContribution,
    deleteAtlasData,
    getAtlasCaravan,
    getAtlasState,
    getAtlasWorld,
    saveAtlasState,
    sendAtlasEvents,
    setAtlasCaravan,
    submitAtlasContribution,
    syncAtlasDiscoveries,
    syncAtlasMarks,
    type AtlasWorldStats,
} from "@/app/lib/mikeApi";
import { clearSecret, writeBackDiscovery, type WriteBackResult } from "@/app/lib/atlas/connectors";
import { discoveredSet, generateWorld, revealedRealms } from "@/app/lib/atlas/world";
import {
    BONUS_CONNECTOR,
    BONUS_DECISION,
    BONUS_IMPORT,
    budget as computeBudget,
    initExpedition,
    resolveMove,
    type Budget,
    type MoveResult,
} from "@/app/lib/atlas/expedition";
import { configureAnalytics, track } from "@/app/lib/atlas/analytics";
import { buildContribution } from "@/app/lib/atlas/brazil";
import { computeGameStatus } from "@/app/lib/atlas/gamification";
import { computeMetrics, effectiveUsage, projectRoute } from "@/app/lib/atlas/metrics";
import {
    addEcho,
    applyImport,
    applyManual,
    clearLocal,
    connect,
    disconnect,
    discover,
    setCaravan,
    setExpedition,
    setWriteBack,
    toggleLantern,
    emptyState,
    grantLeagues,
    loadLocal,
    removeSource,
    sanitizeState,
    saveLocal,
    setDecision,
    toggleExplored,
} from "@/app/lib/atlas/state";
import type {
    AtlasState,
    ConnectorId,
    DiscoveryMethod,
    ImportResult,
    Inhabitance,
    RouteDecision,
    UsageRecord,
} from "@/app/lib/atlas/types";

export interface Notice {
    id: number;
    kind: "discovery" | "writeback" | "info" | "error";
    text: string;
    url?: string;
}

export type SyncStatus = "local" | "syncing" | "synced" | "offline";

/**
 * Estado do Atlas: local-first (localStorage), com sincronização opcional e
 * silenciosa com o backend. Se o backend estiver indisponível, tudo continua
 * funcionando no navegador.
 */
export function useAtlas() {
    const [state, setState] = useState<AtlasState>(() => loadLocal() ?? emptyState());
    const [loaded, setLoaded] = useState(false);
    const [sync, setSync] = useState<SyncStatus>("local");
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const earnedRef = useRef<Set<string> | null>(null);
    /** Após "apagar tudo", não recriar o registro no servidor. */
    const skipRemoteSave = useRef(false);

    useEffect(() => {
        configureAnalytics((events) => sendAtlasEvents(events));
        const local = loadLocal();
        getAtlasState()
            .then(({ state: remote }) => {
                const r = sanitizeState(remote);
                if (r && (!local || r.updatedAt > local.updatedAt)) setState(r);
                setSync("synced");
            })
            .catch(() => setSync("offline"))
            .finally(() => setLoaded(true));
        track("atlas_viewed");
    }, []);

    // Persistência: local imediata, servidor com debounce.
    useEffect(() => {
        if (!loaded) return;
        saveLocal(state);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        if (skipRemoteSave.current) {
            skipRemoteSave.current = false;
            return;
        }
        saveTimer.current = setTimeout(() => {
            setSync("syncing");
            Promise.all([
                saveAtlasState(state),
                syncAtlasDiscoveries(
                    Object.entries(state.discoveries).map(([placeId, d]) => ({ placeId, ...d })),
                ),
                syncAtlasMarks(Object.keys(state.lanterns), state.echoes),
            ])
                .then(() => setSync("synced"))
                .catch(() => setSync("offline"));
        }, 1500);
        return () => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
        };
    }, [state, loaded]);

    const usage = useMemo(() => effectiveUsage(state), [state]);
    const discovered = useMemo(() => discoveredSet(state, usage), [state, usage]);
    const realms = useMemo(() => revealedRealms(discovered), [discovered]);

    // Modo Expedição: geometria do mundo (determinística), habitados e orçamento.
    const worldGeo = useMemo(() => generateWorld(), []);
    const inhabited = useMemo(
        () => [...new Set([...usage.map((u) => u.placeId), ...Object.keys(state.inhabit)])],
        [usage, state.inhabit],
    );
    const leagues = useMemo<Budget | null>(
        () => (state.expedition ? computeBudget(state.expedition, inhabited.length) : null),
        [state.expedition, inhabited.length],
    );

    // Mundo compartilhado (população, lanternas, ecos) e rumores das caravanas.
    const [world, setWorld] = useState<Record<string, AtlasWorldStats>>({});
    const [rumors, setRumors] = useState<Record<string, string[]>>({});
    const refreshSocial = useCallback(() => {
        getAtlasWorld()
            .then((w) => setWorld(w.places))
            .catch(() => {});
        getAtlasCaravan()
            .then(({ members }) => {
                const r: Record<string, string[]> = {};
                for (const m of members) for (const id of m.discoveries) (r[id] ??= []).push(m.handle);
                setRumors(r);
            })
            .catch(() => {});
    }, []);
    useEffect(() => {
        refreshSocial();
    }, [refreshSocial]);

    const [notices, setNotices] = useState<Notice[]>([]);
    const [justRevealed, setJustRevealed] = useState<string[]>([]);
    const notify = useCallback((n: Omit<Notice, "id">) => {
        const id = Date.now() + Math.random();
        setNotices((list) => [...list.slice(-3), { ...n, id }]);
        setTimeout(() => setNotices((list) => list.filter((x) => x.id !== id)), 9000);
    }, []);
    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);
    const metrics = useMemo(() => computeMetrics(usage, state.explored), [usage, state.explored]);
    const projectedUsage = useMemo(() => projectRoute(usage, state.decisions), [usage, state.decisions]);
    const projectedMetrics = useMemo(
        () => computeMetrics(projectedUsage, state.explored),
        [projectedUsage, state.explored],
    );
    const game = useMemo(() => computeGameStatus({ state, usage, metrics }), [state, usage, metrics]);

    // Detecta conquistas novas (para celebrar e medir).
    const [newBadges, setNewBadges] = useState<string[]>([]);
    useEffect(() => {
        if (!loaded) return;
        const earned = new Set(game.badges.filter((b) => b.earned).map((b) => b.id));
        if (earnedRef.current) {
            const fresh = [...earned].filter((id) => !earnedRef.current!.has(id));
            if (fresh.length) {
                fresh.forEach((id) => track("badge_earned", { badge: id }));
                setNewBadges(fresh);
            }
        }
        earnedRef.current = earned;
    }, [game.badges, loaded]);

    // Contribuição opcional ao mapa do Brasil (uma por semana, sobrescrita).
    useEffect(() => {
        if (!loaded || !state.contributeToBrazilMap || !state.uf || usage.length === 0) return;
        const t = setTimeout(() => {
            submitAtlasContribution(buildContribution(state.uf!, metrics)).catch(() => {});
        }, 2000);
        return () => clearTimeout(t);
    }, [loaded, state.contributeToBrazilMap, state.uf, metrics, usage.length]);

    const actions = {
        discover: useCallback(
            (placeId: string, method: DiscoveryMethod) => {
                const wasKnown = discoveredSet(stateRef.current, effectiveUsage(stateRef.current)).has(placeId);
                const next = discover(stateRef.current, placeId, method);
                setState(next);
                if (wasKnown) return;
                track("place_explored", { method });
                setJustRevealed((l) => [...l, placeId]);
                setTimeout(() => setJustRevealed((l) => l.filter((x) => x !== placeId)), 4000);
                // Devolve a descoberta às plataformas de origem conectadas.
                if (Object.values(next.writeBack).some(Boolean)) {
                    writeBackDiscovery(placeId, next).then((results: WriteBackResult[]) => {
                        for (const r of results) {
                            notify(
                                r.ok
                                    ? { kind: "writeback", text: `Descoberta publicada no ${r.connector === "mastodon" ? "Mastodon" : "Bluesky"}`, url: r.url?.startsWith("http") ? r.url : undefined }
                                    : { kind: "error", text: `${r.connector}: ${r.error}` },
                            );
                        }
                    });
                }
            },
            [notify],
        ),
        toggleLantern: useCallback((placeId: string) => {
            setState((s) => toggleLantern(s, placeId));
            track("lantern_toggled");
        }, []),
        echo: useCallback((placeId: string, target: string) => {
            setState((s) => addEcho(s, placeId));
            track("echoed", { target });
        }, []),
        connect: useCallback(
            (id: ConnectorId, meta: { account: string; service: string }, placeId: string, inh: Omit<Inhabitance, "at" | "via">) => {
                setState((s) => grantLeagues(connect(s, id, meta, placeId, inh), BONUS_CONNECTOR));
                track("connector_connected", { connector: id });
                notify({ kind: "info", text: `Ponte construída com ${id === "mastodon" ? "Mastodon" : "Bluesky"}: território verificado.` });
            },
            [notify],
        ),
        disconnect: useCallback((id: ConnectorId) => {
            clearSecret(id);
            setState((s) => disconnect(s, id));
        }, []),
        setWriteBack: useCallback((id: ConnectorId, on: boolean) => setState((s) => setWriteBack(s, id, on)), []),
        setCaravan: useCallback(
            async (handles: string[]) => {
                setState((s) => setCaravan(s, handles));
                track("caravan_updated", { size: handles.length });
                try {
                    const r = await setAtlasCaravan(handles);
                    if (r.notFound.length) notify({ kind: "error", text: `Viajantes não encontrados: ${r.notFound.join(", ")}` });
                    refreshSocial();
                } catch {
                    notify({ kind: "error", text: "Não foi possível falar com o servidor das caravanas." });
                }
            },
            [notify, refreshSocial],
        ),
        replaceState: useCallback((next: AtlasState) => setState({ ...next, updatedAt: new Date().toISOString() }), []),
        notify,
        // ── Modo Expedição ──────────────────────────────────────────────
        enterExpedition: useCallback(() => {
            setState((s) => {
                if (s.expedition) return s;
                const u = effectiveUsage(s);
                const disc = discoveredSet(s, u);
                const inh = [...new Set([...u.map((x) => x.placeId), ...Object.keys(s.inhabit)])];
                return setExpedition(s, initExpedition(generateWorld(), disc, inh));
            });
        }, []),
        moveCartographer: useCallback(
            (dest: { x: number; y: number }): MoveResult | null => {
                const s = stateRef.current;
                if (!s.expedition) return null;
                const u = effectiveUsage(s);
                const disc = discoveredSet(s, u);
                const inhCount = new Set([...u.map((x) => x.placeId), ...Object.keys(s.inhabit)]).size;
                const result = resolveMove(s.expedition, dest, worldGeo, disc, inhCount);
                if (!result.moved) {
                    notify({ kind: "info", text: "Léguas esgotadas por hoje. Volte amanhã ou traga dados reais para ganhar léguas." });
                    return result;
                }
                setState((cur) => (cur.expedition ? setExpedition(cur, result.exp) : cur));
                for (const y of result.collected) {
                    notify(
                        y.rumorPlaceId
                            ? { kind: "info", text: `Marco alcançado — rumor: há uma «${y.epithet}» por perto.` }
                            : { kind: "info", text: `Marco alcançado — +${y.leagues} léguas.` },
                    );
                }
                if (result.truncated) notify({ kind: "info", text: "Você avançou até onde as léguas de hoje permitiram." });
                return result;
            },
            [notify, worldGeo],
        ),
        importResult: useCallback((result: ImportResult, fileName: string) => {
            setState((s) => grantLeagues(applyImport(s, result, fileName), BONUS_IMPORT));
            track("import_succeeded", { source: result.source, places: result.records.length });
        }, []),
        saveManual: useCallback((records: UsageRecord[]) => {
            setState((s) => applyManual(s, records));
            track("manual_estimate_saved", { places: records.length });
        }, []),
        removeSource: useCallback((source: string) => setState((s) => removeSource(s, source)), []),
        toggleExplored: useCallback((placeId: string) => {
            setState((s) => toggleExplored(s, placeId));
            track("place_explored");
        }, []),
        decide: useCallback((placeId: string, decision: RouteDecision | null, target?: string) => {
            setState((s) => {
                const next = setDecision(s, placeId, decision, target);
                return decision ? grantLeagues(next, BONUS_DECISION) : next;
            });
            if (decision) track("route_decided", { decision, withTarget: Boolean(target) });
        }, []),
        setBrazil: useCallback((uf: string | undefined, contribute: boolean) => {
            setState((s) => ({ ...s, uf, contributeToBrazilMap: contribute, updatedAt: new Date().toISOString() }));
            track("brazil_contribution_toggled", { on: contribute });
            if (!contribute) deleteAtlasContribution().catch(() => {});
        }, []),
        deleteEverything: useCallback(async () => {
            track("data_deleted");
            clearLocal();
            skipRemoteSave.current = true;
            setState({ ...emptyState(), updatedAt: new Date().toISOString() });
            await Promise.allSettled([deleteAtlasData(), deleteAtlasContribution()]);
        }, []),
        dismissBadges: useCallback(() => setNewBadges([]), []),
    };

    return {
        state,
        loaded,
        sync,
        usage,
        discovered,
        realms,
        world,
        rumors,
        notices,
        justRevealed,
        metrics,
        projectedUsage,
        projectedMetrics,
        game,
        newBadges,
        worldGeo,
        expedition: state.expedition,
        leagues,
        inhabited,
        actions,
    };
}

export type AtlasModel = ReturnType<typeof useAtlas>;
