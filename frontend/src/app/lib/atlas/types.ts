/**
 * Atlas Digital — modelo de domínio.
 *
 * Metáfora central: a atividade digital de uma pessoa é um território.
 * Cada plataforma é um "lugar"; cada categoria é um "bairro". O que a pessoa
 * ainda não visitou fica sob "névoa" — e além do mapa existe o multiverso
 * (todos os lugares do catálogo que ela nunca considerou).
 *
 * Todos os módulos de `lib/atlas` usam apenas imports relativos e são
 * funções puras, para poderem ser testados fora do Next.js.
 */

export type CategoryId =
    | "social"
    | "video"
    | "messaging"
    | "knowledge"
    | "audio"
    | "commerce"
    | "civic"
    | "play";

export interface Category {
    id: CategoryId;
    /** Nome do bairro no mapa. */
    name: string;
    /** Preposição contraída usada antes do nome ("na Praça", "no Cinema"). */
    prep: "na" | "no";
    /** Metáfora urbana (ex.: "Praça", "Cinema"). */
    metaphor: string;
    description: string;
    /** Cor categórica (ordem fixa, validada para daltonismo). */
    color: string;
    /** Centro do bairro no mapa pessoal (coordenadas do viewBox 1000×620). */
    center: { x: number; y: number };
}

/** `null` = desconhecido ou não se aplica (neutro no cálculo). */
export type TriState = boolean | null;
export type Openness = "yes" | "partial" | "no";

export type BusinessModel =
    | "ads"
    | "subscription"
    | "freemium"
    | "donation"
    | "public"
    | "transaction"
    | "mixed";

/**
 * Atributos observáveis de design/modelo de negócio. A qualificação de cada
 * lugar é DERIVADA desses atributos por fórmula transparente (scoring.ts) —
 * nunca uma nota arbitrária atribuída à mão.
 */
export interface PlaceAttributes {
    businessModel: BusinessModel;
    openSource: Openness;
    federated: Openness;
    /** Criptografia ponta-a-ponta por padrão (só faz sentido em mensageria). */
    e2eDefault: TriState;
    /** Feed de recomendação sem fim. */
    infiniteFeed: TriState;
    /** Reprodução automática do próximo conteúdo. */
    autoplay: TriState;
    /** Existe opção de feed cronológico / só de quem você segue. */
    chronologicalOption: TriState;
    /** Usuário pode escolher ou trocar o algoritmo de ranqueamento. */
    feedChoice: TriState;
}

export interface Place {
    id: string;
    name: string;
    category: CategoryId;
    tagline: string;
    /** Domínios usados para casar histórico de navegação/atividade. */
    domains: string[];
    /** Rótulos alternativos (cabeçalhos do Google Takeout, nomes em CSV). */
    aliases?: string[];
    /** País-sede, apenas quando bem estabelecido. */
    origin?: string;
    attributes: PlaceAttributes;
    /** Observações de incerteza sobre os atributos. */
    notes?: string;
    /** Porta de entrada da expedição (padrão: https://<primeiro domínio>). */
    entry?: string;
    /**
     * População aproximada em ordem de grandeza de usuários ativos:
     * 1 <1 mi · 2 1–10 mi · 3 10–100 mi · 4 100 mi–1 bi · 5 >1 bi.
     * `undefined` = incerto (não inventamos).
     */
    population?: 1 | 2 | 3 | 4 | 5;
}

export type ScoreDimension = "privacy" | "attention" | "agency" | "openness";

export interface PlaceScores {
    privacy: number;
    attention: number;
    agency: number;
    openness: number;
    /** Composto ponderado 0–100. */
    health: number;
    /** Fração de atributos conhecidos (0–1). */
    confidence: number;
    terrain: Terrain;
}

/** Qualificação do lugar na linguagem do mapa. */
export type Terrain = "clareira" | "trilha" | "labirinto";

// ---------------------------------------------------------------------------
// Atividade do usuário
// ---------------------------------------------------------------------------

export type SourceId =
    | "manual"
    | "google-takeout-activity"
    | "google-takeout-browser"
    | "spotify"
    | "netflix"
    | "csv";

/**
 * Qualidade epistêmica do dado: medido (duração registrada pela plataforma),
 * derivado (inferido de timestamps) ou autodeclarado (estimativa da pessoa).
 */
export type DataQuality = "measured" | "derived" | "self-reported";

export interface UsageRecord {
    placeId: string;
    source: SourceId;
    quality: DataQuality;
    /** Minutos no período coberto por `periodDays`. */
    minutes: number;
    periodDays: number;
    sessions?: number;
    /** Minutos por hora do dia (0–23), quando há timestamps. */
    hourHistogram?: number[];
    /** Minutos por dia (YYYY-MM-DD), quando há timestamps. */
    daily?: Record<string, number>;
}

export interface ImportSummary {
    source: SourceId;
    fileName: string;
    importedAt: string;
    eventsParsed: number;
    placesMatched: number;
    periodDays: number;
}

export interface ImportResult {
    source: SourceId;
    records: UsageRecord[];
    eventsParsed: number;
    periodDays: number;
    unmatched: { label: string; count: number }[];
    warnings: string[];
}

/** Decisão de rota da pessoa sobre um lugar. */
export type RouteDecision = "stay" | "reduce" | "leave" | "explore";

export type DiscoveryMethod = "expedition" | "import" | "connector" | "manual";

export interface Discovery {
    at: string;
    method: DiscoveryMethod;
    /** Verificada por dado externo (importação ou conector), não só declarada. */
    verified: boolean;
}

/** Presença ativa num território: o que você produz e os laços que tem lá. */
export interface Inhabitance {
    posts?: number;
    followers?: number;
    following?: number;
    via: string;
    at: string;
}

export type ConnectorId = "mastodon" | "bluesky";

export interface AtlasState {
    version: 1;
    /** Chave: `${source}:${placeId}`. */
    records: Record<string, UsageRecord>;
    imports: ImportSummary[];
    /** Lugares marcados como visitados/experimentados manualmente. */
    explored: Record<string, string>;
    decisions: Record<string, { decision: RouteDecision; target?: string }>;
    /** UF para contribuição opcional ao mapa do Brasil. */
    uf?: string;
    contributeToBrazilMap: boolean;
    /** Territórios revelados e como foram revelados. */
    discoveries: Record<string, Discovery>;
    /** Lanternas acesas (equivalente a "curtir"). */
    lanterns: Record<string, string>;
    /** Ecos feitos por território (equivalente a "compartilhar"). */
    echoes: Record<string, number>;
    /** Handles de viajantes cuja caravana você acompanha ("seguir"). */
    caravan: string[];
    /** Dados de "habitar" trazidos pelos conectores. */
    inhabit: Record<string, Inhabitance>;
    /** Conectores ligados (só metadados públicos; tokens ficam fora do estado). */
    connectors: Partial<Record<ConnectorId, { account: string; service: string; connectedAt: string }>>;
    /** Devolver descobertas automaticamente às plataformas de origem. */
    writeBack: Partial<Record<ConnectorId, boolean>>;
    updatedAt: string;
}

export interface EffectiveUsage {
    placeId: string;
    weeklyMinutes: number;
    quality: DataQuality;
    sources: SourceId[];
    hourHistogram?: number[];
    daily?: Record<string, number>;
}
