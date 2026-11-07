"use client";

import { X } from "lucide-react";
import { CATALOG_REVISION, CATEGORY_BY_ID, PLACE_BY_ID } from "@/app/lib/atlas/catalog";
import { QUALITY_LABELS, formatMinutes } from "@/app/lib/atlas/metrics";
import { alternativesFor } from "@/app/lib/atlas/multiverse";
import { attributeHighlights, scoresFor, TERRAIN_INFO } from "@/app/lib/atlas/scoring";
import type { AtlasState, EffectiveUsage, RouteDecision } from "@/app/lib/atlas/types";
import { ScoreBars, TerrainBadge } from "./ui";

const DECISIONS: { id: RouteDecision; label: string; help: string }[] = [
    { id: "stay", label: "Permanecer", help: "Este lugar me faz bem como está." },
    { id: "reduce", label: "Reduzir", help: "Quero passar metade do tempo aqui." },
    { id: "leave", label: "Migrar", help: "Quero sair daqui e levar meu tempo para outro lugar." },
    { id: "explore", label: "Explorar", help: "Quero conhecer melhor antes de decidir." },
];

export function PlaceDrawer({
    placeId,
    usage,
    state,
    onClose,
    onDecide,
    onToggleExplored,
    onSelect,
}: {
    placeId: string;
    usage: EffectiveUsage[];
    state: AtlasState;
    onClose: () => void;
    onDecide: (placeId: string, d: RouteDecision | null, target?: string) => void;
    onToggleExplored: (placeId: string) => void;
    onSelect: (placeId: string) => void;
}) {
    const place = PLACE_BY_ID[placeId];
    if (!place) return null;
    const scores = scoresFor(placeId);
    const u = usage.find((x) => x.placeId === placeId);
    const cat = CATEGORY_BY_ID[place.category];
    const decision = state.decisions[placeId];
    const alts = alternativesFor(placeId);
    const highlights = attributeHighlights(place);

    return (
        <aside className="fixed inset-y-0 right-0 z-[120] flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-gray-100 p-5">
                <div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: cat.color }} />
                        {cat.name} · {cat.metaphor}
                    </div>
                    <h2 className="mt-1 font-serif text-2xl text-gray-900">{place.name}</h2>
                    <p className="text-sm text-gray-600">{place.tagline}</p>
                </div>
                <button onClick={onClose} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Fechar">
                    <X className="h-4 w-4" />
                </button>
            </header>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
                <div className="flex flex-wrap items-center gap-2">
                    <TerrainBadge terrain={scores.terrain} />
                    <span className="text-sm text-gray-700">
                        Saúde <strong className="tabular-nums">{scores.health}</strong>/100
                    </span>
                    {place.origin && <span className="text-xs text-gray-500">· sede: {place.origin}</span>}
                </div>
                <p className="-mt-3 text-xs text-gray-500">{TERRAIN_INFO[scores.terrain].description}</p>

                <div className="rounded-xl bg-gray-50 p-4">
                    {u ? (
                        <div className="text-sm text-gray-700">
                            Você passa <strong>{formatMinutes(u.weeklyMinutes)}</strong> por semana aqui
                            <span className="text-gray-500"> · dado {QUALITY_LABELS[u.quality].toLowerCase()}</span>
                        </div>
                    ) : (
                        <div className="text-sm text-gray-600">Sem tempo registrado neste lugar.</div>
                    )}
                    <button
                        onClick={() => onToggleExplored(placeId)}
                        className="mt-2 text-xs font-medium text-gray-900 underline underline-offset-2"
                    >
                        {state.explored[placeId] ? "Desmarcar como explorado" : "Marcar como explorado / já visitei"}
                    </button>
                </div>

                <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-900">Qualificação</h3>
                    <ScoreBars scores={scores} />
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                        {highlights.map((h) => (
                            <li
                                key={h.text}
                                className={`rounded-full px-2 py-0.5 text-xs ${
                                    h.positive ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                                }`}
                            >
                                {h.positive ? "+" : "−"} {h.text}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
                        Derivado de atributos observáveis (curadoria {CATALOG_REVISION}). Confiança dos
                        dados: {Math.round(scores.confidence * 100)}%.
                        {place.notes && <> Nota: {place.notes}</>}
                    </p>
                </div>

                <div>
                    <h3 className="mb-1 text-sm font-semibold text-gray-900">Sua rota</h3>
                    <p className="mb-3 text-xs text-gray-500">Decidir também é explorar. Vale XP — e o mapa simula o efeito.</p>
                    <div className="grid grid-cols-2 gap-2">
                        {DECISIONS.map((d) => {
                            const active = decision?.decision === d.id;
                            return (
                                <button
                                    key={d.id}
                                    title={d.help}
                                    onClick={() => onDecide(placeId, active ? null : d.id, active ? undefined : decision?.target)}
                                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                                        active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 hover:border-gray-400"
                                    }`}
                                >
                                    <div className="font-medium">{d.label}</div>
                                    <div className={`text-[11px] ${active ? "text-gray-300" : "text-gray-500"}`}>{d.help}</div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <h3 className="mb-1 text-sm font-semibold text-gray-900">Outros mundos {cat.prep} {cat.name}</h3>
                    {alts.length === 0 ? (
                        <p className="text-sm text-gray-500">
                            Este já é um dos lugares mais bem qualificados do bairro no catálogo atual.
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {alts.map((alt) => {
                                const isTarget = decision?.target === alt.place.id;
                                return (
                                    <li key={alt.place.id} className="rounded-xl border border-gray-200 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <button onClick={() => onSelect(alt.place.id)} className="text-left font-medium text-gray-900 hover:underline">
                                                {alt.place.name}
                                            </button>
                                            <span className="text-xs font-medium text-green-700">+{alt.healthGain} saúde</span>
                                        </div>
                                        <div className="mt-1 text-xs text-gray-600">{alt.reasons.join(" · ")}</div>
                                        <button
                                            onClick={() =>
                                                onDecide(
                                                    placeId,
                                                    decision && decision.decision !== "stay" ? decision.decision : "leave",
                                                    isTarget ? undefined : alt.place.id,
                                                )
                                            }
                                            className={`mt-2 rounded-md px-2.5 py-1 text-xs font-medium ${
                                                isTarget ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                                            }`}
                                        >
                                            {isTarget ? "✓ Destino da rota" : "Traçar rota para cá"}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </aside>
    );
}
