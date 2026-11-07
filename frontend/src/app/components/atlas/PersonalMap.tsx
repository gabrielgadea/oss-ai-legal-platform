"use client";

import { useMemo } from "react";
import { CATEGORIES, PLACES, PLACE_BY_ID } from "@/app/lib/atlas/catalog";
import { formatMinutes } from "@/app/lib/atlas/metrics";
import { unexploredByCategory } from "@/app/lib/atlas/multiverse";
import { scoresFor, TERRAIN_INFO } from "@/app/lib/atlas/scoring";
import type { AtlasState, EffectiveUsage, Terrain } from "@/app/lib/atlas/types";

const W = 1000;
const H = 620;
const DISTRICT_R = 95;

/** Padrão de traço por terreno: o status nunca depende só da cor. */
const TERRAIN_DASH: Record<Terrain, string | undefined> = {
    clareira: undefined,
    trilha: "5 3",
    labirinto: "1.5 2.5",
};

interface Node {
    id: string;
    x: number;
    y: number;
    r: number;
    minutes: number;
    status: "used" | "explored" | "fog";
    terrain: Terrain;
    color: string;
    name: string;
}

/**
 * Relaxação determinística: afasta nós sobrepostos (reservando espaço para o
 * rótulo abaixo dos nós nomeados) e os mantém dentro do bairro.
 */
function relax(nodes: Node[], center: { x: number; y: number }) {
    const labeled = (n: Node) => n.status !== "fog";
    for (let iter = 0; iter < 160; iter++) {
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i];
                const b = nodes[j];
                const pad = labeled(a) && labeled(b) ? 26 : labeled(a) || labeled(b) ? 12 : 3;
                const min = a.r + b.r + pad;
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let d = Math.hypot(dx, dy);
                if (d >= min) continue;
                if (d < 0.01) {
                    dx = Math.cos(i + j);
                    dy = Math.sin(i + j);
                    d = 1;
                }
                // nós usados (maiores) se movem menos que os da névoa
                const wa = a.status === "fog" ? 0.8 : b.status === "fog" ? 0.2 : 0.5;
                const push = (min - d) / d;
                a.x -= dx * push * wa;
                a.y -= dy * push * wa;
                b.x += dx * push * (1 - wa);
                b.y += dy * push * (1 - wa);
            }
        }
        for (const n of nodes) {
            const dx = n.x - center.x;
            const dy = n.y - center.y;
            const d = Math.hypot(dx, dy);
            const maxD = DISTRICT_R - n.r - (labeled(n) ? 16 : 6);
            if (d > maxD) {
                n.x = center.x + (dx / d) * maxD;
                n.y = center.y + (dy / d) * maxD;
            }
        }
    }
}

export function PersonalMap({
    usage,
    state,
    selected,
    onSelect,
    onOpenMultiverse,
}: {
    usage: EffectiveUsage[];
    state: AtlasState;
    selected: string | null;
    onSelect: (placeId: string) => void;
    onOpenMultiverse: () => void;
}) {
    const minutesById = useMemo(() => new Map(usage.map((u) => [u.placeId, u.weeklyMinutes])), [usage]);
    const exploredIds = useMemo(
        () => [...new Set([...usage.map((u) => u.placeId), ...Object.keys(state.explored)])],
        [usage, state.explored],
    );
    const fogCount = unexploredByCategory(exploredIds);
    const youAreHere = usage[0]?.placeId;

    const nodes = useMemo(() => {
        const out: Node[] = [];
        for (const cat of CATEGORIES) {
            const places = PLACES.filter((p) => p.category === cat.id).sort(
                (a, b) => (minutesById.get(b.id) ?? 0) - (minutesById.get(a.id) ?? 0),
            );
            const group: Node[] = places.map((p, i) => {
                const radius = i === 0 ? 0 : 30 * Math.sqrt(i + 0.3);
                const angle = i * 2.399963 - Math.PI / 2;
                const minutes = minutesById.get(p.id) ?? 0;
                const status: Node["status"] =
                    minutes > 0 ? "used" : state.explored[p.id] ? "explored" : "fog";
                return {
                    id: p.id,
                    x: cat.center.x + radius * Math.cos(angle),
                    y: cat.center.y + radius * Math.sin(angle),
                    r: status === "used" ? Math.min(24, 5 + Math.sqrt(minutes) * 0.8) : status === "explored" ? 6 : 3,
                    minutes,
                    status,
                    terrain: scoresFor(p.id).terrain,
                    color: cat.color,
                    name: p.name,
                };
            });
            relax(group, cat.center);
            out.push(...group);
        }
        return out;
    }, [minutesById, state.explored]);

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const routes = Object.entries(state.decisions)
        .filter(([, d]) => d.target && nodeById.has(d.target))
        .map(([from, d]) => ({ from: nodeById.get(from)!, to: nodeById.get(d.target!)!, decision: d.decision }))
        .filter((r) => r.from);
    const totalFog = Object.values(fogCount).reduce((a, b) => a + b, 0);

    return (
        <div className="relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-[#fbfaf7]">
            <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[760px] md:min-w-0" role="img" aria-label="Mapa da sua atividade digital">
                <defs>
                    <pattern id="atlas-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M40 0H0V40" fill="none" stroke="#ece9e1" strokeWidth="1" />
                    </pattern>
                    <radialGradient id="atlas-fog">
                        <stop offset="0%" stopColor="#e7e5df" stopOpacity="0.92" />
                        <stop offset="80%" stopColor="#efede8" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#f4f2ee" stopOpacity="0.4" />
                    </radialGradient>
                    <marker id="atlas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                        <path d="M0 0L10 5L0 10z" fill="#111827" />
                    </marker>
                </defs>
                <rect width={W} height={H} fill="url(#atlas-grid)" />

                {/* Bairros */}
                {CATEGORIES.map((cat) => {
                    const hasPresence = nodes.some((n) => n.status !== "fog" && PLACE_BY_ID[n.id].category === cat.id);
                    return (
                        <g key={cat.id}>
                            <circle cx={cat.center.x} cy={cat.center.y} r={DISTRICT_R} fill={cat.color} fillOpacity={hasPresence ? 0.08 : 0.03} stroke={cat.color} strokeOpacity={0.35} strokeDasharray={hasPresence ? undefined : "4 4"} />
                            <text x={cat.center.x} y={cat.center.y - DISTRICT_R - 10} textAnchor="middle" className="fill-gray-900" style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-eb-garamond), serif" }}>
                                {cat.name}
                            </text>
                            <text x={cat.center.x} y={cat.center.y - DISTRICT_R + 4} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 10 }}>
                                {cat.metaphor}
                            </text>
                        </g>
                    );
                })}

                {/* Rotas planejadas */}
                {routes.map(({ from, to, decision }) => {
                    const mx = (from.x + to.x) / 2;
                    const my = (from.y + to.y) / 2 - 40;
                    return (
                        <path key={`${from.id}-${to.id}`} d={`M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}`} fill="none" stroke="#111827" strokeWidth={decision === "leave" ? 2 : 1.5} strokeDasharray="6 4" markerEnd="url(#atlas-arrow)" opacity={0.75} />
                    );
                })}

                {/* Lugares */}
                {nodes.map((n) => {
                    const isSel = selected === n.id;
                    const t = TERRAIN_INFO[n.terrain];
                    const label = `${n.name} — ${t.label}${n.minutes ? ` · ${formatMinutes(n.minutes)}/semana` : n.status === "fog" ? " · ainda não explorado" : " · explorado"}`;
                    return (
                        <g key={n.id} onClick={() => onSelect(n.id)} className="cursor-pointer" role="button" aria-label={label}>
                            <title>{label}</title>
                            {/* alvo de clique maior que a marca */}
                            <circle cx={n.x} cy={n.y} r={Math.max(n.r + 6, 12)} fill="transparent" />
                            {n.status === "fog" ? (
                                <circle cx={n.x} cy={n.y} r={n.r} fill="#a8a29e" opacity={0.5} />
                            ) : (
                                <circle
                                    cx={n.x}
                                    cy={n.y}
                                    r={n.r}
                                    fill={n.status === "used" ? n.color : "#fff"}
                                    fillOpacity={n.status === "used" ? 0.85 : 1}
                                    stroke={t.color}
                                    strokeWidth={2.5}
                                    strokeDasharray={TERRAIN_DASH[n.terrain]}
                                />
                            )}
                            {isSel && <circle cx={n.x} cy={n.y} r={n.r + 5} fill="none" stroke="#111827" strokeWidth={1.5} />}
                            {n.status !== "fog" && (
                                <text x={n.x} y={n.y + n.r + 12} textAnchor="middle" className="pointer-events-none fill-gray-800" style={{ fontSize: 10.5, fontWeight: 500, paintOrder: "stroke", stroke: "#fbfaf7", strokeWidth: 3 }}>
                                    {n.name}
                                </text>
                            )}
                        </g>
                    );
                })}

                {/* Névoa sobre bairros sem presença */}
                {CATEGORIES.map((cat) => {
                    const hasPresence = nodes.some((n) => n.status !== "fog" && PLACE_BY_ID[n.id].category === cat.id);
                    if (hasPresence) return null;
                    return (
                        <g key={`fog-${cat.id}`} className="pointer-events-none">
                            <circle cx={cat.center.x} cy={cat.center.y} r={DISTRICT_R - 4} fill="url(#atlas-fog)" />
                            <text x={cat.center.x} y={cat.center.y - 2} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 12, fontWeight: 600 }}>
                                Névoa
                            </text>
                            <text x={cat.center.x} y={cat.center.y + 14} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 10 }}>
                                {fogCount[cat.id]} lugares por descobrir
                            </text>
                        </g>
                    );
                })}

                {/* Você está aqui */}
                {youAreHere && nodeById.get(youAreHere) && (
                    <g className="pointer-events-none" transform={`translate(${nodeById.get(youAreHere)!.x},${nodeById.get(youAreHere)!.y - nodeById.get(youAreHere)!.r - 4})`}>
                        <path d="M0 0 L-7 -12 A8 8 0 1 1 7 -12 Z" fill="#111827" />
                        <circle cx="0" cy="-15" r="3" fill="#fff" />
                    </g>
                )}
            </svg>
            </div>

            {/* Portal para o multiverso */}
            <button
                onClick={onOpenMultiverse}
                className="m-3 rounded-full md:absolute md:bottom-14 md:right-3 md:m-0 border border-gray-300 bg-white/90 px-4 py-2 text-xs font-medium text-gray-800 shadow-sm backdrop-blur hover:bg-white"
            >
                ✦ Multiverso: {totalFog} lugares fora do seu mapa →
            </button>

            {/* Legenda */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gray-200 bg-white px-4 py-2.5 text-xs text-gray-600">
                <span className="flex items-center gap-1.5">
                    <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="#9ca3af" /></svg>
                    Tamanho = tempo semanal
                </span>
                {(Object.keys(TERRAIN_INFO) as Terrain[]).map((t) => (
                    <span key={t} className="flex items-center gap-1.5" title={TERRAIN_INFO[t].description}>
                        <svg width="16" height="16">
                            <circle cx="8" cy="8" r="5.5" fill="#fff" stroke={TERRAIN_INFO[t].color} strokeWidth="2.5" strokeDasharray={TERRAIN_DASH[t]} />
                        </svg>
                        {TERRAIN_INFO[t].label}
                    </span>
                ))}
                <span className="flex items-center gap-1.5">
                    <svg width="14" height="14"><circle cx="7" cy="7" r="3" fill="#a8a29e" opacity="0.6" /></svg>
                    Não explorado
                </span>
                <span className="flex items-center gap-1.5">
                    <svg width="22" height="10"><path d="M1 5H21" stroke="#111827" strokeDasharray="4 3" strokeWidth="1.5" /></svg>
                    Rota planejada
                </span>
            </div>
        </div>
    );
}
