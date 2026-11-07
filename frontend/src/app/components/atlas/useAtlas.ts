"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    deleteAtlasContribution,
    deleteAtlasData,
    getAtlasState,
    saveAtlasState,
    sendAtlasEvents,
    submitAtlasContribution,
} from "@/app/lib/mikeApi";
import { configureAnalytics, track } from "@/app/lib/atlas/analytics";
import { buildContribution } from "@/app/lib/atlas/brazil";
import { computeGameStatus } from "@/app/lib/atlas/gamification";
import { computeMetrics, effectiveUsage, projectRoute } from "@/app/lib/atlas/metrics";
import {
    applyImport,
    applyManual,
    clearLocal,
    emptyState,
    loadLocal,
    removeSource,
    sanitizeState,
    saveLocal,
    setDecision,
    toggleExplored,
} from "@/app/lib/atlas/state";
import type { AtlasState, ImportResult, RouteDecision, UsageRecord } from "@/app/lib/atlas/types";

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
            saveAtlasState(state)
                .then(() => setSync("synced"))
                .catch(() => setSync("offline"));
        }, 1500);
        return () => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
        };
    }, [state, loaded]);

    const usage = useMemo(() => effectiveUsage(state), [state]);
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
        importResult: useCallback((result: ImportResult, fileName: string) => {
            setState((s) => applyImport(s, result, fileName));
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
            setState((s) => setDecision(s, placeId, decision, target));
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

    return { state, loaded, sync, usage, metrics, projectedUsage, projectedMetrics, game, newBadges, actions };
}

export type AtlasModel = ReturnType<typeof useAtlas>;
