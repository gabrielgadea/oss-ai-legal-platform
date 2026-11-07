"use client";

import { Compass } from "lucide-react";
import { PLACES, PLACE_BY_ID } from "@/app/lib/atlas/catalog";
import { formatMinutes, type AtlasMetrics } from "@/app/lib/atlas/metrics";
import { scoresFor } from "@/app/lib/atlas/scoring";
import type { AtlasState, CategoryId } from "@/app/lib/atlas/types";
import { REALMS, epithet, randomExpedition } from "@/app/lib/atlas/world";
import { EmptyHint, Section, StatTile, TerrainBadge } from "./ui";
import { EssenceGlyph } from "./WorldMap";

const DECISION_LABEL = { stay: "Permanecer", reduce: "Reduzir", leave: "Migrar", explore: "Explorar" } as const;

export function JournalPanel({
    state,
    discovered,
    realms,
    metrics,
    projectedMetrics,
    onSelect,
    onExpedition,
}: {
    state: AtlasState;
    discovered: Set<string>;
    realms: Set<CategoryId>;
    metrics: AtlasMetrics;
    projectedMetrics: AtlasMetrics;
    onSelect: (placeId: string) => void;
    onExpedition: (placeId: string) => void;
}) {
    const decisions = Object.entries(state.decisions).filter(([id]) => discovered.has(id));
    const undiscovered = PLACES.filter((p) => !discovered.has(p.id));
    const delta = (a: number, b: number) => b - a;

    const chance = () => {
        const target = randomExpedition(discovered, Date.now());
        if (target) onExpedition(target);
    };

    return (
        <div className="space-y-6">
            <section className="flex flex-col items-start gap-4 rounded-2xl border border-[#d8c9a3] bg-[#f8f1df] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="font-serif text-2xl text-[#2b2216]">Bússola do acaso</h2>
                    <p className="text-sm text-[#5b4a32]">
                        {undiscovered.length
                            ? `Aponta para um dos ${undiscovered.length} territórios que você nunca viu — de preferência num reino inteiramente novo.`
                            : "Você revelou todo o catálogo. O multiverso, porém, é maior que qualquer mapa."}
                    </p>
                </div>
                <button onClick={chance} disabled={!undiscovered.length} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#2b2216] px-4 py-2 text-sm font-medium text-[#f3e9d2] disabled:opacity-40">
                    <Compass className="h-4 w-4" /> Girar a bússola
                </button>
            </section>

            <Section title="Rota planejada" subtitle="Simulação: como ficaria seu território se você seguisse as decisões que tomou.">
                {decisions.length === 0 ? (
                    <EmptyHint>Clique num território revelado e escolha Permanecer, Reduzir, Migrar ou Explorar.</EmptyHint>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <StatTile label="Atenção saudável" value={String(projectedMetrics.healthyAttention)} delta={{ value: delta(metrics.healthyAttention, projectedMetrics.healthyAttention), goodWhenPositive: true }} />
                            <StatTile label="Diversidade" value={String(projectedMetrics.diversity)} delta={{ value: delta(metrics.diversity, projectedMetrics.diversity), goodWhenPositive: true }} />
                            <StatTile label="Tempo em labirintos" value={`${projectedMetrics.labyrinthShare}%`} delta={{ value: delta(metrics.labyrinthShare, projectedMetrics.labyrinthShare), goodWhenPositive: false }} />
                            <StatTile label="Tempo semanal" value={formatMinutes(projectedMetrics.totalWeeklyMinutes)} />
                        </div>
                        <ul className="mt-4 divide-y divide-gray-100 text-sm">
                            {decisions.map(([id, d]) => (
                                <li key={id} className="flex items-center justify-between py-2">
                                    <button onClick={() => onSelect(id)} className="font-medium text-gray-900 hover:underline">{PLACE_BY_ID[id]?.name}</button>
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

            <Section title="Códice" subtitle="Só entra aqui o que você revelou. O resto continua sob a hachura — de propósito.">
                <div className="space-y-5">
                    {REALMS.map((realm) => {
                        const known = realms.has(realm.id);
                        const places = PLACES.filter((p) => p.category === realm.id);
                        const found = places.filter((p) => discovered.has(p.id));
                        return (
                            <div key={realm.id} className="rounded-xl border border-gray-200">
                                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                        {known ? <EssenceGlyph realm={realm.id} size={18} /> : <span className="font-serif text-lg text-gray-400">?</span>}
                                        <span className="font-serif text-lg text-gray-900">{known ? realm.name : "Terra Incógnita"}</span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {known ? `${found.length} revelados · ${places.length - found.length} sob hachura` : "número de territórios desconhecido"}
                                    </span>
                                </div>
                                {known && (
                                    <ul className="divide-y divide-gray-50">
                                        {found
                                            .sort((a, b) => scoresFor(b.id).health - scoresFor(a.id).health)
                                            .map((p) => (
                                                <li key={p.id}>
                                                    <button onClick={() => onSelect(p.id)} className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-gray-50">
                                                        <span>
                                                            <span className="font-medium text-gray-900">{p.name}</span>
                                                            <span className="ml-2 font-serif text-sm italic text-gray-500">{epithet(p)}</span>
                                                        </span>
                                                        <span className="flex items-center gap-2">
                                                            {state.lanterns[p.id] && <span title="Lanterna acesa">🏮</span>}
                                                            <TerrainBadge terrain={scoresFor(p.id).terrain} size="xs" />
                                                            <span className="w-8 text-right text-sm font-semibold tabular-nums">{scoresFor(p.id).health}</span>
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </div>
            </Section>
        </div>
    );
}
