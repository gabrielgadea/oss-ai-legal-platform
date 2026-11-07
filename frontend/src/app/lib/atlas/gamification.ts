/**
 * Gamificação do Atlas — recompensa CONSCIÊNCIA e EXPLORAÇÃO, nunca tempo
 * de tela. Nenhuma regra dá XP por usar mais; as missões premiam mapear,
 * diversificar, experimentar alternativas e decidir a própria rota.
 */

import { CATEGORIES, PLACE_BY_ID } from "./catalog";
import type { AtlasMetrics } from "./metrics";
import { scoresFor } from "./scoring";
import type { AtlasState, EffectiveUsage } from "./types";

export const XP_RULES = {
    perExploredPlace: 40,
    perExploredCategory: 100,
    perImportSource: 150,
    perRouteDecision: 60,
    perBadge: 120,
    perMission: 200,
    perExpedition: 60,
    /** Lanternas e ecos rendem XP com teto, para não virar spam. */
    perLantern: 10,
    lanternCap: 10,
    perEcho: 25,
    echoCap: 8,
    perCaravan: 50,
    caravanCap: 5,
    perBridge: 150,
} as const;

export const LEVELS = [
    { min: 0, title: "Turista", description: "Ainda vendo o mapa pela primeira vez." },
    { min: 300, title: "Explorador", description: "Começou a sair do caminho de sempre." },
    { min: 800, title: "Cartógrafo", description: "Mapeia o próprio território com dados reais." },
    { min: 1600, title: "Navegador", description: "Escolhe rotas em vez de ser levado por elas." },
    { min: 3000, title: "Desbravador", description: "Conhece clareiras que poucos visitam." },
    { min: 5000, title: "Viajante do Multiverso", description: "Transita livremente entre mundos digitais." },
];

export interface Badge {
    id: string;
    name: string;
    description: string;
    earned: boolean;
    progress: number; // 0–1
}

export interface Mission {
    id: string;
    title: string;
    description: string;
    done: boolean;
    progress: number; // 0–1
}

export interface GameStatus {
    xp: number;
    level: (typeof LEVELS)[number];
    nextLevel: (typeof LEVELS)[number] | null;
    levelProgress: number;
    badges: Badge[];
    missions: Mission[];
    xpBreakdown: { label: string; xp: number }[];
}

interface Ctx {
    state: AtlasState;
    usage: EffectiveUsage[];
    metrics: AtlasMetrics;
}

const ratio = (v: number, target: number) => Math.max(0, Math.min(1, v / target));

function exploredIds(ctx: Ctx): string[] {
    return [
        ...new Set([
            ...ctx.usage.map((u) => u.placeId),
            ...Object.keys(ctx.state.explored),
            ...Object.keys(ctx.state.discoveries ?? {}),
        ]),
    ].filter((id) => PLACE_BY_ID[id]);
}

function expeditions(ctx: Ctx): number {
    return Object.values(ctx.state.discoveries ?? {}).filter((d) => d.method === "expedition").length;
}

function echoCount(ctx: Ctx): number {
    return Object.values(ctx.state.echoes ?? {}).reduce((a, b) => a + b, 0);
}

function computeBadges(ctx: Ctx): Badge[] {
    const ids = exploredIds(ctx);
    const places = ids.map((id) => PLACE_BY_ID[id]);
    const imports = new Set(ctx.state.imports.map((i) => i.source)).size;
    const federated = places.filter((p) => p.attributes.federated !== "no").length;
    const openSrc = places.filter((p) => p.attributes.openSource === "yes").length;
    const e2e = places.filter((p) => p.attributes.e2eDefault === true).length;
    const civic = places.filter((p) => p.category === "civic").length;
    const cats = new Set(places.map((p) => p.category)).size;
    const m = ctx.metrics;
    const total = m.totalWeeklyMinutes || 1;
    const libraryShare = (m.byCategory.knowledge / total) * 100;
    const hasData = ctx.usage.length > 0;
    const clareiras = ids.filter((id) => scoresFor(id).terrain === "clareira").length;

    const b = (id: string, name: string, description: string, progress: number): Badge => ({
        id,
        name,
        description,
        progress,
        earned: progress >= 1,
    });

    return [
        b("first-map", "Primeiro Mapa", "Registre sua atividade pela primeira vez.", hasData ? 1 : 0),
        b("data-cartographer", "Cartógrafo de Dados", "Importe dados reais de 2 fontes diferentes.", ratio(imports, 2)),
        b("polymath", "Polímata", "Alcance diversidade ≥ 60 entre bairros.", hasData ? ratio(m.diversity, 60) : 0),
        b("out-of-bubble", "Fora da Bolha", "Seus 3 lugares mais usados somam menos de 60% do tempo.",
            hasData ? (m.top3Share < 60 ? 1 : ratio(100 - m.top3Share, 40)) : 0),
        b("clearing", "Clareira", "Atenção saudável ≥ 65 (média ponderada pelo tempo).", hasData ? ratio(m.healthyAttention, 65) : 0),
        b("fediverse", "Fediverso", "Explore um lugar federado (sem dono único).", ratio(federated, 1)),
        b("open-source", "Código Aberto", "Explore 3 lugares de código aberto.", ratio(openSrc, 3)),
        b("privacy-guardian", "Guardião da Privacidade", "Use um mensageiro criptografado por padrão.", ratio(e2e, 1)),
        b("digital-citizen", "Cidadão Digital", "Explore 2 lugares da Ágora (serviços públicos).", ratio(civic, 2)),
        b("living-library", "Biblioteca Viva", "Biblioteca ≥ 15% do seu tempo semanal.", hasData ? ratio(libraryShare, 15) : 0),
        b("traveler", "Viajante", "Explore 15 lugares diferentes.", ratio(ids.length, 15)),
        b("clearing-finder", "Achador de Clareiras", "Explore 5 lugares do tipo Clareira.", ratio(clareiras, 5)),
        b("multiverse", "Multiverso", `Revele todos os ${CATEGORIES.length} reinos.`, ratio(cats, CATEGORIES.length)),
        b("first-expedition", "Primeira Expedição", "Atravesse a hachura e revele um território indo até ele.", ratio(expeditions(ctx), 1)),
        b("hatch-breaker", "Rompe-Hachuras", "Revele 10 territórios por expedição.", ratio(expeditions(ctx), 10)),
        b("lamplighter", "Acendedor", "Acenda 5 lanternas em territórios que valeram a viagem.", ratio(Object.keys(ctx.state.lanterns ?? {}).length, 5)),
        b("echo", "Eco", "Ecoe 3 descobertas para outras terras.", ratio(echoCount(ctx), 3)),
        b("caravaneer", "Caravaneiro", "Junte-se à caravana de outro viajante.", ratio((ctx.state.caravan ?? []).length, 1)),
        b("bridge", "Ponte", "Conecte uma plataforma para importar e devolver descobertas.", ratio(Object.keys(ctx.state.connectors ?? {}).length, 1)),
    ];
}

function computeMissions(ctx: Ctx): Mission[] {
    const ids = exploredIds(ctx);
    const decisions = Object.values(ctx.state.decisions);
    const changes = decisions.filter((d) => d.decision !== "stay").length;
    const withTarget = decisions.filter((d) => d.target).length;
    const labyrinthUsed = ctx.usage.filter((u) => scoresFor(u.placeId).terrain === "labirinto");
    const labyrinthDecided = labyrinthUsed.filter((u) => ctx.state.decisions[u.placeId]).length;
    const realImports = ctx.state.imports.filter((i) => i.source !== "manual").length;
    const cats = new Set(ids.map((id) => PLACE_BY_ID[id].category)).size;

    const mk = (id: string, title: string, description: string, progress: number): Mission => ({
        id,
        title,
        description,
        progress,
        done: progress >= 1,
    });

    return [
        mk("m-map", "Desenhe seu mapa", "Estime ou importe o tempo em pelo menos 3 lugares.", ratio(ctx.usage.length, 3)),
        mk("m-real-data", "Do palpite ao dado", "Importe um arquivo exportado de uma plataforma (direito de portabilidade).", ratio(realImports, 1)),
        mk("m-face-labyrinth", "Encare o labirinto", "Tome uma decisão de rota para cada Labirinto que você frequenta.",
            labyrinthUsed.length ? ratio(labyrinthDecided, labyrinthUsed.length) : 0),
        mk("m-hatch", "Atravesse a hachura", "Revele 3 territórios desconhecidos por expedição.", ratio(expeditions(ctx), 3)),
        mk("m-route", "Trace uma rota", "Defina um destino para sair (ou reduzir) de algum território.", ratio(withTarget, 1)),
        mk("m-new-quarters", "Novos reinos", "Revele pelo menos 5 reinos diferentes.", ratio(cats, 5)),
        mk("m-bridge", "Construa uma ponte", "Conecte uma plataforma e ative a devolução automática de descobertas.",
            Object.values(ctx.state.writeBack ?? {}).some(Boolean) ? 1 : ratio(Object.keys(ctx.state.connectors ?? {}).length, 2)),
        mk("m-change", "Mude uma rota", "Decida reduzir ou migrar de 2 lugares.", ratio(changes, 2)),
    ];
}

export function computeGameStatus(ctx: Ctx): GameStatus {
    const ids = exploredIds(ctx);
    const cats = new Set(ids.map((id) => PLACE_BY_ID[id].category)).size;
    const importSources = new Set(ctx.state.imports.map((i) => i.source)).size;
    const decisions = Object.keys(ctx.state.decisions).length;
    const badges = computeBadges(ctx);
    const missions = computeMissions(ctx);
    const earned = badges.filter((b) => b.earned).length;
    const done = missions.filter((m) => m.done).length;

    const xpBreakdown = [
        { label: "Territórios revelados", xp: ids.length * XP_RULES.perExploredPlace },
        { label: "Reinos revelados", xp: cats * XP_RULES.perExploredCategory },
        { label: "Fontes de dados importadas", xp: importSources * XP_RULES.perImportSource },
        { label: "Decisões de rota", xp: decisions * XP_RULES.perRouteDecision },
        { label: "Conquistas", xp: earned * XP_RULES.perBadge },
        { label: "Missões", xp: done * XP_RULES.perMission },
        { label: "Expedições", xp: expeditions(ctx) * XP_RULES.perExpedition },
        {
            label: "Lanternas acesas",
            xp: Math.min(Object.keys(ctx.state.lanterns ?? {}).length, XP_RULES.lanternCap) * XP_RULES.perLantern,
        },
        { label: "Ecos", xp: Math.min(echoCount(ctx), XP_RULES.echoCap) * XP_RULES.perEcho },
        {
            label: "Caravanas",
            xp: Math.min((ctx.state.caravan ?? []).length, XP_RULES.caravanCap) * XP_RULES.perCaravan,
        },
        { label: "Pontes com plataformas", xp: Object.keys(ctx.state.connectors ?? {}).length * XP_RULES.perBridge },
    ];
    const xp = xpBreakdown.reduce((s, x) => s + x.xp, 0);
    let idx = 0;
    for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].min) idx = i;
    const level = LEVELS[idx];
    const nextLevel = LEVELS[idx + 1] ?? null;
    const levelProgress = nextLevel ? (xp - level.min) / (nextLevel.min - level.min) : 1;
    return { xp, level, nextLevel, levelProgress, badges, missions, xpBreakdown };
}
