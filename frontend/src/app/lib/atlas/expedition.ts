/**
 * Modo Expedição — a dinâmica de mapa de aventura (inspirada nos mapas de
 * Heroes of Might & Magic, sem clonar arte/nomes).
 *
 * Elementos e seus equivalentes:
 *   Névoa de guerra  → a Bruma (manto que o Cartógrafo dissipa ao andar)
 *   Herói            → o Cartógrafo (um peão no mapa-pergaminho)
 *   Pontos de mov.   → Léguas (orçamento diário; labirinto custa mais, trilha menos)
 *   Minas / renda    → Fontes (territórios habitados rendem +léguas/dia)
 *   Tesouros soltos  → Marcos (dão um rumor ao serem alcançados)
 *
 * IMPORTANTE: dissipar a Bruma é uma CAMADA DE JOGO. Não revela dados nem
 * cria métricas. A revelação real (nome, qualificação) só acontece na
 * expedição de verdade (`ExpeditionDialog`). Léguas vêm de um orçamento
 * diário e de ações reais — nunca de tempo de tela.
 */

import { PLACE_BY_ID } from "./catalog";
import { seededRandom } from "./multiverse";
import { scoresFor } from "./scoring";
import type { ExpeditionState } from "./types";
import { REALMS, WORLD_H, WORLD_W, epithet, type Pt, type WorldGeometry } from "./world";

// ── Constantes de balanceamento ────────────────────────────────────────────
export const FOG_CELL = 40;
export const FOG_COLS = Math.ceil(WORLD_W / FOG_CELL); // 40
export const FOG_ROWS = Math.ceil(WORLD_H / FOG_CELL); // 25
export const REVEAL_RADIUS = 115; // raio de dissipação da bruma (px)
export const LEAGUE_PX = 24; // 1 légua ≈ 24px percorridos
export const DAILY_LEAGUES = 60; // orçamento-base por dia
export const FONTE_LEAGUES = 8; // +léguas/dia por território habitado
export const FONTE_CAP = 5; // no máx. 5 fontes contam
export const ROAD_DISCOUNT = 0.5; // trilhas entre lugares conhecidos custam metade
export const LABYRINTH_SURCHARGE = 1.3; // terreno de labirinto custa mais
export const ROAD_NEAR = 62; // distância a um território conhecido p/ contar como "na trilha"
export const COLLECT_RADIUS = 34; // alcance para coletar um Marco
export const BONUS_IMPORT = 20;
export const BONUS_DECISION = 10;
export const BONUS_CONNECTOR = 25;

export function fogKey(col: number, row: number): string {
    return `${col},${row}`;
}

export function cellCenter(col: number, row: number): Pt {
    return { x: col * FOG_CELL + FOG_CELL / 2, y: row * FOG_CELL + FOG_CELL / 2 };
}

export function todayKey(now = new Date()): string {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/** Cria células de bruma dissipadas ao redor de um ponto (raio dado). */
function liftAround(point: Pt, radius: number, into: Set<string>): void {
    const minC = Math.max(0, Math.floor((point.x - radius) / FOG_CELL));
    const maxC = Math.min(FOG_COLS - 1, Math.floor((point.x + radius) / FOG_CELL));
    const minR = Math.max(0, Math.floor((point.y - radius) / FOG_CELL));
    const maxR = Math.min(FOG_ROWS - 1, Math.floor((point.y + radius) / FOG_CELL));
    for (let c = minC; c <= maxC; c++) {
        for (let r = minR; r <= maxR; r++) {
            const cc = cellCenter(c, r);
            if (Math.hypot(cc.x - point.x, cc.y - point.y) <= radius) into.add(fogKey(c, r));
        }
    }
}

/** Onde o Cartógrafo começa: centro do território habitado mais usado, senão o centro do mundo. */
export function startPosition(world: WorldGeometry, inhabited: string[]): Pt {
    for (const id of inhabited) {
        const t = world.territories.find((x) => x.placeId === id);
        if (t) return { x: t.center.x, y: t.center.y };
    }
    return { x: WORLD_W / 2, y: WORLD_H / 2 };
}

/** Estado inicial do Modo Expedição (bruma dissipada ao redor do que já é conhecido). */
export function initExpedition(
    world: WorldGeometry,
    discovered: Set<string>,
    inhabited: string[],
    now = new Date(),
): ExpeditionState {
    const start = startPosition(world, inhabited);
    const fog = new Set<string>();
    liftAround(start, REVEAL_RADIUS * 1.2, fog);
    for (const t of world.territories) {
        if (discovered.has(t.placeId)) liftAround(t.center, REVEAL_RADIUS, fog);
    }
    return {
        cartographer: start,
        fog: [...fog],
        leaguesDay: todayKey(now),
        leaguesSpent: 0,
        leaguesBonus: 0,
        marksCollected: [],
        rumorsFound: [],
    };
}

// ── Léguas (orçamento) ──────────────────────────────────────────────────────

export function fontesLeagues(inhabitedCount: number): number {
    return Math.min(inhabitedCount, FONTE_CAP) * FONTE_LEAGUES;
}

export interface Budget {
    total: number;
    spent: number;
    available: number;
    base: number;
    fontes: number;
    bonus: number;
}

/** Orçamento do dia; zera o gasto e o bônus quando vira o dia. */
export function budget(exp: ExpeditionState, inhabitedCount: number, now = new Date()): Budget {
    const sameDay = exp.leaguesDay === todayKey(now);
    const spent = sameDay ? exp.leaguesSpent : 0;
    const bonus = sameDay ? exp.leaguesBonus : 0;
    const fontes = fontesLeagues(inhabitedCount);
    const total = DAILY_LEAGUES + fontes + bonus;
    return { total, spent, available: Math.max(0, total - spent), base: DAILY_LEAGUES, fontes, bonus };
}

// ── Custo de deslocamento ────────────────────────────────────────────────────

/** Território que contém o ponto (ou null). */
function territoryAt(point: Pt, world: WorldGeometry) {
    return world.territories.find((t) => Math.hypot(t.center.x - point.x, t.center.y - point.y) <= t.radius) ?? null;
}

function terrainMultiplier(point: Pt, world: WorldGeometry): number {
    const t = territoryAt(point, world);
    if (t && scoresFor(t.placeId).terrain === "labirinto") return LABYRINTH_SURCHARGE;
    return 1;
}

function nearKnownTerritory(point: Pt, world: WorldGeometry, discovered: Set<string>): boolean {
    return world.territories.some(
        (t) => discovered.has(t.placeId) && Math.hypot(t.center.x - point.x, t.center.y - point.y) <= ROAD_NEAR,
    );
}

/** Viajar entre dois pontos ambos à beira de lugares conhecidos segue "trilha" (desconto). */
function onRoad(from: Pt, to: Pt, world: WorldGeometry, discovered: Set<string>): boolean {
    return nearKnownTerritory(from, world, discovered) && nearKnownTerritory(to, world, discovered);
}

/** Custo em léguas para ir de `from` a `to`. */
export function leagueCost(from: Pt, to: Pt, world: WorldGeometry, discovered: Set<string>): number {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const base = dist / LEAGUE_PX;
    const mult = terrainMultiplier(to, world) * (onRoad(from, to, world, discovered) ? ROAD_DISCOUNT : 1);
    return base * mult;
}

export interface Reach {
    point: Pt;
    cost: number;
    truncated: boolean;
}

/**
 * Até onde dá para ir em direção a `to` com o orçamento disponível. Se não
 * alcança, trunca o ponto proporcionalmente (como o "alcance neste turno" do
 * gênero) e marca `truncated`.
 */
export function reachTowards(
    from: Pt,
    to: Pt,
    available: number,
    world: WorldGeometry,
    discovered: Set<string>,
): Reach {
    const full = leagueCost(from, to, world, discovered);
    if (full <= available || full === 0) return { point: to, cost: full, truncated: false };
    const frac = available / full;
    const point = { x: from.x + (to.x - from.x) * frac, y: from.y + (to.y - from.y) * frac };
    return { point, cost: available, truncated: true };
}

/** Dissipa a bruma ao longo do segmento from→to e devolve a lista de células final. */
export function liftFogAlong(from: Pt, to: Pt, fog: string[]): string[] {
    const set = new Set(fog);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / 20));
    for (let i = 0; i <= steps; i++) {
        const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
        liftAround(p, REVEAL_RADIUS, set);
    }
    return [...set];
}

// ── Marcos e rumores ─────────────────────────────────────────────────────────

export interface Mark {
    id: string;
    realm: string;
    pos: Pt;
}

function hashStr(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}

/** Marcos espalhados: um por reino, em terra aberta à margem da ilha, determinístico. */
export function generateMarks(): Mark[] {
    return REALMS.map((realm) => {
        const rand = seededRandom(hashStr("mark:" + realm.id));
        const ang = rand() * Math.PI * 2;
        const rr = realm.radius * (1.02 + rand() * 0.12); // logo além da orla
        return {
            id: "mark:" + realm.id,
            realm: realm.id,
            pos: {
                x: Math.max(30, Math.min(WORLD_W - 30, realm.center.x + Math.cos(ang) * rr)),
                y: Math.max(30, Math.min(WORLD_H - 30, realm.center.y + Math.sin(ang) * rr)),
            },
        };
    });
}

/** Território ainda não descoberto mais próximo de um ponto (para o rumor). */
export function nearestHatched(point: Pt, world: WorldGeometry, discovered: Set<string>): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const t of world.territories) {
        if (discovered.has(t.placeId)) continue;
        const d = Math.hypot(t.center.x - point.x, t.center.y - point.y);
        if (d < bestD) {
            bestD = d;
            best = t.placeId;
        }
    }
    return best;
}

export interface MarkYield {
    markId: string;
    /** Território cujo epíteto foi revelado como rumor (ou null → vira bônus). */
    rumorPlaceId: string | null;
    epithet: string | null;
    /** Léguas de bônus quando não há território novo por perto. */
    leagues: number;
}

/** O que um marco entrega ao ser alcançado. */
export function collectMarkYield(mark: Mark, world: WorldGeometry, discovered: Set<string>): MarkYield {
    const near = nearestHatched(mark.pos, world, discovered);
    if (near) {
        return { markId: mark.id, rumorPlaceId: near, epithet: epithet(PLACE_BY_ID[near]), leagues: 0 };
    }
    return { markId: mark.id, rumorPlaceId: null, epithet: null, leagues: 10 };
}

/** Marcos ao alcance do Cartógrafo e ainda não coletados. */
export function marksInReach(pos: Pt, collected: string[], marks = generateMarks()): Mark[] {
    const done = new Set(collected);
    return marks.filter((m) => !done.has(m.id) && Math.hypot(m.pos.x - pos.x, m.pos.y - pos.y) <= COLLECT_RADIUS);
}

// ── Orquestração de um movimento ──────────────────────────────────────────────

export interface MoveResult {
    exp: ExpeditionState;
    moved: boolean;
    truncated: boolean;
    cost: number;
    collected: MarkYield[];
}

/** Zera gasto e bônus quando o dia virou. */
function freshDay(exp: ExpeditionState, now: Date): ExpeditionState {
    const today = todayKey(now);
    if (exp.leaguesDay === today) return exp;
    return { ...exp, leaguesDay: today, leaguesSpent: 0, leaguesBonus: 0 };
}

/**
 * Move o Cartógrafo rumo a `dest` até onde as léguas permitem, dissipa a Bruma
 * no caminho e coleta marcos alcançados. Função pura.
 */
export function resolveMove(
    exp: ExpeditionState,
    dest: Pt,
    world: WorldGeometry,
    discovered: Set<string>,
    inhabitedCount: number,
    now = new Date(),
): MoveResult {
    const e = freshDay(exp, now);
    const avail = budget(e, inhabitedCount, now).available;
    const reach = reachTowards(e.cartographer, dest, avail, world, discovered);
    if (reach.cost < 0.05) {
        return { exp: e, moved: false, truncated: reach.truncated, cost: 0, collected: [] };
    }
    const fog = liftFogAlong(e.cartographer, reach.point, e.fog);
    const marksCollected = [...e.marksCollected];
    const rumorsFound = [...e.rumorsFound];
    let bonus = e.leaguesBonus;
    const collected: MarkYield[] = [];
    for (const m of marksInReach(reach.point, marksCollected)) {
        const y = collectMarkYield(m, world, discovered);
        marksCollected.push(m.id);
        if (y.rumorPlaceId && !rumorsFound.includes(y.rumorPlaceId)) rumorsFound.push(y.rumorPlaceId);
        bonus += y.leagues;
        collected.push(y);
    }
    return {
        exp: {
            ...e,
            cartographer: reach.point,
            fog,
            leaguesSpent: e.leaguesSpent + reach.cost,
            leaguesBonus: bonus,
            marksCollected,
            rumorsFound,
        },
        moved: true,
        truncated: reach.truncated,
        cost: reach.cost,
        collected,
    };
}

/** Credita léguas de bônus por uma ação real (import, decisão, conexão). */
export function creditLeagues(exp: ExpeditionState, n: number, now = new Date()): ExpeditionState {
    const e = freshDay(exp, now);
    return { ...e, leaguesBonus: e.leaguesBonus + n };
}
