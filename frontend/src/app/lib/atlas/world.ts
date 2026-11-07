/**
 * O Multiverso como mapa de RPG.
 *
 * Princípios de design:
 *  - Geografia INVENTADA: um arquipélago procedural sem relação com
 *    continentes, países ou fronteiras reais. Ninguém chega com mapa mental
 *    prévio — nem preconceitos — sobre estas terras.
 *  - O desconhecido é HACHURADO. Antes de ir, não se vê marca, nome nem
 *    reputação: só a forma da terra. Primeiro se vive, depois se julga.
 *  - Tudo é determinístico (semente fixa): todos os viajantes habitam o
 *    MESMO mundo, o que permite rumores, caravanas e populações comparáveis.
 */

import { CATEGORIES, PLACES, PLACE_BY_ID } from "./catalog";
import { seededRandom } from "./multiverse";
import { scoresFor } from "./scoring";
import type { AtlasState, CategoryId, EffectiveUsage, Place } from "./types";

export const WORLD_W = 1600;
export const WORLD_H = 1000;
const WORLD_SEED = 0x5eed_a71a;

// ---------------------------------------------------------------------------
// Vocabulário próprio do Atlas (substitui seguir / curtir / compartilhar)
// ---------------------------------------------------------------------------

export const VOCAB = {
    follow: {
        verb: "Caravanar",
        action: "Juntar-se à caravana",
        noun: "caravana",
        description:
            "Viajar junto de alguém: os rumores das terras que essa pessoa desbravou aparecem nas suas hachuras.",
    },
    like: {
        verb: "Acender",
        action: "Acender uma lanterna",
        noun: "lanterna",
        description: "Deixar uma luz num território que valeu a viagem — para guiar outros viajantes.",
    },
    share: {
        verb: "Ecoar",
        action: "Ecoar",
        noun: "eco",
        description: "Fazer a descoberta ressoar em outras terras: suas plataformas, seus grupos, sua gente.",
    },
    inhabit: {
        verb: "Habitar",
        description: "Produzir, conversar, criar laços num território — ser parte da sua população.",
    },
    discover: { verb: "Fincar bandeira", description: "Revelar um território indo até ele." },
} as const;

// ---------------------------------------------------------------------------
// Reinos (um por bairro/categoria) — nomes que expressam a essência
// ---------------------------------------------------------------------------

export interface Realm {
    id: CategoryId;
    name: string;
    /** Preposição contraída para "em" + nome ("nas Ilhas…", "no Vale…"). */
    prep: "no" | "na" | "nos" | "nas";
    essence: string;
    /** Substantivo do epíteto dos territórios deste reino. */
    noun: string;
    color: string;
    center: { x: number; y: number };
    radius: number;
}

const REALM_DATA: Record<CategoryId, Omit<Realm, "id" | "color">> = {
    social: {
        name: "Ilhas do Burburinho",
        prep: "nas",
        essence: "Fogueiras onde se conversa em público, se mostra e se observa.",
        noun: "Praça",
        center: { x: 430, y: 300 },
        radius: 175,
    },
    video: {
        name: "Vale dos Espelhos",
        prep: "no",
        essence: "Telas que contam histórias, curtas e longas, gravadas e ao vivo.",
        noun: "Galeria de Espelhos",
        center: { x: 830, y: 210 },
        radius: 160,
    },
    messaging: {
        name: "Costa dos Pombais",
        prep: "na",
        essence: "Mensageiros que levam palavras de porta em porta.",
        noun: "Pombal",
        center: { x: 200, y: 600 },
        radius: 150,
    },
    knowledge: {
        name: "Planalto das Torres",
        prep: "no",
        essence: "Bibliotecas, mapas e escolas: onde se pergunta e se aprende.",
        noun: "Torre",
        center: { x: 1230, y: 290 },
        radius: 185,
    },
    audio: {
        name: "Colinas Ressonantes",
        prep: "nas",
        essence: "Sons que acompanham a vida — músicas, vozes, conversas gravadas.",
        noun: "Concha Acústica",
        center: { x: 680, y: 600 },
        radius: 140,
    },
    commerce: {
        name: "Enseada dos Bazares",
        prep: "na",
        essence: "Tendas de troca, de entrega e de moeda.",
        noun: "Bazar",
        center: { x: 1040, y: 650 },
        radius: 155,
    },
    civic: {
        name: "Terras da Ágora",
        prep: "nas",
        essence: "Onde se exercem direitos, se cobram contas e se decide em comum.",
        noun: "Ágora",
        center: { x: 1390, y: 720 },
        radius: 140,
    },
    play: {
        name: "Bosque dos Jogos e Ofícios",
        prep: "no",
        essence: "Arenas para brincar e oficinas para criar.",
        noun: "Arena",
        center: { x: 420, y: 850 },
        radius: 130,
    },
};

export const REALMS: Realm[] = CATEGORIES.map((c) => ({ id: c.id, color: c.color, ...REALM_DATA[c.id] }));
export const REALM_BY_ID = Object.fromEntries(REALMS.map((r) => [r.id, r])) as Record<CategoryId, Realm>;

// ---------------------------------------------------------------------------
// Geometria procedural
// ---------------------------------------------------------------------------

export interface Pt {
    x: number;
    y: number;
}

/** Contorno orgânico fechado por ruído polar (soma de harmônicos). */
export function blobPoints(center: Pt, radius: number, seed: number, roughness: number, n = 64): Pt[] {
    const rand = seededRandom(seed);
    const harmonics = [2, 3, 4, 5, 7, 9].map((k) => ({
        k,
        a: (rand() * roughness) / Math.sqrt(k - 1),
        phi: rand() * Math.PI * 2,
    }));
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        let r = 1;
        for (const h of harmonics) r += h.a * Math.sin(h.k * t + h.phi);
        pts.push({ x: center.x + radius * r * Math.cos(t), y: center.y + radius * r * Math.sin(t) });
    }
    return pts;
}

/** Catmull-Rom fechado → path SVG com curvas cúbicas suaves. */
export function smoothPath(pts: Pt[]): string {
    const n = pts.length;
    const f = (v: number) => v.toFixed(1);
    let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
    for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n];
        const p1 = pts[i];
        const p2 = pts[(i + 1) % n];
        const p3 = pts[(i + 2) % n];
        const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
        const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
        d += ` C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(p2.x)},${f(p2.y)}`;
    }
    return d + "Z";
}

function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h ^ WORLD_SEED) >>> 0;
}

export interface Territory {
    placeId: string;
    realm: CategoryId;
    center: Pt;
    radius: number;
    path: string;
}

export interface WorldGeometry {
    islands: { realm: CategoryId; path: string; shore: string }[];
    territories: Territory[];
}

/** Volume de conteúdo efetivo (cai para a população quando não há dado). */
export function contentVolumeOf(p: Place): number {
    return p.contentVolume ?? p.population ?? 2;
}

/** O tamanho do território expressa o VOLUME DE CONTEÚDO produzido/hospedado. */
function territoryRadius(p: Place): number {
    return 18 + contentVolumeOf(p) * 4;
}

/**
 * Gera o mundo inteiro. Posições dependem só do catálogo e da semente —
 * nunca do uso individual — para que todos vejam o mesmo multiverso.
 */
export function generateWorld(): WorldGeometry {
    const islands: WorldGeometry["islands"] = [];
    const territories: Territory[] = [];
    for (const realm of REALMS) {
        const seed = hash(realm.id);
        islands.push({
            realm: realm.id,
            path: smoothPath(blobPoints(realm.center, realm.radius, seed, 0.13, 72)),
            shore: smoothPath(blobPoints(realm.center, realm.radius * 1.08, seed, 0.13, 72)),
        });
        const places = PLACES.filter((p) => p.category === realm.id).sort((a, b) => hash(a.id) - hash(b.id));
        const nodes = places.map((p, i) => {
            const r = i === 0 ? 0 : realm.radius * 0.2 * Math.sqrt(i + 0.4);
            const a = i * 2.399963 + (seed % 628) / 100;
            return { p, x: realm.center.x + r * Math.cos(a), y: realm.center.y + r * Math.sin(a), r: territoryRadius(p) };
        });
        for (let iter = 0; iter < 200; iter++) {
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const A = nodes[i];
                    const B = nodes[j];
                    const min = A.r + B.r + 6;
                    const dx = B.x - A.x;
                    const dy = B.y - A.y;
                    const d = Math.hypot(dx, dy) || 0.01;
                    if (d >= min) continue;
                    const push = (min - d) / d / 2;
                    A.x -= dx * push;
                    A.y -= dy * push;
                    B.x += dx * push;
                    B.y += dy * push;
                }
            }
            for (const n of nodes) {
                const dx = n.x - realm.center.x;
                const dy = n.y - realm.center.y;
                const d = Math.hypot(dx, dy);
                const max = realm.radius * 0.86 - n.r;
                if (d > max) {
                    n.x = realm.center.x + (dx / d) * max;
                    n.y = realm.center.y + (dy / d) * max;
                }
            }
        }
        for (const n of nodes) {
            territories.push({
                placeId: n.p.id,
                realm: realm.id,
                center: { x: n.x, y: n.y },
                radius: n.r,
                path: smoothPath(blobPoints({ x: n.x, y: n.y }, n.r, hash(n.p.id), 0.1, 28)),
            });
        }
    }
    return { islands, territories };
}

// ---------------------------------------------------------------------------
// Descoberta e visibilidade
// ---------------------------------------------------------------------------

export type Visibility = "incognita" | "silhouette" | "discovered";

/** Conjunto de territórios descobertos: uso real ∪ expedições ∪ marcados. */
export function discoveredSet(state: AtlasState, usage: EffectiveUsage[]): Set<string> {
    return new Set(
        [...usage.map((u) => u.placeId), ...Object.keys(state.explored), ...Object.keys(state.discoveries ?? {})].filter(
            (id) => PLACE_BY_ID[id],
        ),
    );
}

export function revealedRealms(discovered: Set<string>): Set<CategoryId> {
    return new Set([...discovered].map((id) => PLACE_BY_ID[id].category));
}

export function visibilityOf(placeId: string, discovered: Set<string>, realms: Set<CategoryId>): Visibility {
    if (discovered.has(placeId)) return "discovered";
    return realms.has(PLACE_BY_ID[placeId].category) ? "silhouette" : "incognita";
}

/** Destino às cegas dentro de um reino (sem revelar qual é). */
export function blindTarget(realm: CategoryId, discovered: Set<string>, seed: number): string | null {
    const options = PLACES.filter((p) => p.category === realm && !discovered.has(p.id));
    if (!options.length) return null;
    return options[Math.floor(seededRandom(seed)() * options.length)].id;
}

/**
 * Bússola do acaso: sorteia um território nunca visto, priorizando reinos
 * inteiramente desconhecidos — aponta para fora da bolha.
 */
export function randomExpedition(discovered: Set<string>, seed: number): string | null {
    const undiscovered = PLACES.filter((p) => !discovered.has(p.id));
    if (!undiscovered.length) return null;
    const realms = revealedRealms(discovered);
    const farAway = undiscovered.filter((p) => !realms.has(p.category));
    const pool = farAway.length ? farAway : undiscovered;
    return pool[Math.floor(seededRandom(seed)() * pool.length)].id;
}

/**
 * Alternativas mais bem qualificadas que AINDA estão sob hachura — o drawer
 * mostra só quantas são e oferece uma expedição, sem revelar nomes.
 */
export function hiddenBetterAlternatives(placeId: string, discovered: Set<string>): string[] {
    const from = PLACE_BY_ID[placeId];
    if (!from) return [];
    const base = scoresFor(placeId).health;
    return PLACES.filter((p) => p.category === from.category && !discovered.has(p.id) && scoresFor(p.id).health > base)
        .sort((a, b) => scoresFor(b.id).health - scoresFor(a.id).health)
        .map((p) => p.id);
}

// ---------------------------------------------------------------------------
// Epítetos — o nome de essência de cada território
// ---------------------------------------------------------------------------

/**
 * Epíteto derivado dos atributos (nunca da marca). É o que um rumor revela
 * antes da expedição, e o subtítulo do território depois da descoberta.
 */
export function epithet(place: Place): string {
    const a = place.attributes;
    const noun = REALM_BY_ID[place.category].noun;
    let q: string;
    if (a.federated === "yes") q = "sem Coroa";
    else if (a.businessModel === "public") q = "do Povo";
    else if (a.e2eDefault === true && a.openSource === "yes") q = "dos Selos Abertos";
    else if (a.e2eDefault === true) q = "dos Selos";
    else if (a.feedChoice === true) q = "das Mil Bússolas";
    else if (a.infiniteFeed === true && a.autoplay === true) q = "sem Fim";
    else if (a.openSource === "yes" && a.businessModel === "donation") q = "dos Mecenas";
    else if (a.businessModel === "donation") q = "dos Mecenas";
    else if (a.infiniteFeed === true) q = "das Correntezas";
    else if (a.businessModel === "ads") q = "dos Arautos";
    else if (a.businessModel === "subscription") q = "dos Assinantes";
    else if (a.businessModel === "transaction") q = "das Trocas";
    else if (a.chronologicalOption === true) q = "do Relógio";
    else q = "das Brumas";
    return `${noun} ${q}`;
}

export const EPITHET_GLOSSARY: Record<string, string> = {
    "sem Coroa": "federado — nenhum dono único",
    "do Povo": "serviço público",
    "dos Selos Abertos": "criptografado e de código aberto",
    "dos Selos": "criptografia ponta-a-ponta por padrão",
    "das Mil Bússolas": "você escolhe o algoritmo",
    "sem Fim": "feed infinito com autoplay",
    "dos Mecenas": "sustentado por doações",
    "das Correntezas": "feed infinito",
    "dos Arautos": "financiado por anúncios",
    "dos Assinantes": "pago por assinatura",
    "das Trocas": "vive de transações",
    "do Relógio": "ordem cronológica disponível",
    "das Brumas": "atributos ainda pouco conhecidos",
};

/**
 * Sigilo da essência do LOCAL (não do reino). Dois territórios do mesmo
 * reino podem ter sigilos diferentes, expressando o que cada um é por dentro.
 * A ordem de prioridade acompanha a do epíteto, para que marca e nome batam.
 */
export type Sigil =
    | "network"
    | "columns"
    | "shield"
    | "compass"
    | "vortex"
    | "heart"
    | "wave"
    | "megaphone"
    | "ticket"
    | "coin"
    | "clock"
    | "mist";

export function placeSigil(place: Place): Sigil {
    const a = place.attributes;
    if (a.federated === "yes") return "network";
    if (a.businessModel === "public") return "columns";
    if (a.e2eDefault === true) return "shield";
    if (a.feedChoice === true) return "compass";
    if (a.infiniteFeed === true && a.autoplay === true) return "vortex";
    if (a.businessModel === "donation") return "heart";
    if (a.infiniteFeed === true) return "wave";
    if (a.businessModel === "ads") return "megaphone";
    if (a.businessModel === "subscription") return "ticket";
    if (a.businessModel === "transaction") return "coin";
    if (a.chronologicalOption === true) return "clock";
    return "mist";
}

export const SIGIL_MEANING: Record<Sigil, string> = {
    network: "federado — nenhum dono único",
    columns: "serviço público",
    shield: "criptografia ponta-a-ponta",
    compass: "você escolhe o algoritmo",
    vortex: "feed infinito com autoplay",
    heart: "sustentado por doações",
    wave: "feed infinito",
    megaphone: "financiado por anúncios",
    ticket: "pago por assinatura",
    coin: "vive de transações",
    clock: "ordem cronológica disponível",
    mist: "essência ainda pouco conhecida",
};

/**
 * Bioma do terreno (linguagem do blueprint do Atlas Cognitivo): traduz o
 * terreno de qualificação numa paisagem arquetípica.
 */
export const TERRAIN_BIOME: Record<string, { biome: string; blurb: string }> = {
    clareira: { biome: "Recife Bioluminescente", blurb: "águas claras, portos abertos, luz própria" },
    trilha: { biome: "Planalto Temperado", blurb: "relevo misto, trilhas que pedem atenção" },
    labirinto: { biome: "Bazar Cyberpunk", blurb: "vielas sem fim, letreiros que não apagam" },
};
