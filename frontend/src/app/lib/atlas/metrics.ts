/**
 * Métricas da atividade digital — tudo derivado do estado local.
 */

import { CATEGORIES, PLACE_BY_ID, PLACES } from "./catalog";
import { scoresFor } from "./scoring";
import type {
    AtlasState,
    CategoryId,
    DataQuality,
    EffectiveUsage,
    UsageRecord,
} from "./types";

const QUALITY_RANK: Record<DataQuality, number> = {
    measured: 3,
    derived: 2,
    "self-reported": 1,
};

export const QUALITY_LABELS: Record<DataQuality, string> = {
    measured: "Medido",
    derived: "Derivado",
    "self-reported": "Autodeclarado",
};

export function recordKey(r: Pick<UsageRecord, "source" | "placeId">): string {
    return `${r.source}:${r.placeId}`;
}

function weekly(r: UsageRecord): number {
    return r.periodDays > 0 ? (r.minutes / r.periodDays) * 7 : 0;
}

function addHist(a: number[] | undefined, b: number[] | undefined, scale: number) {
    if (!b) return a;
    const out = a ? [...a] : new Array(24).fill(0);
    for (let i = 0; i < 24; i++) out[i] += (b[i] ?? 0) * scale;
    return out;
}

/**
 * Uso efetivo por lugar. Regra anti-dupla-contagem: para cada lugar vale a
 * melhor qualidade disponível (medido > derivado > autodeclarado); fontes
 * de mesma qualidade são somadas (ex.: dois arquivos de histórico distintos).
 */
export function effectiveUsage(state: Pick<AtlasState, "records">): EffectiveUsage[] {
    const byPlace = new Map<string, UsageRecord[]>();
    for (const r of Object.values(state.records)) {
        if (!PLACE_BY_ID[r.placeId] || r.minutes <= 0) continue;
        const list = byPlace.get(r.placeId) ?? [];
        list.push(r);
        byPlace.set(r.placeId, list);
    }
    const out: EffectiveUsage[] = [];
    for (const [placeId, list] of byPlace) {
        const best = Math.max(...list.map((r) => QUALITY_RANK[r.quality]));
        const chosen = list.filter((r) => QUALITY_RANK[r.quality] === best);
        let hist: number[] | undefined;
        const daily: Record<string, number> = {};
        let hasDaily = false;
        for (const r of chosen) {
            hist = addHist(hist, r.hourHistogram, 1);
            if (r.daily) {
                hasDaily = true;
                for (const [d, m] of Object.entries(r.daily)) daily[d] = (daily[d] ?? 0) + m;
            }
        }
        out.push({
            placeId,
            weeklyMinutes: chosen.reduce((s, r) => s + weekly(r), 0),
            quality: chosen[0].quality,
            sources: [...new Set(chosen.map((r) => r.source))],
            hourHistogram: hist,
            daily: hasDaily ? daily : undefined,
        });
    }
    return out.sort((a, b) => b.weeklyMinutes - a.weeklyMinutes);
}

export interface AtlasMetrics {
    totalWeeklyMinutes: number;
    placesUsed: number;
    categoriesUsed: number;
    byCategory: Record<CategoryId, number>;
    /** Entropia de Shannon normalizada entre bairros (0–100). */
    diversity: number;
    /** Participação dos 3 lugares mais usados (0–100). */
    top3Share: number;
    /** Índice Herfindahl-Hirschman entre lugares (0–10000). */
    hhi: number;
    /** Saúde média ponderada pelo tempo (0–100). */
    healthyAttention: number;
    /** % do tempo em lugares abertos ou federados. */
    openShare: number;
    /** % do tempo em lugares financiados por anúncios. */
    adShare: number;
    /** % do tempo em lugares do tipo "labirinto". */
    labyrinthShare: number;
    /** Distribuição de qualidade do dado (% do tempo). */
    qualityShare: Record<DataQuality, number>;
    /** Lugares explorados (uso > 0 ou marcados) / catálogo. */
    explored: number;
    catalogSize: number;
}

function emptyByCategory(): Record<CategoryId, number> {
    return Object.fromEntries(CATEGORIES.map((c) => [c.id, 0])) as Record<CategoryId, number>;
}

export function computeMetrics(
    usage: EffectiveUsage[],
    explored: Record<string, string> = {},
): AtlasMetrics {
    const total = usage.reduce((s, u) => s + u.weeklyMinutes, 0);
    const byCategory = emptyByCategory();
    const qualityShare: Record<DataQuality, number> = {
        measured: 0,
        derived: 0,
        "self-reported": 0,
    };
    let health = 0;
    let open = 0;
    let ads = 0;
    let labyrinth = 0;
    let hhi = 0;
    for (const u of usage) {
        const place = PLACE_BY_ID[u.placeId];
        const s = scoresFor(u.placeId);
        const share = total > 0 ? u.weeklyMinutes / total : 0;
        byCategory[place.category] += u.weeklyMinutes;
        qualityShare[u.quality] += share * 100;
        health += s.health * share;
        if (place.attributes.openSource !== "no" || place.attributes.federated !== "no") open += share;
        if (place.attributes.businessModel === "ads") ads += share;
        if (s.terrain === "labirinto") labyrinth += share;
        hhi += (share * 100) ** 2;
    }
    const catShares = Object.values(byCategory)
        .filter((m) => m > 0)
        .map((m) => m / total);
    const entropy = -catShares.reduce((s, p) => s + p * Math.log(p), 0);
    const diversity = total > 0 ? (entropy / Math.log(CATEGORIES.length)) * 100 : 0;
    const top3 = usage.slice(0, 3).reduce((s, u) => s + u.weeklyMinutes, 0);
    const exploredSet = new Set([...usage.map((u) => u.placeId), ...Object.keys(explored)]);
    return {
        totalWeeklyMinutes: Math.round(total),
        placesUsed: usage.length,
        categoriesUsed: catShares.length,
        byCategory,
        diversity: Math.round(diversity) || 0,
        top3Share: total > 0 ? Math.round((top3 / total) * 100) : 0,
        hhi: Math.round(hhi),
        healthyAttention: Math.round(health),
        openShare: Math.round(open * 100),
        adShare: Math.round(ads * 100),
        labyrinthShare: Math.round(labyrinth * 100),
        qualityShare: {
            measured: Math.round(qualityShare.measured),
            derived: Math.round(qualityShare.derived),
            "self-reported": Math.round(qualityShare["self-reported"]),
        },
        explored: [...exploredSet].filter((id) => PLACE_BY_ID[id]).length,
        catalogSize: PLACES.length,
    };
}

/**
 * Simula a "rota planejada": aplica as decisões da pessoa e devolve o uso
 * projetado. Reduzir = −50% do tempo; Migrar = 100% do tempo vai para o
 * destino (ou some, se não houver destino). O tempo liberado num "reduzir"
 * com destino também vai para o destino.
 */
export function projectRoute(
    usage: EffectiveUsage[],
    decisions: AtlasState["decisions"],
): EffectiveUsage[] {
    const minutes = new Map<string, number>(usage.map((u) => [u.placeId, u.weeklyMinutes]));
    for (const [placeId, d] of Object.entries(decisions)) {
        const current = minutes.get(placeId) ?? 0;
        if (current <= 0) continue;
        let moved = 0;
        if (d.decision === "reduce") moved = current * 0.5;
        if (d.decision === "leave") moved = current;
        if (moved <= 0) continue;
        minutes.set(placeId, current - moved);
        if (d.target && PLACE_BY_ID[d.target]) {
            minutes.set(d.target, (minutes.get(d.target) ?? 0) + moved);
        }
    }
    const qualityOf = new Map(usage.map((u) => [u.placeId, u]));
    return [...minutes.entries()]
        .filter(([, m]) => m > 0)
        .map(([placeId, weeklyMinutes]) => ({
            placeId,
            weeklyMinutes,
            quality: qualityOf.get(placeId)?.quality ?? "self-reported",
            sources: qualityOf.get(placeId)?.sources ?? ["manual"],
        }))
        .sort((a, b) => b.weeklyMinutes - a.weeklyMinutes);
}

/** Histograma por hora somado entre lugares. */
export function hourlyProfile(usage: EffectiveUsage[]): number[] | null {
    let hist: number[] | undefined;
    for (const u of usage) hist = addHist(hist, u.hourHistogram, 1);
    return hist ?? null;
}

/** Série diária somada por categoria (para tendência). */
export function dailySeries(
    usage: EffectiveUsage[],
): { date: string; minutes: number; health: number }[] {
    const days = new Map<string, { minutes: number; healthSum: number }>();
    for (const u of usage) {
        if (!u.daily) continue;
        const h = scoresFor(u.placeId).health;
        for (const [d, m] of Object.entries(u.daily)) {
            const cur = days.get(d) ?? { minutes: 0, healthSum: 0 };
            cur.minutes += m;
            cur.healthSum += h * m;
            days.set(d, cur);
        }
    }
    return [...days.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
            date,
            minutes: Math.round(v.minutes),
            health: v.minutes > 0 ? Math.round(v.healthSum / v.minutes) : 0,
        }));
}

export function formatMinutes(min: number): string {
    if (min < 60) return `${Math.round(min)} min`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
