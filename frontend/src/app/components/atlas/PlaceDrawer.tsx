"use client";

import { Compass, Flame, Share2, Users, X } from "lucide-react";
import type { AtlasWorldStats } from "@/app/lib/mikeApi";
import { CATALOG_REVISION, CONTENT_VOLUME_LABELS, PLACE_BY_ID, POPULATION_LABELS } from "@/app/lib/atlas/catalog";
import { QUALITY_LABELS, formatMinutes } from "@/app/lib/atlas/metrics";
import { alternativesFor } from "@/app/lib/atlas/multiverse";
import { attributeHighlights, scoresFor, TERRAIN_INFO } from "@/app/lib/atlas/scoring";
import type { AtlasState, CategoryId, EffectiveUsage, RouteDecision } from "@/app/lib/atlas/types";
import {
    REALM_BY_ID,
    SIGIL_MEANING,
    TERRAIN_BIOME,
    VOCAB,
    contentVolumeOf,
    epithet,
    hiddenBetterAlternatives,
    placeSigil,
    visibilityOf,
} from "@/app/lib/atlas/world";
import { EssenceGlyph, PlaceSigilMark } from "./WorldMap";
import { ScoreBars, TerrainBadge } from "./ui";

const DECISIONS: { id: RouteDecision; label: string; help: string }[] = [
    { id: "stay", label: "Permanecer", help: "Este território me faz bem como está." },
    { id: "reduce", label: "Reduzir", help: "Quero passar metade do tempo aqui." },
    { id: "leave", label: "Migrar", help: "Quero sair e levar meu tempo para outro lugar." },
    { id: "explore", label: "Explorar", help: "Quero conhecer melhor antes de decidir." },
];

interface Props {
    placeId: string;
    usage: EffectiveUsage[];
    state: AtlasState;
    discovered: Set<string>;
    realms: Set<CategoryId>;
    world: Record<string, AtlasWorldStats>;
    rumors: Record<string, string[]>;
    onClose: () => void;
    onDecide: (placeId: string, d: RouteDecision | null, target?: string) => void;
    onSelect: (placeId: string) => void;
    onExpedition: (placeId: string) => void;
    onLantern: (placeId: string) => void;
    onEcho: (placeId: string) => void;
}

const fmtCount = (n: number | null | undefined) => (n ? String(n) : "poucos");

export function PlaceDrawer(props: Props) {
    const { placeId, usage, state, discovered, realms, world, rumors, onClose, onDecide, onSelect, onExpedition, onLantern, onEcho } = props;
    const place = PLACE_BY_ID[placeId];
    if (!place) return null;
    const realm = REALM_BY_ID[place.category];
    const vis = visibilityOf(placeId, discovered, realms);

    // ── Território ainda sob hachura: nada de nomes ou reputações ──────────
    if (vis !== "discovered") {
        const rumor = rumors[placeId];
        return (
            <aside className="fixed inset-y-0 right-0 z-[120] flex w-full max-w-md flex-col border-l border-[#d8c9a3] bg-[#f8f1df] shadow-2xl">
                <header className="flex items-start justify-between border-b border-[#d8c9a3] p-5">
                    <div>
                        <div className="text-xs uppercase tracking-widest text-[#7a6646]">
                            {vis === "silhouette" ? realm.name : "Reino desconhecido"}
                        </div>
                        <h2 className="mt-1 font-serif text-3xl text-[#2b2216]">Território hachurado</h2>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1.5 hover:bg-[#efe3c6]" aria-label="Fechar"><X className="h-4 w-4" /></button>
                </header>
                <div className="space-y-4 p-5 text-sm text-[#4a3c27]">
                    <div className="h-28 rounded-xl border border-[#c8b68c]" style={{ backgroundImage: "repeating-linear-gradient(-45deg,#5b4a32 0 1px,transparent 1px 7px)", opacity: 0.6 }} />
                    <p>
                        Ninguém sabe ao certo o que existe aqui. Sem nome, sem marca, sem fama para julgar antes da hora:
                        a única forma de conhecer é <strong>ir</strong>.
                    </p>
                    {vis === "silhouette" && <p className="italic">Fica {realm.prep} {realm.name}: {realm.essence.toLowerCase()}</p>}
                    {rumor ? (
                        <p className="rounded-lg border border-[#d8c9a3] bg-[#f3e9d2] p-3">
                            ❝ Rumor da sua caravana ({rumor.join(", ")}): uma <em>{epithet(place)}</em>.
                        </p>
                    ) : (
                        <p className="text-xs text-[#7a6646]">Junte-se a caravanas na aba Conexões para ouvir rumores destas terras.</p>
                    )}
                    <button onClick={() => onExpedition(placeId)} className="inline-flex items-center gap-2 rounded-lg bg-[#2b2216] px-4 py-2 font-medium text-[#f3e9d2]">
                        <Compass className="h-4 w-4" /> Partir em expedição
                    </button>
                </div>
            </aside>
        );
    }

    // ── Território revelado ───────────────────────────────────────────────
    const scores = scoresFor(placeId);
    const u = usage.find((x) => x.placeId === placeId);
    const decision = state.decisions[placeId];
    const knownAlts = alternativesFor(placeId, 10).filter((a) => discovered.has(a.place.id));
    const hidden = hiddenBetterAlternatives(placeId, discovered);
    const highlights = attributeHighlights(place);
    const stats = world[placeId];
    const inh = state.inhabit[placeId];
    const lit = Boolean(state.lanterns[placeId]);
    const disc = state.discoveries[placeId];

    return (
        <aside className="fixed inset-y-0 right-0 z-[120] flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-[#d8c9a3] p-5" style={{ background: `${realm.color}14` }}>
                <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full border border-[#5b4a32] bg-[#f8f1df] p-1.5"><EssenceGlyph realm={realm.id} size={24} /></div>
                    <div>
                        <div className="text-xs text-gray-500">{realm.name}</div>
                        <h2 className="font-serif text-2xl text-gray-900">{place.name}</h2>
                        <p className="font-serif italic text-gray-600">{epithet(place)}</p>
                    </div>
                </div>
                <button onClick={onClose} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </header>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
                <p className="text-sm text-gray-600">{place.tagline}</p>

                {/* Ações sociais com o vocabulário do Atlas */}
                <div className="grid grid-cols-3 gap-2 text-center">
                    <button onClick={() => onLantern(placeId)} title={VOCAB.like.description} className={`rounded-xl border p-2.5 text-xs ${lit ? "border-amber-500 bg-amber-50 text-amber-900" : "border-gray-200 hover:border-gray-400"}`}>
                        <Flame className={`mx-auto h-4 w-4 ${lit ? "fill-amber-400 text-amber-600" : ""}`} />
                        <div className="mt-1 font-medium">{lit ? "Lanterna acesa" : VOCAB.like.verb}</div>
                        <div className="text-[10px] text-gray-500">{fmtCount(stats?.lanterns)} no mundo</div>
                    </button>
                    <button onClick={() => onEcho(placeId)} title={VOCAB.share.description} className="rounded-xl border border-gray-200 p-2.5 text-xs hover:border-gray-400">
                        <Share2 className="mx-auto h-4 w-4" />
                        <div className="mt-1 font-medium">{VOCAB.share.verb}</div>
                        <div className="text-[10px] text-gray-500">{state.echoes[placeId] ?? 0} seus · {fmtCount(stats?.echoes)} no mundo</div>
                    </button>
                    <div className="rounded-xl border border-gray-200 p-2.5 text-xs" title="Viajantes do Atlas que revelaram este território (exibido a partir de 5)">
                        <Users className="mx-auto h-4 w-4" />
                        <div className="mt-1 font-medium">{fmtCount(stats?.travelers)}</div>
                        <div className="text-[10px] text-gray-500">viajantes</div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <TerrainBadge terrain={scores.terrain} />
                    <span>Saúde <strong className="tabular-nums">{scores.health}</strong>/100</span>
                    <span className="text-xs text-gray-500">· bioma {TERRAIN_BIOME[scores.terrain].biome}</span>
                </div>
                <p className="-mt-3 text-xs text-gray-500">{TERRAIN_INFO[scores.terrain].description}</p>

                {/* Essência do local + os três volumes */}
                <div className="rounded-xl border border-[#e4d9bc] bg-[#f8f1df] p-3">
                    <div className="flex items-center gap-2">
                        <PlaceSigilMark sigil={placeSigil(place)} size={22} />
                        <span className="text-sm font-medium text-[#2b2216]">Essência: {SIGIL_MEANING[placeSigil(place)]}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-white/60 p-2">
                            <div className="text-[10px] uppercase tracking-wide text-gray-500">Conteúdo</div>
                            <div className="text-sm font-semibold text-gray-900">{CONTENT_VOLUME_LABELS[contentVolumeOf(place)]}</div>
                            {!place.contentVolume && <div className="text-[9px] text-gray-400">estimado</div>}
                        </div>
                        <div className="rounded-lg bg-white/60 p-2">
                            <div className="text-[10px] uppercase tracking-wide text-gray-500">População</div>
                            <div className="text-sm font-semibold text-gray-900">{place.population ? POPULATION_LABELS[place.population] : "incerta"}</div>
                        </div>
                        <div className="rounded-lg bg-white/60 p-2" title="Engajamento e conexões no Atlas (agregado, a partir de 5 pessoas)">
                            <div className="text-[10px] uppercase tracking-wide text-gray-500">Engajamento</div>
                            <div className="text-sm font-semibold text-gray-900">
                                {stats?.travelers ? `${stats.travelers} viajantes` : "—"}
                            </div>
                            <div className="text-[9px] text-gray-400">{fmtCount(stats?.lanterns)} lanternas</div>
                        </div>
                    </div>
                    <p className="mt-2 text-[10px] leading-snug text-gray-500">
                        O território no mapa é maior quanto mais conteúdo; tem mais cabanas quanto mais gente; e acende
                        lanternas conforme o engajamento de quem o habita.
                    </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                    {u ? (
                        <div>Você passa <strong>{formatMinutes(u.weeklyMinutes)}</strong> por semana aqui <span className="text-gray-500">· dado {QUALITY_LABELS[u.quality].toLowerCase()}</span></div>
                    ) : (
                        <div>Sem tempo registrado aqui.</div>
                    )}
                    {inh && (
                        <div className="mt-2 text-xs text-gray-600">
                            {VOCAB.inhabit.verb} (via {inh.via}): {inh.posts ?? 0} publicações · {inh.following ?? 0} caravanas que você acompanha lá · {inh.followers ?? 0} que acompanham você
                        </div>
                    )}
                    {disc && (
                        <div className="mt-2 text-xs text-gray-500">
                            Revelado por {disc.method === "expedition" ? "expedição" : disc.method === "import" ? "importação de dados" : disc.method === "connector" ? "conector" : "marcação"} em {new Date(disc.at).toLocaleDateString("pt-BR")}
                            {disc.verified ? " · verificado" : ""}
                        </div>
                    )}
                </div>

                <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-900">Qualificação</h3>
                    <ScoreBars scores={scores} />
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                        {highlights.map((h) => (
                            <li key={h.text} className={`rounded-full px-2 py-0.5 text-xs ${h.positive ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                                {h.positive ? "+" : "−"} {h.text}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
                        Derivado de atributos observáveis (curadoria {CATALOG_REVISION}). Confiança: {Math.round(scores.confidence * 100)}%.
                        {place.notes && <> Nota: {place.notes}</>}
                    </p>
                </div>

                <div>
                    <h3 className="mb-1 text-sm font-semibold text-gray-900">Sua rota</h3>
                    <div className="grid grid-cols-2 gap-2">
                        {DECISIONS.map((d) => {
                            const active = decision?.decision === d.id;
                            return (
                                <button key={d.id} title={d.help} onClick={() => onDecide(placeId, active ? null : d.id, active ? undefined : decision?.target)}
                                    className={`rounded-lg border px-3 py-2 text-left text-sm ${active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 hover:border-gray-400"}`}>
                                    <div className="font-medium">{d.label}</div>
                                    <div className={`text-[11px] ${active ? "text-gray-300" : "text-gray-500"}`}>{d.help}</div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-900">Outros mundos {realm.prep} {realm.name}</h3>
                    {hidden.length > 0 && (
                        <div className="mb-3 rounded-xl border border-[#d8c9a3] bg-[#f8f1df] p-3 text-sm text-[#4a3c27]">
                            Há <strong>{hidden.length}</strong> {hidden.length === 1 ? "território mais luminoso" : "territórios mais luminosos"} neste reino ainda sob hachura.
                            <button onClick={() => onExpedition(hidden[0])} className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#2b2216] px-3 py-1.5 text-xs font-medium text-[#f3e9d2]">
                                <Compass className="h-3.5 w-3.5" /> Partir rumo ao desconhecido
                            </button>
                        </div>
                    )}
                    {knownAlts.length === 0 && hidden.length === 0 && (
                        <p className="text-sm text-gray-500">Este já é um dos territórios mais bem qualificados do reino.</p>
                    )}
                    <ul className="space-y-2">
                        {knownAlts.slice(0, 4).map((alt) => {
                            const isTarget = decision?.target === alt.place.id;
                            return (
                                <li key={alt.place.id} className="rounded-xl border border-gray-200 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <button onClick={() => onSelect(alt.place.id)} className="text-left font-medium text-gray-900 hover:underline">{alt.place.name}</button>
                                        <span className="text-xs font-medium text-green-700">+{alt.healthGain} saúde</span>
                                    </div>
                                    <div className="mt-1 text-xs text-gray-600">{alt.reasons.join(" · ")}</div>
                                    <button
                                        onClick={() => onDecide(placeId, decision && decision.decision !== "stay" ? decision.decision : "leave", isTarget ? undefined : alt.place.id)}
                                        className={`mt-2 rounded-md px-2.5 py-1 text-xs font-medium ${isTarget ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"}`}>
                                        {isTarget ? "✓ Destino da rota" : "Traçar rota para cá"}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
        </aside>
    );
}
