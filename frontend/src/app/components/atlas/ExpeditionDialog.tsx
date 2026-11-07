"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Compass, X } from "lucide-react";
import { PLACE_BY_ID, POPULATION_LABELS, entryUrl } from "@/app/lib/atlas/catalog";
import { track } from "@/app/lib/atlas/analytics";
import { downloadFile, expeditionIcs } from "@/app/lib/atlas/connectors";
import { scoresFor } from "@/app/lib/atlas/scoring";
import type { CategoryId } from "@/app/lib/atlas/types";
import { EPITHET_GLOSSARY, REALM_BY_ID, epithet } from "@/app/lib/atlas/world";
import { EssenceGlyph } from "./WorldMap";
import { ScoreBars, TerrainBadge } from "./ui";

/** Tempo mínimo fora do Atlas para a expedição contar (segundos). */
export const MIN_EXPEDITION_SECONDS = 45;

type Phase = "briefing" | "away" | "short" | "revealed";

export function ExpeditionDialog({
    placeId,
    realmKnown,
    rumor,
    onDiscover,
    onEcho,
    onClose,
}: {
    placeId: string;
    realmKnown: boolean;
    rumor?: string[];
    onDiscover: (placeId: string) => void;
    onEcho: (placeId: string) => void;
    onClose: () => void;
}) {
    const place = PLACE_BY_ID[placeId];
    const realm = REALM_BY_ID[place.category as CategoryId];
    const [phase, setPhase] = useState<Phase>("briefing");
    const [awaySeconds, setAwaySeconds] = useState(0);
    const departedAt = useRef<number | null>(null);
    const hiddenAt = useRef<number | null>(null);
    const awayMs = useRef(0);

    // Mede apenas o tempo em que ESTA aba ficou oculta — nada sobre o que
    // você fez do outro lado.
    useEffect(() => {
        const onVis = () => {
            if (departedAt.current === null) return;
            if (document.hidden) hiddenAt.current = Date.now();
            else if (hiddenAt.current) {
                awayMs.current += Date.now() - hiddenAt.current;
                hiddenAt.current = null;
                const secs = Math.round(awayMs.current / 1000);
                setAwaySeconds(secs);
                if (secs >= MIN_EXPEDITION_SECONDS) {
                    setPhase("revealed");
                    onDiscover(placeId);
                } else setPhase("short");
            }
        };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, [onDiscover, placeId]);

    const depart = () => {
        departedAt.current = Date.now();
        setPhase("away");
        track("expedition_started", { realmKnown });
        window.open(entryUrl(place), "_blank", "noopener,noreferrer");
    };

    const schedule = () => {
        const start = new Date(Date.now() + 24 * 3600_000);
        start.setMinutes(0, 0, 0);
        downloadFile(
            "expedicao-atlas.ics",
            expeditionIcs(realmKnown ? realm.name : "reino desconhecido", start, `${window.location.origin}/atlas`),
            "text/calendar",
        );
    };

    const s = scoresFor(placeId);
    const ep = epithet(place);
    const qualifier = Object.keys(EPITHET_GLOSSARY).find((k) => ep.endsWith(k))!;

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#d8c9a3] bg-[#f8f1df] shadow-2xl">
                <button onClick={onClose} className="absolute right-3 top-3 rounded p-1 text-[#5b4a32] hover:bg-[#efe3c6]" aria-label="Fechar">
                    <X className="h-4 w-4" />
                </button>

                {phase !== "revealed" ? (
                    <div className="p-6">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#7a6646]">
                            <Compass className="h-4 w-4" /> Expedição
                        </div>
                        <h2 className="mt-2 font-serif text-3xl text-[#2b2216]">Terra Incógnita</h2>
                        <p className="mt-1 font-serif text-lg italic text-[#5b4a32]">
                            {realmKnown ? `${realm.prep} ${realm.name}` : "em um reino que você nunca pisou"}
                        </p>
                        {rumor && rumor.length > 0 && (
                            <p className="mt-3 rounded-lg border border-[#d8c9a3] bg-[#f3e9d2] px-3 py-2 text-sm text-[#4a3c27]">
                                ❝ Sua caravana ({rumor.join(", ")}) fala de uma <em>{ep}</em>.
                            </p>
                        )}
                        <p className="mt-4 text-sm leading-relaxed text-[#4a3c27]">
                            Não há nome, marca ou reputação para julgar antes de ir. Só se descobre o que existe aqui
                            <strong> indo</strong>: a porta de entrada abre em outra aba. Fique pelo menos{" "}
                            {MIN_EXPEDITION_SECONDS} segundos explorando algum conteúdo e volte — o território será revelado.
                        </p>

                        {phase === "away" && (
                            <div className="mt-4 rounded-lg bg-[#2b2216] px-4 py-3 text-sm text-[#f3e9d2]">
                                Expedição em curso… explore com calma. Quando voltar a esta aba, a hachura se dissolve.
                            </div>
                        )}
                        {phase === "short" && (
                            <div className="mt-4 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                Você voltou em {awaySeconds}s — cedo demais para conhecer o lugar. Volte lá e fique um pouco mais.
                            </div>
                        )}

                        <div className="mt-5 flex flex-wrap gap-2">
                            <button onClick={depart} className="inline-flex items-center gap-2 rounded-lg bg-[#2b2216] px-4 py-2 text-sm font-medium text-[#f3e9d2] hover:bg-black">
                                <Compass className="h-4 w-4" /> {phase === "briefing" ? "Partir em expedição" : "Voltar à expedição"}
                            </button>
                            <button onClick={schedule} className="inline-flex items-center gap-2 rounded-lg border border-[#c8b68c] px-4 py-2 text-sm text-[#4a3c27] hover:bg-[#efe3c6]">
                                <CalendarPlus className="h-4 w-4" /> Agendar para amanhã (.ics)
                            </button>
                        </div>
                        <p className="mt-4 text-[11px] text-[#7a6646]">
                            O Atlas mede só quanto tempo esta aba ficou em segundo plano. Não vê o que você faz do outro lado.
                        </p>
                    </div>
                ) : (
                    <div className="atlas-reveal">
                        <div className="flex items-center gap-3 border-b border-[#d8c9a3] p-6" style={{ background: `${realm.color}22` }}>
                            <div className="rounded-full border border-[#5b4a32] bg-[#f8f1df] p-2">
                                <EssenceGlyph realm={realm.id} size={30} />
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-widest text-[#7a6646]">Território revelado · {realm.name}</div>
                                <h2 className="font-serif text-3xl text-[#2b2216]">{place.name}</h2>
                                <p className="font-serif italic text-[#5b4a32]">
                                    {ep} <span className="text-xs not-italic">({EPITHET_GLOSSARY[qualifier]})</span>
                                </p>
                            </div>
                        </div>
                        <div className="space-y-4 p-6">
                            <p className="text-sm text-[#4a3c27]">{place.tagline} {realm.essence}</p>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <TerrainBadge terrain={s.terrain} />
                                <span className="text-[#4a3c27]">População: {place.population ? POPULATION_LABELS[place.population] : "incerta"}</span>
                            </div>
                            <ScoreBars scores={s} />
                            <div className="flex flex-wrap gap-2 pt-2">
                                <button onClick={() => onEcho(placeId)} className="rounded-lg bg-[#2b2216] px-4 py-2 text-sm font-medium text-[#f3e9d2]">
                                    Ecoar esta descoberta
                                </button>
                                <button onClick={onClose} className="rounded-lg border border-[#c8b68c] px-4 py-2 text-sm text-[#4a3c27]">
                                    Voltar ao mapa
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
