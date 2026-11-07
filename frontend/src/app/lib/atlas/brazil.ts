/**
 * Mapa geral do Brasil — cartograma de blocos das 27 UFs.
 *
 * Um cartograma (cada UF = um bloco do mesmo tamanho) evita que estados
 * grandes e pouco populosos dominem visualmente, e dispensa geometria
 * externa. As posições aproximam a geografia; não é um mapa em escala.
 */

import { CATEGORIES } from "./catalog";
import type { AtlasMetrics } from "./metrics";
import { seededRandom } from "./multiverse";
import type { CategoryId } from "./types";

export type Region = "Norte" | "Nordeste" | "Centro-Oeste" | "Sudeste" | "Sul";

export interface UF {
    code: string;
    name: string;
    region: Region;
    col: number;
    row: number;
}

export const UFS: UF[] = [
    { code: "RR", name: "Roraima", region: "Norte", col: 1, row: 0 },
    { code: "AP", name: "Amapá", region: "Norte", col: 3, row: 0 },
    { code: "AM", name: "Amazonas", region: "Norte", col: 1, row: 1 },
    { code: "PA", name: "Pará", region: "Norte", col: 2, row: 1 },
    { code: "MA", name: "Maranhão", region: "Nordeste", col: 3, row: 1 },
    { code: "CE", name: "Ceará", region: "Nordeste", col: 4, row: 1 },
    { code: "RN", name: "Rio Grande do Norte", region: "Nordeste", col: 5, row: 1 },
    { code: "AC", name: "Acre", region: "Norte", col: 0, row: 2 },
    { code: "RO", name: "Rondônia", region: "Norte", col: 1, row: 2 },
    { code: "TO", name: "Tocantins", region: "Norte", col: 2, row: 2 },
    { code: "PI", name: "Piauí", region: "Nordeste", col: 3, row: 2 },
    { code: "PE", name: "Pernambuco", region: "Nordeste", col: 4, row: 2 },
    { code: "PB", name: "Paraíba", region: "Nordeste", col: 5, row: 2 },
    { code: "MT", name: "Mato Grosso", region: "Centro-Oeste", col: 1, row: 3 },
    { code: "GO", name: "Goiás", region: "Centro-Oeste", col: 2, row: 3 },
    { code: "BA", name: "Bahia", region: "Nordeste", col: 3, row: 3 },
    { code: "SE", name: "Sergipe", region: "Nordeste", col: 4, row: 3 },
    { code: "AL", name: "Alagoas", region: "Nordeste", col: 5, row: 3 },
    { code: "MS", name: "Mato Grosso do Sul", region: "Centro-Oeste", col: 1, row: 4 },
    { code: "DF", name: "Distrito Federal", region: "Centro-Oeste", col: 2, row: 4 },
    { code: "MG", name: "Minas Gerais", region: "Sudeste", col: 3, row: 4 },
    { code: "ES", name: "Espírito Santo", region: "Sudeste", col: 4, row: 4 },
    { code: "PR", name: "Paraná", region: "Sul", col: 1, row: 5 },
    { code: "SP", name: "São Paulo", region: "Sudeste", col: 2, row: 5 },
    { code: "RJ", name: "Rio de Janeiro", region: "Sudeste", col: 3, row: 5 },
    { code: "SC", name: "Santa Catarina", region: "Sul", col: 1, row: 6 },
    { code: "RS", name: "Rio Grande do Sul", region: "Sul", col: 1, row: 7 },
];

export const UF_BY_CODE: Record<string, UF> = Object.fromEntries(UFS.map((u) => [u.code, u]));

/** Mínimo de participantes por UF para exibir um agregado (k-anonimato). */
export const K_ANONYMITY = 10;

export interface UFAggregate {
    uf: string;
    participants: number;
    diversity: number;
    healthyAttention: number;
    openShare: number;
    adShare: number;
    weeklyHours: number;
    categoryShare: Record<CategoryId, number>;
}

export type BrazilMetric = "healthyAttention" | "diversity" | "openShare" | "adShare" | "weeklyHours";

export const BRAZIL_METRICS: Record<BrazilMetric, { label: string; unit: string; higherIsBetter: boolean }> = {
    healthyAttention: { label: "Atenção saudável", unit: "", higherIsBetter: true },
    diversity: { label: "Diversidade", unit: "", higherIsBetter: true },
    openShare: { label: "Tempo em lugares abertos", unit: "%", higherIsBetter: true },
    adShare: { label: "Tempo em lugares com anúncios", unit: "%", higherIsBetter: false },
    weeklyHours: { label: "Horas por semana", unit: "h", higherIsBetter: false },
};

/** Contribuição anônima: só métricas arredondadas, nenhum lugar específico. */
export interface BrazilContribution {
    uf: string;
    week: string; // ISO week, ex.: 2026-W45
    diversity: number;
    healthyAttention: number;
    openShare: number;
    adShare: number;
    weeklyHours: number;
    categoryShare: Record<CategoryId, number>;
}

export function isoWeek(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const round5 = (n: number) => Math.round(n / 5) * 5;

/**
 * Reduz a precisão antes de enviar (arredondamento a múltiplos de 5) para
 * dificultar reidentificação por combinação de valores exatos.
 */
export function buildContribution(uf: string, m: AtlasMetrics, now = new Date()): BrazilContribution {
    const total = m.totalWeeklyMinutes || 1;
    return {
        uf,
        week: isoWeek(now),
        diversity: round5(m.diversity),
        healthyAttention: round5(m.healthyAttention),
        openShare: round5(m.openShare),
        adShare: round5(m.adShare),
        weeklyHours: Math.round(m.totalWeeklyMinutes / 60),
        categoryShare: Object.fromEntries(
            CATEGORIES.map((c) => [c.id, round5((m.byCategory[c.id] / total) * 100)]),
        ) as Record<CategoryId, number>,
    };
}

function hashCode(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h;
}

/**
 * Dados SIMULADOS para demonstração da visualização enquanto não há
 * participantes suficientes. Não representam nenhuma medição real — a UI
 * sempre exibe o aviso "simulação".
 */
export function simulatedAggregates(): UFAggregate[] {
    return UFS.map((u) => {
        const r = seededRandom(hashCode(u.code));
        const raw = CATEGORIES.map(() => 0.3 + r());
        const sum = raw.reduce((a, b) => a + b, 0);
        return {
            uf: u.code,
            participants: 10 + Math.floor(r() * 400),
            diversity: Math.round(40 + r() * 40),
            healthyAttention: Math.round(30 + r() * 35),
            openShare: Math.round(r() * 15),
            adShare: Math.round(35 + r() * 40),
            weeklyHours: Math.round(15 + r() * 25),
            categoryShare: Object.fromEntries(
                CATEGORIES.map((c, i) => [c.id, Math.round((raw[i] / sum) * 100)]),
            ) as Record<CategoryId, number>,
        };
    });
}

export function topCategory(share: Record<CategoryId, number>): CategoryId {
    return (Object.entries(share) as [CategoryId, number][]).sort((a, b) => b[1] - a[1])[0][0];
}
