/**
 * Mapa de aventura — terreno pintado no gênero dos mapas de estratégia de
 * fantasia por turnos (costas, florestas, montanhas, estradas, castelos).
 *
 * Arte 100% procedural e original: nenhum asset, nome ou interface de jogo
 * existente é reproduzido. Tudo é determinístico (mesma semente → mesmo mundo)
 * e independente do uso individual, para que todos explorem o MESMO mapa.
 *
 * Cada reino recebe um bioma que expressa sua essência digital:
 *   Praça social → campina verdejante · Vídeo → floresta de outono
 *   Mensagens → costa de palmeiras · Conhecimento → tundra de altas montanhas
 *   Áudio → colinas · Comércio → deserto de bazares
 *   Cidadania → planalto pedregoso · Jogos/criação → selva
 */

import { seededRandom } from "./multiverse";
import type { CategoryId } from "./types";
import { REALMS, generateWorld, islandPolygon, type Pt, type WorldGeometry } from "./world";

export type Biome = "meadow" | "autumn" | "coast" | "tundra" | "hills" | "desert" | "highland" | "jungle";

export type DecorKind =
    | "tree"
    | "autumnTree"
    | "pine"
    | "palm"
    | "mountain"
    | "snowMountain"
    | "hill"
    | "rock"
    | "cactus"
    | "dune"
    | "flower"
    | "mushroom"
    | "bush";

export interface BiomeStyle {
    label: string;
    ground: string;
    groundDark: string;
    groundLight: string;
    /** Decorações e pesos relativos. */
    decor: [DecorKind, number][];
    /** Densidade: px² de terra por decoração (menor = mais denso). */
    density: number;
}

export const REALM_BIOME: Record<CategoryId, Biome> = {
    social: "meadow",
    video: "autumn",
    messaging: "coast",
    knowledge: "tundra",
    audio: "hills",
    commerce: "desert",
    civic: "highland",
    play: "jungle",
};

export const BIOME_STYLE: Record<Biome, BiomeStyle> = {
    meadow: {
        label: "Campina",
        ground: "#5e9a36",
        groundDark: "#3f7426",
        groundLight: "#86bd4f",
        decor: [["tree", 5], ["bush", 3], ["flower", 4], ["rock", 0.6]],
        density: 520,
    },
    autumn: {
        label: "Floresta de outono",
        ground: "#7c8a35",
        groundDark: "#56601f",
        groundLight: "#a3a84a",
        decor: [["autumnTree", 9], ["tree", 2], ["bush", 1.5], ["rock", 0.5]],
        density: 360,
    },
    coast: {
        label: "Costa das palmeiras",
        ground: "#55a052",
        groundDark: "#3a7a3e",
        groundLight: "#7cc06a",
        decor: [["palm", 5], ["bush", 3], ["tree", 2], ["flower", 2]],
        density: 560,
    },
    tundra: {
        label: "Tundra das altas montanhas",
        ground: "#dfe8ee",
        groundDark: "#b6c6d2",
        groundLight: "#f6fafc",
        decor: [["snowMountain", 4], ["pine", 6], ["rock", 1]],
        density: 430,
    },
    hills: {
        label: "Colinas",
        ground: "#6aa043",
        groundDark: "#4a7d2c",
        groundLight: "#8fbf5b",
        decor: [["hill", 5], ["tree", 3], ["flower", 2], ["bush", 1.5]],
        density: 520,
    },
    desert: {
        label: "Deserto dos bazares",
        ground: "#d8b468",
        groundDark: "#b48e46",
        groundLight: "#ecd08e",
        decor: [["dune", 5], ["cactus", 3], ["rock", 2], ["palm", 0.7]],
        density: 620,
    },
    highland: {
        label: "Planalto pedregoso",
        ground: "#9a8a62",
        groundDark: "#776843",
        groundLight: "#b8a87c",
        decor: [["rock", 5], ["mountain", 2.5], ["pine", 2], ["bush", 1.5]],
        density: 500,
    },
    jungle: {
        label: "Selva",
        ground: "#3d7a35",
        groundDark: "#2a5a24",
        groundLight: "#5d9b48",
        decor: [["tree", 7], ["bush", 4], ["mushroom", 1.5], ["flower", 1]],
        density: 330,
    },
};

export interface Decoration {
    kind: DecorKind;
    realm: CategoryId;
    x: number;
    y: number;
    /** Escala (px). */
    s: number;
    /** Variante 0–1 (cor/forma). */
    v: number;
}

export interface Road {
    realm: CategoryId;
    from: Pt;
    to: Pt;
    ctrl: Pt;
}

// ── Geometria utilitária ───────────────────────────────────────────────────

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i];
        const b = poly[j];
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

/** Polígono encolhido em direção a um centro (para manter a praia livre). */
function shrink(poly: Pt[], center: Pt, k: number): Pt[] {
    return poly.map((p) => ({ x: center.x + (p.x - center.x) * k, y: center.y + (p.y - center.y) * k }));
}

function polygonArea(poly: Pt[]): number {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
    return Math.abs(a / 2);
}

function hashStr(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}

/** Ponto de uma curva quadrática. */
export function quadPoint(r: Road, t: number): Pt {
    const u = 1 - t;
    return {
        x: u * u * r.from.x + 2 * u * t * r.ctrl.x + t * t * r.to.x,
        y: u * u * r.from.y + 2 * u * t * r.ctrl.y + t * t * r.to.y,
    };
}

// ── Estradas: árvore geradora mínima entre as cidades de cada reino ─────────

export function generateRoads(world: WorldGeometry): Road[] {
    const roads: Road[] = [];
    for (const realm of REALMS) {
        const towns = world.territories.filter((t) => t.realm === realm.id);
        if (towns.length < 2) continue;
        const rand = seededRandom(hashStr("roads:" + realm.id));
        // Prim
        const inTree = new Set<number>([0]);
        while (inTree.size < towns.length) {
            let best: [number, number, number] | null = null;
            for (const i of inTree) {
                for (let j = 0; j < towns.length; j++) {
                    if (inTree.has(j)) continue;
                    const d = Math.hypot(towns[i].center.x - towns[j].center.x, towns[i].center.y - towns[j].center.y);
                    if (!best || d < best[2]) best = [i, j, d];
                }
            }
            if (!best) break;
            const [i, j] = best;
            inTree.add(j);
            const a = towns[i].center;
            const b = towns[j].center;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const off = (rand() - 0.5) * 0.45 * len;
            roads.push({
                realm: realm.id,
                from: a,
                to: b,
                ctrl: { x: mx + (-(b.y - a.y) / len) * off, y: my + ((b.x - a.x) / len) * off },
            });
        }
    }
    return roads;
}

// ── Decorações procedurais ──────────────────────────────────────────────────

function pickWeighted(rand: () => number, items: [DecorKind, number][]): DecorKind {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = rand() * total;
    for (const [k, w] of items) {
        r -= w;
        if (r <= 0) return k;
    }
    return items[items.length - 1][0];
}

const CLEARING = 16; // folga ao redor de cada cidade
const ROAD_CLEARANCE = 9;

export function generateDecorations(world: WorldGeometry, roads: Road[]): Decoration[] {
    const out: Decoration[] = [];
    const roadPts = roads.flatMap((r) => Array.from({ length: 24 }, (_, i) => quadPoint(r, i / 23)));
    for (const realm of REALMS) {
        const style = BIOME_STYLE[REALM_BIOME[realm.id]];
        const poly = islandPolygon(realm);
        const inner = shrink(poly, realm.center, 0.88);
        const towns = world.territories.filter((t) => t.realm === realm.id);
        const rand = seededRandom(hashStr("decor:" + realm.id));
        const target = Math.round(polygonArea(inner) / style.density);
        const free = (x: number, y: number, pad = 0) =>
            pointInPolygon({ x, y }, inner) &&
            towns.every((t) => Math.hypot(t.center.x - x, t.center.y - y) > t.radius + CLEARING + pad) &&
            roadPts.every((p) => Math.hypot(p.x - x, p.y - y) > ROAD_CLEARANCE + pad);
        let placed = 0;
        let tries = 0;
        while (placed < target && tries < target * 12) {
            tries++;
            const x = realm.center.x + (rand() * 2 - 1) * realm.radius * 1.15;
            const y = realm.center.y + (rand() * 2 - 1) * realm.radius * 1.15;
            if (!free(x, y)) continue;
            const kind = pickWeighted(rand, style.decor);
            if (kind === "mountain" || kind === "snowMountain") {
                // cordilheira: 3–5 picos agrupados
                const peaks = 3 + Math.floor(rand() * 3);
                for (let k = 0; k < peaks; k++) {
                    const px = x + (rand() - 0.5) * 34;
                    const py = y + (rand() - 0.5) * 18;
                    if (!free(px, py, 4)) continue;
                    out.push({ kind, realm: realm.id, x: px, y: py, s: 9 + rand() * 7, v: rand() });
                    placed++;
                }
                continue;
            }
            const base = kind === "flower" ? 3 : kind === "dune" ? 9 : kind === "hill" ? 10 : kind === "rock" ? 4 : 7;
            out.push({ kind, realm: realm.id, x, y, s: base * (0.8 + rand() * 0.5), v: rand() });
            placed++;
        }
    }
    // ordem de pintura: de cima para baixo (pseudo-profundidade)
    return out.sort((a, b) => a.y - b.y);
}

export interface Adventure {
    world: WorldGeometry;
    roads: Road[];
    decorations: Decoration[];
}

let cache: Adventure | null = null;

/** Mundo de aventura completo (memoizado: é determinístico). */
export function generateAdventure(): Adventure {
    if (cache) return cache;
    const world = generateWorld();
    const roads = generateRoads(world);
    const decorations = generateDecorations(world, roads);
    cache = { world, roads, decorations };
    return cache;
}
