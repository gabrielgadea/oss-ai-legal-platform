"use client";

import { useMemo, useState } from "react";
import { Shuffle } from "lucide-react";
import { CATEGORIES, CATEGORY_BY_ID, PLACES, PLACE_BY_ID } from "@/app/lib/atlas/catalog";
import { track } from "@/app/lib/atlas/analytics";
import { formatMinutes, type AtlasMetrics } from "@/app/lib/atlas/metrics";
import { portals } from "@/app/lib/atlas/multiverse";
import { scoresFor, TERRAIN_INFO } from "@/app/lib/atlas/scoring";
import type { AtlasState, CategoryId, EffectiveUsage, Terrain } from "@/app/lib/atlas/types";
import { EmptyHint, Section, StatTile, TerrainBadge } from "./ui";

const DECISION_LABEL = { stay: "Permanecer", reduce: "Reduzir", leave: "Migrar", explore: "Explorar" } as const;

export function MultiversePanel({
    state,
    usage,
    metrics,
    projectedMetrics,
    onSelect,
}: {
    state: AtlasState;
    usage: EffectiveUsage[];
    metrics: AtlasMetrics;
    projectedMetrics: AtlasMetrics;
    onSelect: (placeId: string) => void;
}) {
    const [seed, setSeed] = useState(() => Math.floor(Date.now() / 86_400_000));
    const [cat, setCat] = useState<CategoryId | "all">("all");
    const [terrain, setTerrain] = useState<Terrain | "all">("all");
    const [onlyUnexplored, setOnlyUnexplored] = useState(false);

    const exploredIds = useMemo(
        () => [...new Set([...usage.map((u) => u.placeId), ...Object.keys(state.explored)])],
        [usage, state.explored],
    );
    const explored = new Set(exploredIds);
    const portalPlaces = portals(exploredIds, seed);
    const decisions = Object.entries(state.decisions);

    const catalog = PLACES.filter(
        (p) =>
            (cat === "all" || p.category === cat) &&
            (terrain === "all" || scoresFor(p.id).terrain === terrain) &&
            (!onlyUnexplored || !explored.has(p.id)),
    ).sort((a, b) => scoresFor(b.id).health - scoresFor(a.id).health);

    const delta = (a: number, b: number) => b - a;

    return (
        <div className="space-y-6">
            <Section
                title="Rota planejada"
                subtitle="Simulação: como ficaria seu mapa se você seguisse as decisões que tomou."
            >
                {decisions.length === 0 ? (
                    <EmptyHint>Clique em um lugar no mapa e escolha Permanecer, Reduzir, Migrar ou Explorar.</EmptyHint>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <StatTile label="Atenção saudável" value={String(projectedMetrics.healthyAttention)} delta={{ value: delta(metrics.healthyAttention, projectedMetrics.healthyAttention), goodWhenPositive: true }} />
                            <StatTile label="Diversidade" value={String(projectedMetrics.diversity)} delta={{ value: delta(metrics.diversity, projectedMetrics.diversity), goodWhenPositive: true }} />
                            <StatTile label="Tempo em labirintos" value={`${projectedMetrics.labyrinthShare}%`} delta={{ value: delta(metrics.labyrinthShare, projectedMetrics.labyrinthShare), goodWhenPositive: false }} />
                            <StatTile label="Tempo semanal" value={formatMinutes(projectedMetrics.totalWeeklyMinutes)} delta={{ value: Math.round(delta(metrics.totalWeeklyMinutes, projectedMetrics.totalWeeklyMinutes) / 60), goodWhenPositive: false }} hint="Variação em horas" />
                        </div>
                        <ul className="mt-4 divide-y divide-gray-100 text-sm">
                            {decisions.map(([id, d]) => (
                                <li key={id} className="flex items-center justify-between py-2">
                                    <button onClick={() => onSelect(id)} className="font-medium text-gray-900 hover:underline">
                                        {PLACE_BY_ID[id]?.name}
                                    </button>
                                    <span className="text-gray-600">
                                        {DECISION_LABEL[d.decision]}
                                        {d.target && <> → <strong>{PLACE_BY_ID[d.target]?.name}</strong></>}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </Section>

            <Section
                title="Portais"
                subtitle="Lugares bem qualificados em bairros que você pouco visita. Gire para revelar outros mundos."
                action={
                    <button
                        onClick={() => {
                            setSeed((s) => s + 1);
                            track("portal_spun");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
                    >
                        <Shuffle className="h-4 w-4" /> Girar
                    </button>
                }
            >
                <div className="grid gap-3 md:grid-cols-3">
                    {portalPlaces.map((p) => {
                        const c = CATEGORY_BY_ID[p.category];
                        return (
                            <button key={p.id} onClick={() => onSelect(p.id)} className="rounded-xl border border-gray-200 p-4 text-left transition-shadow hover:shadow-md">
                                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} /> {c.name}
                                </div>
                                <div className="mt-1 font-serif text-xl text-gray-900">{p.name}</div>
                                <div className="mt-1 text-sm text-gray-600">{p.tagline}</div>
                                <div className="mt-3"><TerrainBadge terrain={scoresFor(p.id).terrain} /></div>
                            </button>
                        );
                    })}
                </div>
            </Section>

            <Section title="Catálogo do multiverso" subtitle={`${PLACES.length} lugares catalogados — e o multiverso é maior que qualquer catálogo.`}>
                <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                    <select value={cat} onChange={(e) => setCat(e.target.value as CategoryId | "all")} className="rounded-lg border border-gray-300 px-2 py-1.5">
                        <option value="all">Todos os bairros</option>
                        {CATEGORIES.map((c) => (
                            <option key={c.id} value={c.id}>{c.name} — {c.metaphor}</option>
                        ))}
                    </select>
                    <select value={terrain} onChange={(e) => setTerrain(e.target.value as Terrain | "all")} className="rounded-lg border border-gray-300 px-2 py-1.5">
                        <option value="all">Todos os terrenos</option>
                        {(Object.keys(TERRAIN_INFO) as Terrain[]).map((t) => (
                            <option key={t} value={t}>{TERRAIN_INFO[t].label}</option>
                        ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-gray-700">
                        <input type="checkbox" checked={onlyUnexplored} onChange={(e) => setOnlyUnexplored(e.target.checked)} />
                        Só não explorados
                    </label>
                    <span className="ml-auto text-xs text-gray-500">{catalog.length} lugares</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                                <th className="py-2 pr-3 font-medium">Lugar</th>
                                <th className="py-2 pr-3 font-medium">Bairro</th>
                                <th className="py-2 pr-3 font-medium">Terreno</th>
                                <th className="py-2 pr-3 text-right font-medium">Saúde</th>
                                <th className="py-2 pr-3 text-right font-medium">Privac.</th>
                                <th className="py-2 pr-3 text-right font-medium">Atenção</th>
                                <th className="py-2 pr-3 text-right font-medium">Autonomia</th>
                                <th className="py-2 text-right font-medium">Abertura</th>
                            </tr>
                        </thead>
                        <tbody>
                            {catalog.map((p) => {
                                const s = scoresFor(p.id);
                                return (
                                    <tr key={p.id} onClick={() => onSelect(p.id)} className="cursor-pointer border-b border-gray-100 hover:bg-gray-50">
                                        <td className="py-2 pr-3 font-medium text-gray-900">
                                            {p.name} {explored.has(p.id) && <span className="text-xs text-gray-400">· no seu mapa</span>}
                                        </td>
                                        <td className="py-2 pr-3 text-gray-600">{CATEGORY_BY_ID[p.category].name}</td>
                                        <td className="py-2 pr-3"><TerrainBadge terrain={s.terrain} size="xs" /></td>
                                        <td className="py-2 pr-3 text-right font-semibold tabular-nums">{s.health}</td>
                                        <td className="py-2 pr-3 text-right tabular-nums text-gray-600">{s.privacy}</td>
                                        <td className="py-2 pr-3 text-right tabular-nums text-gray-600">{s.attention}</td>
                                        <td className="py-2 pr-3 text-right tabular-nums text-gray-600">{s.agency}</td>
                                        <td className="py-2 text-right tabular-nums text-gray-600">{s.openness}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Section>
        </div>
    );
}
