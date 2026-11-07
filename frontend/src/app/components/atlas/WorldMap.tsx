"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import type { AtlasWorldStats } from "@/app/lib/mikeApi";
import { CONTENT_VOLUME_LABELS, PLACES, PLACE_BY_ID, POPULATION_LABELS } from "@/app/lib/atlas/catalog";
import { formatMinutes } from "@/app/lib/atlas/metrics";
import { scoresFor, TERRAIN_INFO } from "@/app/lib/atlas/scoring";
import {
    FOG_CELL,
    generateMarks,
    reachTowards,
    type Budget,
    type MoveResult,
} from "@/app/lib/atlas/expedition";
import type { AtlasState, CategoryId, EffectiveUsage, ExpeditionState, Terrain } from "@/app/lib/atlas/types";
import {
    REALMS,
    REALM_BY_ID,
    WORLD_H,
    WORLD_W,
    blindTarget,
    contentVolumeOf,
    epithet,
    generateWorld,
    placeSigil,
    visibilityOf,
    type Pt,
    type Sigil,
    type Territory,
} from "@/app/lib/atlas/world";

// Tema "cosmos neural de dados": fundo espacial, neon, vidro escuro.
const INK = "#cdd9f0"; // tinta clara (texto/linhas sobre o espaço)
const PARCHMENT = "#070b16"; // superfície/halo escuro (atrás de texto claro)
const SPACE_EDGE = "#03040b";
const GRID_LINE = "rgba(120,180,255,0.08)";
const NEON = "#5fe3ff"; // ciano de destaque
const NEON_WARN = "#ff5c7a"; // vermelho-rosa (labirinto / rota)
const NEON_GOLD = "#ffcf5c";

/** Glifos de essência: cada reino tem um símbolo que diz o que se faz lá. */
export function EssenceGlyph({ realm, size = 14, color = INK }: { realm: CategoryId; size?: number; color?: string }) {
    const s = { fill: "none", stroke: color, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    const g = (() => {
        switch (realm) {
            case "social": // fogueira
                return (
                    <>
                        <path d="M10 3c2 3 4 4.5 4 7.5a4 4 0 0 1-8 0C6 8 8 7 10 3z" {...s} fill={color} fillOpacity={0.25} />
                        <path d="M4 17l12-3M4 14l12 3" {...s} />
                    </>
                );
            case "video": // espelho / tela
                return (
                    <>
                        <rect x="3" y="4" width="14" height="10" rx="2" {...s} />
                        <path d="M9 7l3.5 2L9 11z" fill={color} />
                        <path d="M7 17h6" {...s} />
                    </>
                );
            case "messaging": // pombal
                return (
                    <>
                        <path d="M4 9l6-5 6 5v8H4z" {...s} />
                        <circle cx="10" cy="11" r="1.8" {...s} />
                        <path d="M4 17h12" {...s} />
                    </>
                );
            case "knowledge": // torre
                return (
                    <>
                        <path d="M6 17V6h8v11M6 6V3h2v2h1V3h2v2h1V3h2v3" {...s} />
                        <path d="M9 17v-4h2v4M8 9h4" {...s} />
                    </>
                );
            case "audio": // concha / ondas
                return (
                    <>
                        <circle cx="6" cy="10" r="1.6" fill={color} />
                        <path d="M9 7a4 4 0 0 1 0 6M11.5 5a7 7 0 0 1 0 10M14 3a10 10 0 0 1 0 14" {...s} />
                    </>
                );
            case "commerce": // tenda de bazar
                return (
                    <>
                        <path d="M3 9l7-5 7 5z" {...s} />
                        <path d="M5 9v8M15 9v8M3 17h14M8 9v3M12 9v3" {...s} />
                    </>
                );
            case "civic": // coluna
                return (
                    <>
                        <path d="M3 6l7-3 7 3zM4 17h12M5 15h10" {...s} />
                        <path d="M6.5 7v8M10 7v8M13.5 7v8" {...s} />
                    </>
                );
            case "play": // estandarte
                return (
                    <>
                        <path d="M5 17V3" {...s} />
                        <path d="M5 4h10l-2.5 3L15 10H5" {...s} fill={color} fillOpacity={0.25} />
                    </>
                );
        }
    })();
    return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
            {g}
        </svg>
    );
}

/**
 * Sigilo da essência do LOCAL (não do reino): expressa, por dentro, o que
 * aquele território é — moeda (troca), escudo (cripto), vórtice (feed sem fim),
 * megafone (anúncios), rede (federado), coração (doações), etc.
 */
export function PlaceSigilMark({ sigil, size = 16, color = INK }: { sigil: Sigil; size?: number; color?: string }) {
    const s = { fill: "none", stroke: color, strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    const g = (() => {
        switch (sigil) {
            case "network":
                return (
                    <>
                        <circle cx="10" cy="4" r="2" {...s} />
                        <circle cx="4" cy="15" r="2" {...s} />
                        <circle cx="16" cy="15" r="2" {...s} />
                        <path d="M10 6L5 13M10 6l5 7M6 15h8" {...s} />
                    </>
                );
            case "columns":
                return (
                    <>
                        <path d="M3 6l7-3 7 3M4 16h12" {...s} />
                        <path d="M6 7v8M10 7v8M14 7v8" {...s} />
                    </>
                );
            case "shield":
                return (
                    <>
                        <path d="M10 3l6 2v5c0 4-3 6-6 7-3-1-6-3-6-7V5z" {...s} fill={color} fillOpacity={0.18} />
                        <path d="M7.5 10l2 2 3.5-4" {...s} />
                    </>
                );
            case "compass":
                return (
                    <>
                        <circle cx="10" cy="10" r="7" {...s} />
                        <path d="M10 10l4-4-2.5 6L6 14z" {...s} fill={color} fillOpacity={0.3} />
                    </>
                );
            case "vortex":
                return <path d="M10 10m0-7a7 7 0 1 1-6 3.5 5 5 0 1 0 8 2 3 3 0 1 1-4 1" {...s} />;
            case "heart":
                return <path d="M10 16C4 12 3 8 5.5 6a3 3 0 0 1 4.5.5A3 3 0 0 1 14.5 6C17 8 16 12 10 16z" {...s} fill={color} fillOpacity={0.2} />;
            case "wave":
                return (
                    <>
                        <path d="M3 7q3.5-4 7 0t7 0" {...s} />
                        <path d="M3 12q3.5-4 7 0t7 0" {...s} />
                        <path d="M3 17q3.5-4 7 0t7 0" {...s} />
                    </>
                );
            case "megaphone":
                return (
                    <>
                        <path d="M4 8v4l9 4V4zM4 8H3v4h1" {...s} fill={color} fillOpacity={0.18} />
                        <path d="M15 8a3 3 0 0 1 0 4" {...s} />
                    </>
                );
            case "ticket":
                return (
                    <>
                        <path d="M3 7h14v3a1.5 1.5 0 0 0 0 3v0H3v0a1.5 1.5 0 0 0 0-3z" {...s} />
                        <path d="M11 7v6" {...{ ...s, strokeDasharray: "1.5 1.5" }} />
                    </>
                );
            case "coin":
                return (
                    <>
                        <circle cx="10" cy="10" r="7" {...s} />
                        <path d="M10 6v8M7.5 8h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" {...s} />
                    </>
                );
            case "clock":
                return (
                    <>
                        <circle cx="10" cy="10" r="7" {...s} />
                        <path d="M10 6v4l3 2" {...s} />
                    </>
                );
            default:
                return <path d="M7 8a3 3 0 1 1 4 2.8c-.8.5-1 1-1 2M10 15v.5" {...s} />;
        }
    })();
    return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
            {g}
        </svg>
    );
}

const TERRAIN_PATTERN: Record<Terrain, string> = {
    clareira: "url(#tx-meadow)",
    trilha: "url(#tx-trail)",
    labirinto: "url(#tx-maze)",
};

interface Props {
    state: AtlasState;
    usage: EffectiveUsage[];
    discovered: Set<string>;
    realms: Set<CategoryId>;
    world: Record<string, AtlasWorldStats>;
    rumors: Record<string, string[]>;
    justRevealed: string[];
    selected: string | null;
    onSelect: (placeId: string) => void;
    onExpedition: (placeId: string) => void;
    /** Modo Expedição (dinâmica de mapa de aventura). */
    mode?: "browse" | "expedition";
    expedition?: ExpeditionState;
    leagues?: Budget | null;
    /** Move o Cartógrafo rumo a um ponto; devolve o resultado para a UI. */
    onMove?: (dest: Pt) => MoveResult | null;
}

export function WorldMap({ state, usage, discovered, realms, world, rumors, justRevealed, selected, onSelect, onExpedition, mode = "browse", expedition, leagues, onMove }: Props) {
    const geo = useMemo(() => generateWorld(), []);
    const minutes = useMemo(() => new Map(usage.map((u) => [u.placeId, u.weeklyMinutes])), [usage]);
    const [view, setView] = useState({ x: 0, y: 0, w: WORLD_W, h: WORLD_H });
    const [daySeed] = useState(() => Math.floor(Date.now() / 86_400_000));
    const [hover, setHover] = useState<Pt | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null);
    const expeditionOn = mode === "expedition" && Boolean(expedition);

    const eventToWorld = useCallback(
        (e: { clientX: number; clientY: number }): Pt => {
            const r = svgRef.current?.getBoundingClientRect();
            if (!r) return { x: 0, y: 0 };
            return { x: view.x + ((e.clientX - r.left) / r.width) * view.w, y: view.y + ((e.clientY - r.top) / r.height) * view.h };
        },
        [view],
    );

    const marks = useMemo(() => generateMarks(), []);
    const liftedCells = useMemo(() => new Set(expedition?.fog ?? []), [expedition?.fog]);
    const reach = useMemo(() => {
        if (!expeditionOn || !expedition || !leagues || !hover) return null;
        return reachTowards(expedition.cartographer, hover, leagues.available, geo, discovered);
    }, [expeditionOn, expedition, leagues, hover, geo, discovered]);

    const handleMapClick = useCallback(
        (e: { clientX: number; clientY: number }) => {
            if (!expeditionOn || !onMove || drag.current?.moved) return;
            const p = eventToWorld(e);
            const candidate = geo.territories.find((t) => Math.hypot(t.center.x - p.x, t.center.y - p.y) <= t.radius);
            const res = onMove(p);
            if (!res || !res.moved || res.truncated) return;
            if (candidate) {
                if (visibilityOf(candidate.placeId, discovered, realms) === "discovered") onSelect(candidate.placeId);
                else onExpedition(candidate.placeId);
            }
        },
        [expeditionOn, onMove, eventToWorld, geo, discovered, realms, onSelect, onExpedition],
    );

    const clampView = useCallback((v: typeof view) => {
        const w = Math.max(320, Math.min(WORLD_W, v.w));
        const h = (w * WORLD_H) / WORLD_W;
        return { w, h, x: Math.max(-100, Math.min(WORLD_W - w + 100, v.x)), y: Math.max(-80, Math.min(WORLD_H - h + 80, v.y)) };
    }, []);

    const zoom = useCallback(
        (factor: number, cx = 0.5, cy = 0.5) =>
            setView((v) => {
                const w = v.w * factor;
                const h = v.h * factor;
                return clampView({ x: v.x + (v.w - w) * cx, y: v.y + (v.h - h) * cy, w, h });
            }),
        [clampView],
    );

    const onWheel = (e: React.WheelEvent) => {
        const r = svgRef.current?.getBoundingClientRect();
        if (!r) return;
        zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    const onPointerDown = (e: React.PointerEvent) => {
        drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const d = drag.current;
        const r = svgRef.current?.getBoundingClientRect();
        if (!r) return;
        if (!d) {
            if (expeditionOn) setHover(eventToWorld(e));
            return;
        }
        const dx = ((e.clientX - d.px) / r.width) * view.w;
        const dy = ((e.clientY - d.py) / r.height) * view.h;
        if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
        if (d.moved) setView((v) => clampView({ ...v, x: d.vx - dx, y: d.vy - dy }));
    };
    const endDrag = () => {
        setTimeout(() => (drag.current = null), 0);
    };
    /** Clique só conta se não foi arrasto. */
    const click = (fn: () => void) => () => {
        if (!drag.current?.moved) fn();
    };

    const territoriesByRealm = useMemo(() => {
        const m = new Map<CategoryId, Territory[]>();
        for (const t of geo.territories) {
            const list = m.get(t.realm) ?? [];
            list.push(t);
            m.set(t.realm, list);
        }
        return m;
    }, [geo]);

    const routes = Object.entries(state.decisions)
        .filter(([from, d]) => d.target && discovered.has(from) && discovered.has(d.target))
        .map(([from, d]) => ({
            from: geo.territories.find((t) => t.placeId === from)!,
            to: geo.territories.find((t) => t.placeId === d.target)!,
        }))
        .filter((r) => r.from && r.to);

    return (
        <div className="relative overflow-hidden rounded-2xl border border-[#1b2742] shadow-[0_0_40px_rgba(0,0,0,0.5)]" style={{ background: SPACE_EDGE }}>
            <svg
                ref={svgRef}
                viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
                className="block aspect-[16/10] w-full touch-none select-none md:aspect-auto md:h-[68vh] md:min-h-[420px]"
                role="img"
                aria-label="Mapa do multiverso digital"
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerLeave={() => {
                    endDrag();
                    setHover(null);
                }}
            >
                <defs>
                    <radialGradient id="deepspace" cx="46%" cy="40%" r="85%">
                        <stop offset="0%" stopColor="#0d1530" />
                        <stop offset="55%" stopColor="#070b1a" />
                        <stop offset="100%" stopColor={SPACE_EDGE} />
                    </radialGradient>
                    <radialGradient id="vignette" cx="50%" cy="50%" r="72%">
                        <stop offset="58%" stopColor="#000" stopOpacity="0" />
                        <stop offset="100%" stopColor="#01020a" stopOpacity="0.72" />
                    </radialGradient>
                    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
                        <feGaussianBlur stdDeviation="4" result="b" />
                        <feMerge>
                            <feMergeNode in="b" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <filter id="softglow" x="-120%" y="-120%" width="340%" height="340%">
                        <feGaussianBlur stdDeviation="22" />
                    </filter>
                    {/* Campo de estrelas (ladrilhado) */}
                    <pattern id="stars" width="240" height="240" patternUnits="userSpaceOnUse">
                        <circle cx="30" cy="40" r="1" fill="#aecbff" opacity="0.8" />
                        <circle cx="120" cy="90" r="0.7" fill="#dce8ff" opacity="0.6" />
                        <circle cx="200" cy="30" r="1.2" fill="#9fc0ff" opacity="0.7" />
                        <circle cx="80" cy="170" r="0.8" fill="#cfe0ff" opacity="0.6" />
                        <circle cx="175" cy="150" r="1" fill="#bcd4ff" opacity="0.7" />
                        <circle cx="210" cy="210" r="0.7" fill="#eaf2ff" opacity="0.5" />
                        <circle cx="45" cy="110" r="0.6" fill="#9fc0ff" opacity="0.5" />
                    </pattern>
                    {/* Grade holográfica de coordenadas */}
                    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
                        <path d="M80 0H0V80" fill="none" stroke={GRID_LINE} strokeWidth="1" />
                    </pattern>
                    {/* Terra incógnita: setor de dados criptografados */}
                    <pattern id="hatch-x" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                        <rect width="10" height="10" fill="#070b18" />
                        <path d="M0 0V10M5 0V10" stroke={NEON} strokeWidth="0.8" opacity="0.18" />
                    </pattern>
                    {/* Silhueta: setor escaneado mas não decodificado */}
                    <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                        <rect width="7" height="7" fill="#0a1024" />
                        <path d="M0 0V7" stroke={NEON} strokeWidth="0.9" opacity="0.22" />
                    </pattern>
                    {/* Texturas de terreno como circuitos de dados */}
                    <pattern id="tx-meadow" width="16" height="16" patternUnits="userSpaceOnUse">
                        <circle cx="4" cy="4" r="0.9" fill="#58f0c0" opacity="0.5" />
                        <circle cx="12" cy="11" r="0.9" fill="#58f0c0" opacity="0.4" />
                    </pattern>
                    <pattern id="tx-trail" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
                        <path d="M0 9h5M9 9h5" stroke="#7fd0ff" strokeWidth="1" opacity="0.4" />
                    </pattern>
                    <pattern id="tx-maze" width="16" height="16" patternUnits="userSpaceOnUse">
                        <path d="M1 1h14v14H5V5h6v6H8" stroke={NEON_WARN} strokeWidth="1" fill="none" opacity="0.45" />
                    </pattern>
                </defs>

                {/* Vácuo digital: espaço profundo + estrelas + grade */}
                <rect x={-200} y={-200} width={WORLD_W + 400} height={WORLD_H + 400} fill="url(#deepspace)" />
                <rect x={-200} y={-200} width={WORLD_W + 400} height={WORLD_H + 400} fill="url(#stars)" />
                <rect x={-200} y={-200} width={WORLD_W + 400} height={WORLD_H + 400} fill="url(#grid)" />

                {/* Nebulosas: brilho difuso na cor de cada reino conhecido */}
                <g filter="url(#softglow)" className="pointer-events-none">
                    {REALMS.filter((r) => realms.has(r.id)).map((r) => (
                        <circle key={r.id} cx={r.center.x} cy={r.center.y} r={r.radius * 0.9} fill={r.color} opacity={0.1} />
                    ))}
                </g>

                {/* Filamentos: teias de conexão entre territórios descobertos do mesmo reino */}
                <g className="pointer-events-none" filter="url(#glow)">
                    {REALMS.filter((r) => realms.has(r.id)).flatMap((r) => {
                        const pts = (territoriesByRealm.get(r.id) ?? []).filter((t) => discovered.has(t.placeId));
                        return pts.slice(1).map((t, i) => (
                            <line key={`${r.id}-${i}`} x1={pts[i].center.x} y1={pts[i].center.y} x2={t.center.x} y2={t.center.y} stroke={r.color} strokeWidth="1" opacity="0.28" />
                        ));
                    })}
                </g>

                {/* Ilhas */}
                {geo.islands.map((isl) => {
                    const realm = REALM_BY_ID[isl.realm];
                    const known = realms.has(isl.realm);
                    const target = blindTarget(isl.realm, discovered, daySeed);
                    return (
                        <g key={isl.realm}>
                            {known && <path d={isl.shore} fill={realm.color} opacity={0.08} filter="url(#softglow)" className="pointer-events-none" />}
                            <path
                                d={isl.path}
                                fill={known ? realm.color : "url(#hatch-x)"}
                                fillOpacity={known ? 0.1 : 1}
                                stroke={known ? realm.color : "rgba(150,180,230,0.35)"}
                                strokeWidth={known ? 1.6 : 1.2}
                                strokeDasharray={known ? undefined : "8 6"}
                                filter={known ? "url(#glow)" : undefined}
                                className={known ? undefined : "cursor-pointer"}
                                onClick={known ? undefined : click(() => target && onExpedition(target))}
                            >
                                {!known && <title>Setor criptografado — clique para iniciar uma sondagem</title>}
                            </path>
                            <text
                                x={realm.center.x}
                                y={realm.center.y - realm.radius - 14}
                                textAnchor="middle"
                                className="pointer-events-none"
                                style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: known ? 15 : 13, letterSpacing: 3, fontWeight: 600, textTransform: "uppercase", fill: known ? "#eaf2ff" : "#8fa6cc", paintOrder: "stroke", stroke: PARCHMENT, strokeWidth: 4 }}
                            >
                                {known ? realm.name : "Setor Incógnito"}
                            </text>
                            {!known && (
                                <text x={realm.center.x} y={realm.center.y + 10} textAnchor="middle" className="pointer-events-none" style={{ fontFamily: "ui-monospace, monospace", fontSize: 30, fill: NEON, opacity: 0.35, letterSpacing: 2 }}>
                                    ?
                                </text>
                            )}
                        </g>
                    );
                })}

                {/* Territórios dos reinos revelados */}
                {REALMS.filter((r) => realms.has(r.id)).flatMap((realm) =>
                    (territoriesByRealm.get(realm.id) ?? []).map((t) => {
                        const vis = visibilityOf(t.placeId, discovered, realms);
                        const place = PLACE_BY_ID[t.placeId];
                        const isSel = selected === t.placeId;
                        if (vis !== "discovered") {
                            const rumor = rumors[t.placeId];
                            return (
                                <g key={t.placeId} className="cursor-pointer" onClick={click(() => onSelect(t.placeId))}>
                                    <title>{rumor ? `Sinal captado (${rumor.join(", ")}): ${epithet(place)}` : "Setor escaneado — ainda não decodificado"}</title>
                                    <path d={t.path} fill="url(#hatch)" stroke="rgba(150,180,230,0.4)" strokeWidth={1.1} strokeDasharray="4 4" />
                                    {isSel && <path d={t.path} fill="none" stroke={NEON} strokeWidth={2.2} filter="url(#glow)" />}
                                    {rumor ? (
                                        <g className="pointer-events-none" filter="url(#glow)">
                                            <circle cx={t.center.x} cy={t.center.y} r={9} fill="#0a1024" stroke={NEON} />
                                            <text x={t.center.x} y={t.center.y + 4} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: NEON }}>❝</text>
                                        </g>
                                    ) : (
                                        <text x={t.center.x} y={t.center.y + 6} textAnchor="middle" className="pointer-events-none" style={{ fontFamily: "ui-monospace, monospace", fontSize: 16, fill: NEON, opacity: 0.5 }}>?</text>
                                    )}
                                </g>
                            );
                        }
                        const s = scoresFor(t.placeId);
                        const min = minutes.get(t.placeId) ?? 0;
                        const pop = place.population;
                        const sigil = placeSigil(place);
                        const sigilSize = Math.min(30, t.radius * 0.8);
                        const huts = pop ?? 1; // cabanas = população (habitantes)
                        const stats = world[t.placeId];
                        const fresh = justRevealed.includes(t.placeId);
                        const lit = Boolean(state.lanterns[t.placeId]);
                        const inh = state.inhabit[t.placeId];
                        const verified = state.discoveries[t.placeId]?.verified || min > 0;
                        return (
                            <g key={t.placeId} className={`cursor-pointer ${fresh ? "atlas-reveal" : ""}`} onClick={click(() => onSelect(t.placeId))}>
                                <title>
                                    {`${place.name} — ${epithet(place)}\n${TERRAIN_INFO[s.terrain].label} · saúde ${s.health}` +
                                        `\nConteúdo: ${CONTENT_VOLUME_LABELS[contentVolumeOf(place)]}${place.contentVolume ? "" : " (estimado)"}` +
                                        `\nPopulação: ${pop ? POPULATION_LABELS[pop] : "incerta"}` +
                                        `${min ? `\nVocê: ${formatMinutes(min)}/semana` : ""}` +
                                        `${stats?.travelers ? `\nEngajamento: ${stats.travelers} viajantes${stats.lanterns ? `, ${stats.lanterns} lanternas` : ""}` : ""}`}
                                </title>
                                <path d={t.path} fill={realm.color} fillOpacity={min > 0 ? 0.3 : 0.16} stroke={realm.color} strokeWidth={isSel ? 2.6 : 1.6} filter="url(#glow)" />
                                <path d={t.path} fill={TERRAIN_PATTERN[s.terrain]} className="pointer-events-none" />
                                {fresh && <path d={t.path} fill={NEON} opacity={0.4} className="atlas-glow pointer-events-none" />}
                                {/* Sigilo central: a essência DESTE local (tamanho do território = volume de conteúdo) */}
                                <g transform={`translate(${t.center.x - sigilSize / 2},${t.center.y - sigilSize / 2 - 3})`} className="pointer-events-none">
                                    <PlaceSigilMark sigil={sigil} size={sigilSize} color="#eaf2ff" />
                                </g>
                                {/* Nós de habitantes: um ponto luminoso por ordem de grandeza de população */}
                                {Array.from({ length: huts }, (_, i) => {
                                    const spread = (huts - 1) * 8;
                                    const hx = t.center.x - spread / 2 + i * 8;
                                    const hy = t.center.y + t.radius * 0.52;
                                    return <circle key={i} cx={hx} cy={hy} r={2} fill={realm.color} filter="url(#glow)" className="pointer-events-none" />;
                                })}
                                {!pop && (
                                    <text x={t.center.x} y={t.center.y + t.radius * 0.5 + 6} textAnchor="middle" className="pointer-events-none" style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, fill: INK }}>?</text>
                                )}
                                {/* Seu farol: você habita aqui (sinal de presença) */}
                                {(min > 0 || inh) && (
                                    <g transform={`translate(${t.center.x - t.radius * 0.72},${t.center.y + t.radius * 0.32})`} className="pointer-events-none" filter="url(#glow)">
                                        <circle r="3.5" fill={NEON} />
                                        <circle r="6.5" fill="none" stroke={NEON} strokeWidth="1" opacity="0.6" />
                                    </g>
                                )}
                                {/* Pulso de engajamento (sua lanterna e contagem do mundo) */}
                                {(lit || stats?.lanterns) && (
                                    <g transform={`translate(${t.center.x + t.radius * 0.58},${t.center.y + t.radius * 0.28})`} className="pointer-events-none">
                                        <circle r="4" fill={lit ? NEON_GOLD : "none"} stroke={NEON_GOLD} strokeWidth="1.2" filter="url(#glow)" />
                                        {stats?.lanterns ? <text x="7" y="4" style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, fill: NEON_GOLD, fontWeight: 600 }}>{stats.lanterns}</text> : null}
                                    </g>
                                )}
                                {/* Selo de verificação (dados confirmados) */}
                                {verified && (
                                    <g transform={`translate(${t.center.x + t.radius * 0.62},${t.center.y - t.radius * 0.6})`} className="pointer-events-none" filter="url(#glow)">
                                        <circle r="5.5" fill="#06263a" stroke={NEON} strokeWidth="1" />
                                        <path d="M-2.5 0l1.8 1.8 3.2-3.6" stroke={NEON} strokeWidth="1.3" fill="none" />
                                    </g>
                                )}
                                <text x={t.center.x} y={t.center.y + t.radius + 12} textAnchor="middle" className="pointer-events-none" style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, fontWeight: 600, fill: "#eaf2ff", paintOrder: "stroke", stroke: PARCHMENT, strokeWidth: 3.5 }}>
                                    {place.name}
                                </text>
                                <text x={t.center.x} y={t.center.y + t.radius + 23} textAnchor="middle" className="pointer-events-none" style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 9, fill: "#8fa6cc", paintOrder: "stroke", stroke: PARCHMENT, strokeWidth: 3 }}>
                                    {epithet(place)}
                                </text>
                            </g>
                        );
                    }),
                )}

                {/* Rotas planejadas (vetores de migração) */}
                {routes.map(({ from, to }) => (
                    <path
                        key={`${from.placeId}-${to.placeId}`}
                        d={`M${from.center.x},${from.center.y} Q${(from.center.x + to.center.x) / 2},${Math.min(from.center.y, to.center.y) - 60} ${to.center.x},${to.center.y}`}
                        fill="none"
                        stroke={NEON_WARN}
                        strokeWidth={2}
                        strokeDasharray="2 7"
                        strokeLinecap="round"
                        filter="url(#glow)"
                        className="pointer-events-none"
                    />
                ))}

                {/* Retículo de orientação (HUD) */}
                <g transform="translate(110,120)" className="pointer-events-none" opacity={0.8} filter="url(#glow)">
                    <circle r="52" fill="none" stroke={NEON} strokeWidth="1" opacity="0.5" />
                    <circle r="40" fill="none" stroke={NEON} strokeWidth="0.6" opacity="0.4" />
                    {[0, 90, 180, 270].map((a) => (
                        <path key={a} d="M0 -52L4 -40L0 -34L-4 -40Z" transform={`rotate(${a})`} fill={a === 0 ? NEON_WARN : NEON} opacity={a === 0 ? 0.95 : 0.6} />
                    ))}
                    <circle r="3" fill={NEON} />
                    <text y="-58" textAnchor="middle" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fill: NEON, fontWeight: 700, letterSpacing: 1 }}>N</text>
                </g>

                {/* Painel-título (vidro escuro) */}
                <g transform="translate(1230,910)" className="pointer-events-none">
                    <rect width="300" height="64" rx="8" fill="#060b18" opacity="0.82" stroke={NEON} strokeOpacity="0.5" strokeWidth="1" />
                    <rect x="8" y="8" width="4" height="48" rx="2" fill={NEON} />
                    <text x="150" y="30" textAnchor="middle" style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 17, fill: "#eaf2ff", fontWeight: 700, letterSpacing: 3 }}>MULTIVERSO DIGITAL</text>
                    <text x="150" y="48" textAnchor="middle" style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, fill: "#8fa6cc", letterSpacing: 0.5 }}>
                        {`${discovered.size} nós mapeados · ${PLACES.length - discovered.size} sob criptografia`}
                    </text>
                </g>

                {/* ── Modo Expedição: Bruma, Marcos, rota e Cartógrafo ── */}
                {expeditionOn && expedition && (
                    <>
                        <defs>
                            <filter id="fogfeather" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="16" />
                            </filter>
                            <mask id="bruma-mask">
                                <rect x={-200} y={-200} width={WORLD_W + 400} height={WORLD_H + 400} fill="white" />
                                <g filter="url(#fogfeather)" fill="black">
                                    {[...liftedCells].map((k) => {
                                        const [c, r] = k.split(",").map(Number);
                                        return <rect key={k} x={c * FOG_CELL - 4} y={r * FOG_CELL - 4} width={FOG_CELL + 8} height={FOG_CELL + 8} />;
                                    })}
                                </g>
                            </mask>
                        </defs>
                        <rect
                            x={-200}
                            y={-200}
                            width={WORLD_W + 400}
                            height={WORLD_H + 400}
                            fill="#0a0a12"
                            opacity={0.9}
                            mask="url(#bruma-mask)"
                            className="pointer-events-none"
                        />

                        {/* Marcos: cofres de dados holográficos ainda não coletados */}
                        {marks.map((m) => {
                            const key = `${Math.floor(m.pos.x / FOG_CELL)},${Math.floor(m.pos.y / FOG_CELL)}`;
                            if (expedition.marksCollected.includes(m.id) || !liftedCells.has(key)) return null;
                            return (
                                <g key={m.id} transform={`translate(${m.pos.x},${m.pos.y})`} className="pointer-events-none" filter="url(#glow)">
                                    <path d="M0 -9 L8 0 L0 9 L-8 0 Z" fill="none" stroke={NEON_GOLD} strokeWidth="1.5" />
                                    <path d="M0 -4.5 L4 0 L0 4.5 L-4 0 Z" fill={NEON_GOLD} opacity="0.7" />
                                </g>
                            );
                        })}

                        {/* Rota planejada até o cursor (vetor de deslocamento) */}
                        {reach && hover && (
                            <g className="pointer-events-none">
                                <line x1={expedition.cartographer.x} y1={expedition.cartographer.y} x2={reach.point.x} y2={reach.point.y} stroke={NEON} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="1 7" filter="url(#glow)" />
                                {reach.truncated && (
                                    <line x1={reach.point.x} y1={reach.point.y} x2={hover.x} y2={hover.y} stroke={NEON_WARN} strokeWidth={2} strokeLinecap="round" strokeDasharray="1 7" opacity={0.85} />
                                )}
                                <circle cx={reach.point.x} cy={reach.point.y} r={6} fill="none" stroke={reach.truncated ? NEON_WARN : NEON} strokeWidth={2} filter="url(#glow)" />
                                <text x={reach.point.x + 11} y={reach.point.y - 8} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 700, fill: "#eaf2ff", paintOrder: "stroke", stroke: PARCHMENT, strokeWidth: 3.5 }}>
                                    {Math.ceil(reach.cost)} léguas
                                </text>
                            </g>
                        )}

                        {/* O Cartógrafo: uma sonda luminosa */}
                        <g transform={`translate(${expedition.cartographer.x},${expedition.cartographer.y})`} className="pointer-events-none" filter="url(#glow)">
                            <circle r="12" fill="none" stroke={NEON} strokeWidth="1" opacity="0.4" />
                            <path d="M0 -10 L7 7 L0 3 L-7 7 Z" fill={NEON} stroke="#eaf2ff" strokeWidth="1" />
                            <circle cx="0" cy="0" r="2.2" fill="#02121a" />
                        </g>

                        {/* Captura de cliques: no modo expedição, clicar move o Cartógrafo */}
                        <rect
                            x={-200}
                            y={-200}
                            width={WORLD_W + 400}
                            height={WORLD_H + 400}
                            fill="transparent"
                            onClick={handleMapClick}
                            style={{ cursor: "crosshair" }}
                        />
                    </>
                )}

                <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#vignette)" className="pointer-events-none" />
            </svg>

            <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border border-[#1e2c4a] bg-[#070d1c]/90 text-[#aec6ff] shadow-sm backdrop-blur">
                <button onClick={() => zoom(1 / 1.3)} className="p-2 hover:bg-[#13213d]" aria-label="Aproximar"><Plus className="h-4 w-4" /></button>
                <button onClick={() => zoom(1.3)} className="p-2 hover:bg-[#13213d]" aria-label="Afastar"><Minus className="h-4 w-4" /></button>
                <button onClick={() => setView({ x: 0, y: 0, w: WORLD_W, h: WORLD_H })} className="p-2 hover:bg-[#13213d]" aria-label="Ver mundo inteiro"><Maximize2 className="h-4 w-4" /></button>
            </div>

            <MapLegend />
        </div>
    );
}

function MapLegend() {
    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#1b2742] bg-[#070d1c] px-4 py-2.5 text-xs text-[#9fb4da]">
            <span className="flex items-center gap-1.5">
                <svg width="18" height="14"><rect width="18" height="14" fill="url(#legend-hatch)" /><defs><pattern id="legend-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="5" height="5" fill="#070b18" /><path d="M0 0V5" stroke={NEON} strokeOpacity="0.4" /></pattern></defs></svg>
                Criptografado = não explorado
            </span>
            <span className="flex items-center gap-1.5"><PlaceSigilMark sigil="shield" size={15} color="#9fb4da" /> Sigilo = essência do local</span>
            <span className="flex items-center gap-1.5"><svg width="26" height="14"><circle cx="7" cy="7" r="5" fill="none" stroke={NEON} /><circle cx="19" cy="7" r="2.5" fill="none" stroke={NEON} /></svg> Tamanho = volume de conteúdo</span>
            <span className="flex items-center gap-1.5"><svg width="24" height="12"><circle cx="3" cy="6" r="2" fill={NEON} /><circle cx="11" cy="6" r="2" fill={NEON} /><circle cx="19" cy="6" r="2" fill={NEON} /></svg> Nós = população</span>
            <span className="flex items-center gap-1.5"><svg width="14" height="14"><circle cx="7" cy="7" r="3.5" fill={NEON} /><circle cx="7" cy="7" r="6" fill="none" stroke={NEON} opacity="0.6" /></svg> Você habita</span>
            <span className="flex items-center gap-1.5"><svg width="14" height="14"><circle cx="7" cy="7" r="4" fill={NEON_GOLD} /></svg> Engajamento</span>
            <span className="flex items-center gap-1.5"><svg width="12" height="12"><circle cx="6" cy="6" r="5.5" fill="#06263a" stroke={NEON} /></svg> Verificado</span>
            <span className="flex items-center gap-1.5"><span className="font-bold text-[#5fe3ff]">❝</span> Sinal de caravana</span>
            {(Object.keys(TERRAIN_INFO) as Terrain[]).map((t) => (
                <span key={t} className="flex items-center gap-1" title={TERRAIN_INFO[t].description}>
                    <svg width="18" height="12"><rect width="18" height="12" fill="#0a1024" /><rect width="18" height="12" fill={TERRAIN_PATTERN[t]} /></svg>
                    {TERRAIN_INFO[t].label}
                </span>
            ))}
        </div>
    );
}
