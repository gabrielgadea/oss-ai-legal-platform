/**
 * Qualificação dos lugares — fórmula aberta e auditável.
 *
 * Cada dimensão parte de uma base neutra e soma/subtrai pontos por atributo
 * observável. Atributo desconhecido (`null`) não pontua e reduz a confiança.
 * O objetivo NÃO é dizer "lugar bom/ruim", e sim tornar visível o desenho
 * que cada lugar impõe à atenção, à privacidade e à autonomia de quem o usa.
 */

import { PLACE_BY_ID } from "./catalog";
import type {
    Place,
    PlaceAttributes,
    PlaceScores,
    ScoreDimension,
    Terrain,
} from "./types";

export const DIMENSION_LABELS: Record<ScoreDimension, string> = {
    privacy: "Privacidade",
    attention: "Atenção",
    agency: "Autonomia",
    openness: "Abertura",
};

export const DIMENSION_HELP: Record<ScoreDimension, string> = {
    privacy:
        "Quanto o modelo de negócio depende de vigiar você. Anúncios (−), criptografia ponta-a-ponta (+), código aberto (+).",
    attention:
        "Quanto o desenho respeita seu tempo. Feed infinito (−), autoplay (−), opção cronológica (+).",
    agency:
        "Quanto você controla a experiência e pode sair levando sua rede. Feed cronológico, escolha de algoritmo, federação.",
    openness:
        "Código aberto e protocolos federados — ninguém é dono sozinho do lugar.",
};

/** Pesos do índice de saúde composto. Somam 1. */
export const HEALTH_WEIGHTS: Record<ScoreDimension, number> = {
    attention: 0.35,
    privacy: 0.3,
    agency: 0.2,
    openness: 0.15,
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function tri(v: boolean | null, ifTrue: number, ifFalse: number): number {
    if (v === true) return ifTrue;
    if (v === false) return ifFalse;
    return 0;
}

function open(v: "yes" | "partial" | "no", full: number): number {
    if (v === "yes") return full;
    if (v === "partial") return full / 2;
    return 0;
}

export function privacyScore(a: PlaceAttributes): number {
    let s = 50;
    if (a.businessModel === "ads") s -= 25;
    else if (a.businessModel === "mixed" || a.businessModel === "freemium") s -= 5;
    else s += 10; // assinatura, doação, público, transação
    s += tri(a.e2eDefault, 30, -10);
    s += open(a.openSource, 15);
    return clamp(s);
}

export function attentionScore(a: PlaceAttributes): number {
    let s = 75;
    s += tri(a.infiniteFeed, -30, 10);
    s += tri(a.autoplay, -20, 5);
    s += tri(a.chronologicalOption, 10, -5);
    return clamp(s);
}

export function agencyScore(a: PlaceAttributes): number {
    let s = 40;
    s += tri(a.chronologicalOption, 15, -5);
    s += tri(a.feedChoice, 20, -5);
    s += open(a.federated, 20);
    s += open(a.openSource, 10);
    return clamp(s);
}

export function opennessScore(a: PlaceAttributes): number {
    return clamp(open(a.openSource, 50) + open(a.federated, 50));
}

export function terrainFor(health: number): Terrain {
    if (health >= 65) return "clareira";
    if (health >= 40) return "trilha";
    return "labirinto";
}

export const TERRAIN_INFO: Record<
    Terrain,
    { label: string; description: string; color: string }
> = {
    clareira: {
        label: "Clareira",
        description: "Lugar aberto: o desenho tende a respeitar seu tempo e seus dados.",
        color: "#0f8a3c",
    },
    trilha: {
        label: "Trilha",
        description: "Caminho misto: há escolhas de design que puxam a atenção ou os dados.",
        color: "#b27300",
    },
    labirinto: {
        label: "Labirinto",
        description:
            "Desenho feito para reter: feeds sem fim, autoplay e modelo baseado em anúncios.",
        color: "#c4312f",
    },
};

const TRI_KEYS: (keyof PlaceAttributes)[] = [
    "e2eDefault",
    "infiniteFeed",
    "autoplay",
    "chronologicalOption",
    "feedChoice",
];

export function scorePlace(place: Place): PlaceScores {
    const a = place.attributes;
    const privacy = privacyScore(a);
    const attention = attentionScore(a);
    const agency = agencyScore(a);
    const openness = opennessScore(a);
    const health = clamp(
        privacy * HEALTH_WEIGHTS.privacy +
            attention * HEALTH_WEIGHTS.attention +
            agency * HEALTH_WEIGHTS.agency +
            openness * HEALTH_WEIGHTS.openness,
    );
    // e2eDefault só é aplicável a mensageria; fora dela não conta como lacuna.
    const applicable = TRI_KEYS.filter(
        (k) => k !== "e2eDefault" || place.category === "messaging",
    );
    const known = applicable.filter((k) => a[k] !== null).length;
    return {
        privacy,
        attention,
        agency,
        openness,
        health,
        confidence: known / applicable.length,
        terrain: terrainFor(health),
    };
}

const SCORE_CACHE = new Map<string, PlaceScores>();

export function scoresFor(placeId: string): PlaceScores {
    let s = SCORE_CACHE.get(placeId);
    if (!s) {
        const place = PLACE_BY_ID[placeId];
        if (!place) throw new Error(`Lugar desconhecido: ${placeId}`);
        s = scorePlace(place);
        SCORE_CACHE.set(placeId, s);
    }
    return s;
}

/** Explicação legível dos atributos que mais pesam num lugar. */
export function attributeHighlights(place: Place): { text: string; positive: boolean }[] {
    const a = place.attributes;
    const out: { text: string; positive: boolean }[] = [];
    if (a.businessModel === "ads") out.push({ text: "Financiado por anúncios", positive: false });
    if (a.businessModel === "donation") out.push({ text: "Sem fins lucrativos / doações", positive: true });
    if (a.businessModel === "public") out.push({ text: "Serviço público", positive: true });
    if (a.businessModel === "subscription") out.push({ text: "Pago por assinatura", positive: true });
    if (a.openSource === "yes") out.push({ text: "Código aberto", positive: true });
    if (a.openSource === "partial") out.push({ text: "Código parcialmente aberto", positive: true });
    if (a.federated === "yes") out.push({ text: "Federado (sem dono único)", positive: true });
    if (a.federated === "partial") out.push({ text: "Parcialmente federado", positive: true });
    if (a.e2eDefault === true) out.push({ text: "Criptografia ponta-a-ponta por padrão", positive: true });
    if (a.e2eDefault === false) out.push({ text: "Sem criptografia ponta-a-ponta por padrão", positive: false });
    if (a.infiniteFeed === true) out.push({ text: "Feed infinito", positive: false });
    if (a.infiniteFeed === false) out.push({ text: "Sem feed infinito", positive: true });
    if (a.autoplay === true) out.push({ text: "Autoplay", positive: false });
    if (a.chronologicalOption === true) out.push({ text: "Opção cronológica", positive: true });
    if (a.chronologicalOption === false) out.push({ text: "Sem opção cronológica", positive: false });
    if (a.feedChoice === true) out.push({ text: "Você escolhe o algoritmo", positive: true });
    return out;
}
