/**
 * Multiverso — "existem infinitos outros lugares".
 *
 * Para cada lugar, sugere destinos no mesmo bairro com melhor qualificação,
 * explicando POR QUE (diferenças de atributos), e oferece portais aleatórios
 * para bairros que a pessoa nunca visitou.
 */

import { CATEGORIES, PLACES, PLACE_BY_ID } from "./catalog";
import { DIMENSION_LABELS, scoresFor } from "./scoring";
import type { CategoryId, Place, ScoreDimension } from "./types";

export interface Alternative {
    place: Place;
    healthGain: number;
    reasons: string[];
}

function reasonsFor(from: Place, to: Place): string[] {
    const a = from.attributes;
    const b = to.attributes;
    const r: string[] = [];
    if (a.businessModel === "ads" && b.businessModel !== "ads") r.push("sem modelo de anúncios");
    if (a.infiniteFeed === true && b.infiniteFeed !== true) r.push("sem feed infinito");
    if (a.autoplay === true && b.autoplay !== true) r.push("sem autoplay");
    if (a.chronologicalOption !== true && b.chronologicalOption === true) r.push("feed cronológico");
    if (a.feedChoice !== true && b.feedChoice === true) r.push("você escolhe o algoritmo");
    if (a.openSource === "no" && b.openSource !== "no") r.push("código aberto");
    if (a.federated === "no" && b.federated !== "no") r.push("federado — leve sua rede");
    if (a.e2eDefault !== true && b.e2eDefault === true) r.push("criptografia ponta-a-ponta");
    if (r.length === 0) {
        const sa = scoresFor(from.id);
        const sb = scoresFor(to.id);
        const best = (Object.keys(DIMENSION_LABELS) as ScoreDimension[])
            .map((d) => ({ d, gain: sb[d] - sa[d] }))
            .sort((x, y) => y.gain - x.gain)[0];
        if (best && best.gain > 0) r.push(`mais ${DIMENSION_LABELS[best.d].toLowerCase()}`);
    }
    return r;
}

export function alternativesFor(placeId: string, limit = 4): Alternative[] {
    const from = PLACE_BY_ID[placeId];
    if (!from) return [];
    const base = scoresFor(placeId).health;
    return PLACES.filter((p) => p.category === from.category && p.id !== placeId)
        .map((p) => ({ place: p, healthGain: scoresFor(p.id).health - base, reasons: reasonsFor(from, p) }))
        .filter((alt) => alt.healthGain > 0)
        .sort((x, y) => y.healthGain - x.healthGain)
        .slice(0, limit);
}

/** PRNG determinístico (mulberry32) para portais reprodutíveis por semente. */
export function seededRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Portais: lugares bem qualificados em bairros pouco ou nada explorados.
 * A semente muda a cada "giro" para revelar outros mundos.
 */
export function portals(exploredIds: string[], seed: number, count = 3): Place[] {
    const explored = new Set(exploredIds);
    const exploredCats = new Set(exploredIds.map((id) => PLACE_BY_ID[id]?.category).filter(Boolean));
    const rand = seededRandom(seed);
    const candidates = PLACES.filter((p) => !explored.has(p.id)).map((p) => {
        const s = scoresFor(p.id).health;
        const novelty = exploredCats.has(p.category) ? 0 : 25;
        return { p, w: s + novelty + rand() * 40 };
    });
    candidates.sort((a, b) => b.w - a.w);
    const out: Place[] = [];
    const usedCats = new Set<CategoryId>();
    for (const c of candidates) {
        if (out.length >= count) break;
        if (usedCats.has(c.p.category)) continue;
        usedCats.add(c.p.category);
        out.push(c.p);
    }
    return out;
}

/** Quantos lugares do catálogo continuam fora do mapa da pessoa, por bairro. */
export function unexploredByCategory(exploredIds: string[]): Record<CategoryId, number> {
    const explored = new Set(exploredIds);
    return Object.fromEntries(
        CATEGORIES.map((c) => [
            c.id,
            PLACES.filter((p) => p.category === c.id && !explored.has(p.id)).length,
        ]),
    ) as Record<CategoryId, number>;
}
