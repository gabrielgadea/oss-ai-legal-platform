/**
 * Navegação do Cartógrafo — skill `game-ai` (camada "path"), independente de motor.
 *
 * Grafo: uma grade de NAV_CELL px sobre o mundo. Cada célula tem um
 * multiplicador de custo por px percorrido (estrada < terra < labirinto < mar).
 *
 * Busca: como há UMA origem (o Cartógrafo) e MUITOS destinos (cada posição do
 * mouse), calculamos um único campo de Dijkstra a partir da origem (o "flow
 * field" recomendado pela skill) e cada consulta só refaz o caminho de volta,
 * em O(comprimento do caminho). O campo é refeito só quando a origem ou a bruma
 * mudam, nunca a cada quadro.
 *
 * Sem heurística, não há o risco de A* inadmissível com pesos < 1 (estrada).
 *
 * Funções puras e determinísticas; nada aqui depende do DOM.
 */

import { generateRoads, pointInPolygon, quadPoint } from "./adventure";
import { scoresFor } from "./scoring";
import { REALMS, WORLD_H, WORLD_W, islandPolygon, type Pt, type WorldGeometry } from "./world";

export const NAV_CELL = 10;
export const NAV_COLS = Math.ceil(WORLD_W / NAV_CELL); // 160
export const NAV_ROWS = Math.ceil(WORLD_H / NAV_CELL); // 100

/** Multiplicadores de custo por px (1 = terra aberta). */
export const COST = {
    road: 0.5, // estrada já vista: metade (era o "desconto de trilha")
    land: 1,
    labyrinth: 1.3, // território de desenho viciante: o terreno "prende"
    sea: 2, // travessia do vazio entre ilhas: possível, mas cara
} as const;

const KIND_SEA = 0;
const KIND_LAND = 1;
const KIND_ROAD = 2;

export interface NavGrid {
    kind: Uint8Array; // 0 mar, 1 terra, 2 estrada
    labyrinth: Uint8Array; // 1 = dentro de território "labirinto"
}

const gridCache = new WeakMap<WorldGeometry, NavGrid>();

export const cellIndex = (c: number, r: number) => r * NAV_COLS + c;
export const cellOf = (p: Pt): number => {
    const c = Math.max(0, Math.min(NAV_COLS - 1, Math.floor(p.x / NAV_CELL)));
    const r = Math.max(0, Math.min(NAV_ROWS - 1, Math.floor(p.y / NAV_CELL)));
    return cellIndex(c, r);
};
export const cellCenterNav = (i: number): Pt => ({
    x: (i % NAV_COLS) * NAV_CELL + NAV_CELL / 2,
    y: Math.floor(i / NAV_COLS) * NAV_CELL + NAV_CELL / 2,
});

/** Grade estática (terra/mar/estrada/labirinto), calculada uma vez por mundo. */
export function navGrid(world: WorldGeometry): NavGrid {
    const hit = gridCache.get(world);
    if (hit) return hit;
    const n = NAV_COLS * NAV_ROWS;
    const kind = new Uint8Array(n);
    const labyrinth = new Uint8Array(n);
    for (const realm of REALMS) {
        const poly = islandPolygon(realm);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of poly) {
            x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
            x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
        }
        const c0 = Math.max(0, Math.floor(x0 / NAV_CELL)), c1 = Math.min(NAV_COLS - 1, Math.floor(x1 / NAV_CELL));
        const r0 = Math.max(0, Math.floor(y0 / NAV_CELL)), r1 = Math.min(NAV_ROWS - 1, Math.floor(y1 / NAV_CELL));
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                const i = cellIndex(c, r);
                if (pointInPolygon(cellCenterNav(i), poly)) kind[i] = KIND_LAND;
            }
        }
    }
    for (const road of generateRoads(world)) {
        const len = Math.hypot(road.to.x - road.from.x, road.to.y - road.from.y);
        const steps = Math.max(2, Math.ceil(len / 3));
        for (let s = 0; s <= steps; s++) {
            const i = cellOf(quadPoint(road, s / steps));
            kind[i] = KIND_ROAD;
        }
    }
    for (const t of world.territories) {
        if (scoresFor(t.placeId).terrain !== "labirinto") continue;
        const c0 = Math.max(0, Math.floor((t.center.x - t.radius) / NAV_CELL));
        const c1 = Math.min(NAV_COLS - 1, Math.floor((t.center.x + t.radius) / NAV_CELL));
        const r0 = Math.max(0, Math.floor((t.center.y - t.radius) / NAV_CELL));
        const r1 = Math.min(NAV_ROWS - 1, Math.floor((t.center.y + t.radius) / NAV_CELL));
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                const i = cellIndex(c, r);
                const cc = cellCenterNav(i);
                if (Math.hypot(cc.x - t.center.x, cc.y - t.center.y) <= t.radius) labyrinth[i] = 1;
            }
        }
    }
    const grid = { kind, labyrinth };
    gridCache.set(world, grid);
    return grid;
}

/**
 * Multiplicador de custo de uma célula. `roadOpen(i)` decide se a estrada
 * daquela célula já é conhecida (sob a bruma ela custa como terra comum: a
 * rota não pode "vazar" o que ainda não foi explorado).
 */
export function cellCost(grid: NavGrid, i: number, roadOpen: (i: number) => boolean): number {
    const k = grid.kind[i];
    const base = k === KIND_SEA ? COST.sea : k === KIND_ROAD && roadOpen(i) ? COST.road : COST.land;
    return grid.labyrinth[i] ? base * COST.labyrinth : base;
}

export interface NavField {
    start: number;
    /** Custo acumulado (px ponderados) da origem até cada célula. */
    dist: Float64Array;
    prev: Int32Array;
    /** Multiplicador de cada célula, já resolvido (para custo de polilinhas). */
    mult: Float32Array;
}

// Heap binário mínimo (índices + prioridades), com remoção preguiçosa.
class MinHeap {
    private idx: number[] = [];
    private pri: number[] = [];
    get size() {
        return this.idx.length;
    }
    push(i: number, p: number) {
        const a = this.idx, b = this.pri;
        let k = a.length;
        a.push(i); b.push(p);
        while (k > 0) {
            const parent = (k - 1) >> 1;
            if (b[parent] <= p) break;
            a[k] = a[parent]; b[k] = b[parent];
            k = parent;
        }
        a[k] = i; b[k] = p;
    }
    pop(): [number, number] {
        const a = this.idx, b = this.pri;
        const top: [number, number] = [a[0], b[0]];
        const li = a.pop()!, lp = b.pop()!;
        const n = a.length;
        if (n) {
            let k = 0;
            for (;;) {
                const l = 2 * k + 1;
                if (l >= n) break;
                const r = l + 1;
                const m = r < n && b[r] < b[l] ? r : l;
                if (b[m] >= lp) break;
                a[k] = a[m]; b[k] = b[m];
                k = m;
            }
            a[k] = li; b[k] = lp;
        }
        return top;
    }
}

const NEIGHBORS: [number, number, number][] = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** Campo de Dijkstra a partir de `from` (8 vizinhos, sem cortar quinas por mar). */
export function buildField(grid: NavGrid, from: Pt, roadOpen: (i: number) => boolean): NavField {
    const n = NAV_COLS * NAV_ROWS;
    const mult = new Float32Array(n);
    for (let i = 0; i < n; i++) mult[i] = cellCost(grid, i, roadOpen);
    const dist = new Float64Array(n).fill(Infinity); // float64: comparar com a prioridade do heap sem erro de arredondamento
    const prev = new Int32Array(n).fill(-1);
    const start = cellOf(from);
    dist[start] = 0;
    const heap = new MinHeap();
    heap.push(start, 0);
    while (heap.size) {
        const [cur, d] = heap.pop();
        if (d > dist[cur]) continue; // entrada obsoleta
        const cx = cur % NAV_COLS;
        const cy = (cur - cx) / NAV_COLS;
        for (const [dx, dy, step] of NEIGHBORS) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= NAV_COLS || ny >= NAV_ROWS) continue;
            const ni = ny * NAV_COLS + nx;
            let m = (mult[cur] + mult[ni]) / 2;
            if (dx && dy) {
                // diagonal: paga a pior das duas quinas (não "escorrega" pela costa)
                m = Math.max(m, mult[cy * NAV_COLS + nx], mult[ny * NAV_COLS + cx]);
            }
            const nd = d + step * NAV_CELL * m;
            if (nd < dist[ni]) {
                dist[ni] = nd;
                prev[ni] = cur;
                heap.push(ni, nd);
            }
        }
    }
    return { start, dist, prev, mult };
}

/** Custo ponderado (px) de uma polilinha, amostrando o multiplicador a cada ~2 px. */
export function polylineCostPx(points: Pt[], mult: Float32Array): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += segmentCostPx(points[i - 1], points[i], mult);
    return total;
}

function segmentCostPx(a: Pt, b: Pt, mult: Float32Array): number {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) return 0;
    const steps = Math.max(1, Math.ceil(len / 2));
    let sum = 0;
    for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        sum += mult[cellOf({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })];
    }
    return (sum / steps) * len;
}

/** Remove vértices intermediários de trechos retos (a grade gera longas retas). */
function collapseCollinear(points: Pt[]): Pt[] {
    if (points.length <= 2) return points;
    const out: Pt[] = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        const a = out[out.length - 1], b = points[i], c = points[i + 1];
        const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        if (Math.abs(cross) > 1e-6) out.push(b);
    }
    out.push(points[points.length - 1]);
    return out;
}

/**
 * Alisa o caminho em escada da grade: pula vértices enquanto a reta não ficar
 * mais cara que o trecho de grade que ela substitui (corda mais curta sobre o
 * mesmo terreno). Mantém a rota fiel ao terreno, sem zigue-zague.
 */
function smooth(points: Pt[], mult: Float32Array): Pt[] {
    if (points.length <= 2) return points;
    const out: Pt[] = [points[0]];
    let anchor = 0;
    while (anchor < points.length - 1) {
        let best = anchor + 1;
        let gridCost = segmentCostPx(points[anchor], points[anchor + 1], mult);
        for (let j = anchor + 2; j < points.length && j - anchor <= 40; j++) {
            gridCost += segmentCostPx(points[j - 1], points[j], mult);
            if (segmentCostPx(points[anchor], points[j], mult) <= gridCost + 1e-6) best = j;
        }
        out.push(points[best]);
        anchor = best;
    }
    return out;
}

/** Caminho (polilinha alisada) da origem do campo até `goal`; null se inalcançável. */
export function pathTo(field: NavField, from: Pt, goal: Pt): Pt[] | null {
    const g = { x: Math.max(1, Math.min(WORLD_W - 1, goal.x)), y: Math.max(1, Math.min(WORLD_H - 1, goal.y)) };
    let i = cellOf(g);
    if (!Number.isFinite(field.dist[i])) return null;
    const cells: Pt[] = [];
    let guard = NAV_COLS * NAV_ROWS;
    while (i !== field.start && i >= 0 && guard-- > 0) {
        cells.push(cellCenterNav(i));
        i = field.prev[i];
    }
    cells.reverse();
    // pontas exatas: sai de onde o Cartógrafo está e chega onde se clicou
    const pts = [from, ...cells.slice(0, -1), g];
    return smooth(collapseCollinear(pts), field.mult);
}

export interface RoutePlan {
    /** Polilinha completa até o destino pedido. */
    points: Pt[];
    /** Custo acumulado (léguas) em cada vértice de `points`. */
    costs: number[];
    /** Custo total até o destino (léguas). */
    total: number;
    /** Até onde o orçamento alcança. */
    reach: { point: Pt; cost: number; truncated: boolean; points: Pt[] };
}

/** Corta a polilinha no ponto em que o orçamento acaba. */
export function planFromPath(points: Pt[], mult: Float32Array, pxPerLeague: number, available: number): RoutePlan {
    const costs = [0];
    for (let i = 1; i < points.length; i++) costs.push(costs[i - 1] + segmentCostPx(points[i - 1], points[i], mult) / pxPerLeague);
    const total = costs[costs.length - 1];
    if (total <= available || total === 0) {
        return { points, costs, total, reach: { point: points[points.length - 1], cost: total, truncated: false, points } };
    }
    let k = 1;
    while (k < points.length && costs[k] <= available) k++;
    const a = points[k - 1], b = points[k];
    const segCost = costs[k] - costs[k - 1];
    const t = segCost > 0 ? (available - costs[k - 1]) / segCost : 0;
    const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    return { points, costs, total, reach: { point, cost: available, truncated: true, points: [...points.slice(0, k), point] } };
}
