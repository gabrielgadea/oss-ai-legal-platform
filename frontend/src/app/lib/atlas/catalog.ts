/**
 * Catálogo de lugares do Atlas Digital.
 *
 * Princípios de curadoria (ver docs/atlas-digital.md):
 *  1. Só atributos observáveis de design e modelo de negócio — sem notas
 *     subjetivas. A qualificação é calculada em `scoring.ts`.
 *  2. Na dúvida, `null` (desconhecido) — o cálculo trata como neutro e a
 *     confiança do lugar cai. Preferimos "não sei" a inventar.
 *  3. `origin` só é preenchido quando a sede é bem estabelecida.
 *  4. Curadoria datada (CATALOG_REVISION). Plataformas mudam; o catálogo é
 *     versionado e aberto a contestação via PR.
 */

import type { Category, CategoryId, Place, PlaceAttributes } from "./types";

export const CATALOG_REVISION = "2026-11";

/**
 * Ordem categórica fixa (paleta de referência validada para daltonismo —
 * nunca reordenar sem revalidar).
 */
export const CATEGORIES: Category[] = [
    {
        id: "social",
        name: "Praça",
        prep: "na",
        metaphor: "Redes sociais",
        description: "Onde se vê e se é visto: feeds, perfis e conversas públicas.",
        color: "#2a78d6",
        center: { x: 300, y: 170 },
    },
    {
        id: "video",
        name: "Cinema",
        prep: "no",
        metaphor: "Vídeo e streaming",
        description: "Telas que contam histórias — curtas, longas e ao vivo.",
        color: "#eb6834",
        center: { x: 560, y: 140 },
    },
    {
        id: "messaging",
        name: "Correio",
        prep: "no",
        metaphor: "Mensagens e e-mail",
        description: "Conversas privadas, grupos e correspondência.",
        color: "#1baf7a",
        center: { x: 150, y: 360 },
    },
    {
        id: "knowledge",
        name: "Biblioteca",
        prep: "na",
        metaphor: "Conhecimento, busca e notícias",
        description: "Aprender, pesquisar, ler e se orientar no mundo.",
        color: "#eda100",
        center: { x: 800, y: 230 },
    },
    {
        id: "audio",
        name: "Rádio",
        prep: "na",
        metaphor: "Música e podcasts",
        description: "O que se escuta enquanto a vida acontece.",
        color: "#e87ba4",
        center: { x: 420, y: 340 },
    },
    {
        id: "commerce",
        name: "Mercado",
        prep: "no",
        metaphor: "Compras, entregas e finanças",
        description: "Trocas, pagamentos e consumo.",
        color: "#008300",
        center: { x: 690, y: 420 },
    },
    {
        id: "civic",
        name: "Ágora",
        prep: "na",
        metaphor: "Cidadania e serviços públicos",
        description: "Direitos, serviços e participação democrática.",
        color: "#6250d6",
        center: { x: 900, y: 470 },
    },
    {
        id: "play",
        name: "Arena & Ateliê",
        prep: "na",
        metaphor: "Jogos e criação",
        description: "Brincar, competir e criar.",
        color: "#e34948",
        center: { x: 300, y: 510 },
    },
];

export const CATEGORY_BY_ID: Record<CategoryId, Category> = Object.fromEntries(
    CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, Category>;

function attrs(
    partial: Partial<PlaceAttributes> & Pick<PlaceAttributes, "businessModel">,
): PlaceAttributes {
    return {
        openSource: "no",
        federated: "no",
        e2eDefault: null,
        infiniteFeed: null,
        autoplay: null,
        chronologicalOption: null,
        feedChoice: null,
        ...partial,
    };
}

export const PLACES: Place[] = [
    // ── Praça (redes sociais) ────────────────────────────────────────────
    {
        id: "instagram",
        population: 5,
        name: "Instagram",
        category: "social",
        tagline: "Fotos, stories e Reels.",
        domains: ["instagram.com"],
        origin: "US",
        attributes: attrs({
            businessModel: "ads",
            infiniteFeed: true,
            autoplay: true,
            chronologicalOption: true,
            feedChoice: false,
        }),
    },
    {
        id: "facebook",
        population: 5,
        name: "Facebook",
        category: "social",
        tagline: "Grupos, páginas e feed de amigos.",
        domains: ["facebook.com", "fb.com"],
        origin: "US",
        attributes: attrs({
            businessModel: "ads",
            infiniteFeed: true,
            autoplay: true,
            chronologicalOption: true,
            feedChoice: false,
        }),
    },
    {
        id: "x",
        population: 4,
        name: "X (Twitter)",
        category: "social",
        tagline: "Microblog e debate público em tempo real.",
        domains: ["x.com", "twitter.com"],
        aliases: ["Twitter"],
        origin: "US",
        attributes: attrs({
            businessModel: "mixed",
            infiniteFeed: true,
            autoplay: true,
            chronologicalOption: true,
            feedChoice: false,
        }),
    },
    {
        id: "threads",
        population: 4,
        name: "Threads",
        category: "social",
        tagline: "Conversas em texto da Meta.",
        domains: ["threads.net", "threads.com"],
        origin: "US",
        attributes: attrs({
            businessModel: "ads",
            federated: "partial",
            infiniteFeed: true,
            chronologicalOption: true,
        }),
        notes: "Interoperabilidade com o fediverso parcial/opcional.",
    },
    {
        id: "linkedin",
        name: "LinkedIn",
        category: "social",
        tagline: "Rede profissional.",
        domains: ["linkedin.com"],
        origin: "US",
        attributes: attrs({ businessModel: "mixed", infiniteFeed: true }),
    },
    {
        id: "reddit",
        population: 4,
        name: "Reddit",
        category: "social",
        tagline: "Comunidades temáticas com votação.",
        domains: ["reddit.com"],
        origin: "US",
        attributes: attrs({
            businessModel: "ads",
            infiniteFeed: true,
            chronologicalOption: true,
        }),
    },
    {
        id: "pinterest",
        population: 4,
        name: "Pinterest",
        category: "social",
        tagline: "Murais de inspiração visual.",
        domains: ["pinterest.com", "br.pinterest.com"],
        origin: "US",
        attributes: attrs({ businessModel: "ads", infiniteFeed: true }),
    },
    {
        id: "mastodon",
        entry: "https://joinmastodon.org",
        name: "Mastodon",
        category: "social",
        tagline: "Microblog federado, sem dono único.",
        domains: ["mastodon.social", "joinmastodon.org", "mastodon.com.br"],
        attributes: attrs({
            businessModel: "donation",
            openSource: "yes",
            federated: "yes",
            infiniteFeed: false,
            autoplay: false,
            chronologicalOption: true,
        }),
        notes: "Cada servidor tem regras próprias; atributos refletem o software padrão.",
    },
    {
        id: "bluesky",
        population: 3,
        name: "Bluesky",
        category: "social",
        tagline: "Microblog com feeds escolhidos por você.",
        domains: ["bsky.app"],
        origin: "US",
        attributes: attrs({
            businessModel: "mixed",
            openSource: "yes",
            federated: "partial",
            chronologicalOption: true,
            feedChoice: true,
        }),
        notes: "Modelo de negócio ainda em evolução no momento da curadoria.",
    },
    {
        id: "pixelfed",
        entry: "https://pixelfed.org",
        name: "Pixelfed",
        category: "social",
        tagline: "Fotos no fediverso, em ordem cronológica.",
        domains: ["pixelfed.social", "pixelfed.org"],
        attributes: attrs({
            businessModel: "donation",
            openSource: "yes",
            federated: "yes",
            infiniteFeed: false,
            autoplay: false,
            chronologicalOption: true,
        }),
    },

    // ── Cinema (vídeo) ───────────────────────────────────────────────────
    {
        id: "youtube",
        population: 5,
        name: "YouTube",
        category: "video",
        tagline: "Vídeos longos, Shorts e lives.",
        domains: ["youtube.com", "youtu.be", "m.youtube.com"],
        aliases: ["YouTube"],
        origin: "US",
        attributes: attrs({
            businessModel: "mixed",
            infiniteFeed: true,
            autoplay: true,
            chronologicalOption: true,
            feedChoice: false,
        }),
    },
    {
        id: "tiktok",
        population: 5,
        name: "TikTok",
        category: "video",
        tagline: "Vídeos curtos por recomendação.",
        domains: ["tiktok.com"],
        attributes: attrs({
            businessModel: "ads",
            infiniteFeed: true,
            autoplay: true,
            chronologicalOption: false,
            feedChoice: false,
        }),
        notes: "Estrutura societária varia por país; sede omitida.",
    },
    {
        id: "kwai",
        name: "Kwai",
        category: "video",
        tagline: "Vídeos curtos, muito popular no Brasil.",
        domains: ["kwai.com"],
        origin: "CN",
        attributes: attrs({
            businessModel: "ads",
            infiniteFeed: true,
            autoplay: true,
        }),
    },
    {
        id: "netflix",
        population: 4,
        name: "Netflix",
        category: "video",
        tagline: "Séries e filmes por assinatura.",
        domains: ["netflix.com"],
        origin: "US",
        attributes: attrs({
            businessModel: "subscription",
            infiniteFeed: false,
            autoplay: true,
        }),
    },
    {
        id: "globoplay",
        name: "Globoplay",
        category: "video",
        tagline: "Streaming brasileiro: novelas, séries, TV ao vivo.",
        domains: ["globoplay.globo.com"],
        origin: "BR",
        attributes: attrs({ businessModel: "subscription", infiniteFeed: false }),
    },
    {
        id: "twitch",
        population: 4,
        name: "Twitch",
        category: "video",
        tagline: "Transmissões ao vivo.",
        domains: ["twitch.tv"],
        origin: "US",
        attributes: attrs({ businessModel: "mixed" }),
    },
    {
        id: "peertube",
        name: "PeerTube",
        category: "video",
        tagline: "Vídeo federado e sem anúncios obrigatórios.",
        domains: ["joinpeertube.org", "framatube.org"],
        attributes: attrs({
            businessModel: "donation",
            openSource: "yes",
            federated: "yes",
            infiniteFeed: false,
            chronologicalOption: true,
        }),
    },

    // ── Correio (mensagens) ──────────────────────────────────────────────
    {
        id: "whatsapp",
        population: 5,
        name: "WhatsApp",
        category: "messaging",
        tagline: "O mensageiro onipresente no Brasil.",
        domains: ["whatsapp.com", "web.whatsapp.com"],
        origin: "US",
        attributes: attrs({ businessModel: "mixed", e2eDefault: true, infiniteFeed: false }),
    },
    {
        id: "telegram",
        name: "Telegram",
        category: "messaging",
        tagline: "Mensagens, grupos enormes e canais.",
        domains: ["telegram.org", "web.telegram.org", "t.me"],
        origin: "AE",
        attributes: attrs({
            businessModel: "freemium",
            openSource: "partial",
            e2eDefault: false,
            infiniteFeed: false,
        }),
        notes: "Criptografia ponta-a-ponta apenas em 'chats secretos'. Clientes abertos, servidor fechado.",
    },
    {
        id: "signal",
        name: "Signal",
        category: "messaging",
        tagline: "Mensageiro sem fins lucrativos, criptografado por padrão.",
        domains: ["signal.org"],
        origin: "US",
        attributes: attrs({
            businessModel: "donation",
            openSource: "yes",
            e2eDefault: true,
            infiniteFeed: false,
            autoplay: false,
        }),
    },
    {
        id: "messenger",
        name: "Messenger",
        category: "messaging",
        tagline: "Mensagens da Meta.",
        domains: ["messenger.com"],
        origin: "US",
        attributes: attrs({ businessModel: "ads", e2eDefault: true, infiniteFeed: false }),
    },
    {
        id: "discord",
        population: 4,
        name: "Discord",
        category: "messaging",
        tagline: "Servidores de comunidade com voz e texto.",
        domains: ["discord.com", "discord.gg"],
        origin: "US",
        attributes: attrs({ businessModel: "freemium", e2eDefault: false, infiniteFeed: false }),
        notes: "Texto não é ponta-a-ponta; chamadas de voz/vídeo passaram a ter E2EE.",
    },
    {
        id: "element",
        name: "Element (Matrix)",
        category: "messaging",
        tagline: "Chat federado e criptografado sobre o protocolo Matrix.",
        domains: ["element.io", "app.element.io", "matrix.org"],
        origin: "GB",
        attributes: attrs({
            businessModel: "mixed",
            openSource: "yes",
            federated: "yes",
            e2eDefault: true,
            infiniteFeed: false,
        }),
    },
    {
        id: "gmail",
        entry: "https://mail.google.com",
        population: 5,
        name: "Gmail",
        category: "messaging",
        tagline: "E-mail do Google.",
        domains: ["mail.google.com", "gmail.com"],
        aliases: ["Gmail"],
        origin: "US",
        attributes: attrs({ businessModel: "mixed", e2eDefault: false, infiniteFeed: false }),
    },
    {
        id: "protonmail",
        name: "Proton Mail",
        category: "messaging",
        tagline: "E-mail com criptografia de acesso zero.",
        domains: ["proton.me", "mail.proton.me", "protonmail.com"],
        origin: "CH",
        attributes: attrs({
            businessModel: "freemium",
            openSource: "partial",
            e2eDefault: true,
            infiniteFeed: false,
        }),
        notes: "Ponta-a-ponta automática entre contas Proton; para outros provedores, opcional.",
    },

    // ── Biblioteca (conhecimento) ────────────────────────────────────────
    {
        id: "google-search",
        population: 5,
        name: "Google Busca",
        category: "knowledge",
        tagline: "O buscador dominante.",
        domains: ["google.com", "google.com.br"],
        aliases: ["Search", "Image Search", "Video Search", "Google Search", "Pesquisa"],
        origin: "US",
        attributes: attrs({ businessModel: "ads", infiniteFeed: false }),
    },
    {
        id: "duckduckgo",
        name: "DuckDuckGo",
        category: "knowledge",
        tagline: "Busca sem perfil de rastreamento.",
        domains: ["duckduckgo.com"],
        origin: "US",
        attributes: attrs({ businessModel: "ads", infiniteFeed: false }),
        notes: "Anúncios contextuais, sem perfil individual.",
    },
    {
        id: "wikipedia",
        entry: "https://pt.wikipedia.org",
        name: "Wikipédia",
        category: "knowledge",
        tagline: "A enciclopédia livre e colaborativa.",
        domains: ["wikipedia.org", "pt.wikipedia.org", "wikimedia.org"],
        origin: "US",
        attributes: attrs({
            businessModel: "donation",
            openSource: "yes",
            infiniteFeed: false,
            autoplay: false,
        }),
    },
    {
        id: "openstreetmap",
        entry: "https://www.openstreetmap.org",
        name: "OpenStreetMap",
        category: "knowledge",
        tagline: "Mapa do mundo feito por voluntários.",
        domains: ["openstreetmap.org"],
        origin: "GB",
        attributes: attrs({
            businessModel: "donation",
            openSource: "yes",
            infiniteFeed: false,
            autoplay: false,
        }),
    },
    {
        id: "google-maps",
        population: 5,
        name: "Google Maps",
        category: "knowledge",
        tagline: "Mapas, rotas e avaliações locais.",
        domains: ["maps.google.com"],
        aliases: ["Maps", "Google Maps"],
        origin: "US",
        attributes: attrs({ businessModel: "ads", infiniteFeed: false }),
    },
    {
        id: "khan-academy",
        entry: "https://pt.khanacademy.org",
        name: "Khan Academy",
        category: "knowledge",
        tagline: "Educação gratuita sem fins lucrativos.",
        domains: ["khanacademy.org", "pt.khanacademy.org"],
        origin: "US",
        attributes: attrs({ businessModel: "donation", infiniteFeed: false }),
    },
    {
        id: "duolingo",
        population: 4,
        name: "Duolingo",
        category: "knowledge",
        tagline: "Idiomas em lições gamificadas.",
        domains: ["duolingo.com"],
        origin: "US",
        attributes: attrs({ businessModel: "freemium", infiniteFeed: false }),
    },
    {
        id: "coursera",
        name: "Coursera",
        category: "knowledge",
        tagline: "Cursos de universidades.",
        domains: ["coursera.org"],
        origin: "US",
        attributes: attrs({ businessModel: "freemium", infiniteFeed: false }),
    },
    {
        id: "g1",
        name: "g1",
        category: "knowledge",
        tagline: "Portal de notícias.",
        domains: ["g1.globo.com"],
        origin: "BR",
        attributes: attrs({ businessModel: "ads" }),
    },
    {
        id: "substack",
        name: "Substack",
        category: "knowledge",
        tagline: "Newsletters de autores independentes.",
        domains: ["substack.com"],
        origin: "US",
        attributes: attrs({ businessModel: "subscription", chronologicalOption: true }),
    },

    // ── Rádio (áudio) ────────────────────────────────────────────────────
    {
        id: "spotify",
        entry: "https://open.spotify.com",
        population: 4,
        name: "Spotify",
        category: "audio",
        tagline: "Música e podcasts por streaming.",
        domains: ["spotify.com", "open.spotify.com"],
        origin: "SE",
        attributes: attrs({ businessModel: "freemium", autoplay: true }),
    },
    {
        id: "deezer",
        name: "Deezer",
        category: "audio",
        tagline: "Streaming de música.",
        domains: ["deezer.com"],
        origin: "FR",
        attributes: attrs({ businessModel: "freemium" }),
    },
    {
        id: "youtube-music",
        name: "YouTube Music",
        category: "audio",
        tagline: "Música do YouTube.",
        domains: ["music.youtube.com"],
        aliases: ["YouTube Music"],
        origin: "US",
        attributes: attrs({ businessModel: "freemium", autoplay: true }),
    },
    {
        id: "antennapod",
        name: "AntennaPod",
        category: "audio",
        tagline: "Podcasts por RSS, livre e sem anúncios.",
        domains: ["antennapod.org"],
        attributes: attrs({
            businessModel: "donation",
            openSource: "yes",
            infiniteFeed: false,
            chronologicalOption: true,
        }),
    },

    // ── Mercado (comércio e finanças) ────────────────────────────────────
    {
        id: "mercado-livre",
        name: "Mercado Livre",
        category: "commerce",
        tagline: "Marketplace e Mercado Pago.",
        domains: ["mercadolivre.com.br", "mercadopago.com.br"],
        attributes: attrs({ businessModel: "transaction" }),
    },
    {
        id: "shopee",
        name: "Shopee",
        category: "commerce",
        tagline: "Marketplace com jogos e cupons.",
        domains: ["shopee.com.br"],
        origin: "SG",
        attributes: attrs({ businessModel: "transaction" }),
    },
    {
        id: "amazon",
        name: "Amazon",
        category: "commerce",
        tagline: "Varejo online.",
        domains: ["amazon.com.br", "amazon.com"],
        origin: "US",
        attributes: attrs({ businessModel: "transaction" }),
    },
    {
        id: "ifood",
        name: "iFood",
        category: "commerce",
        tagline: "Delivery de comida e mercado.",
        domains: ["ifood.com.br"],
        origin: "BR",
        attributes: attrs({ businessModel: "transaction" }),
    },
    {
        id: "nubank",
        name: "Nubank",
        category: "commerce",
        tagline: "Banco digital.",
        domains: ["nubank.com.br"],
        origin: "BR",
        attributes: attrs({ businessModel: "transaction", infiniteFeed: false }),
    },

    // ── Ágora (cidadania) ────────────────────────────────────────────────
    {
        id: "govbr",
        entry: "https://www.gov.br",
        population: 4,
        name: "gov.br",
        category: "civic",
        tagline: "Portal único de serviços do governo federal.",
        domains: ["gov.br", "sso.acesso.gov.br"],
        origin: "BR",
        attributes: attrs({ businessModel: "public", infiniteFeed: false, autoplay: false }),
    },
    {
        id: "meu-sus-digital",
        name: "Meu SUS Digital",
        category: "civic",
        tagline: "Histórico de saúde, vacinas e exames no SUS.",
        domains: ["meususdigital.saude.gov.br"],
        origin: "BR",
        attributes: attrs({ businessModel: "public", infiniteFeed: false, autoplay: false }),
    },
    {
        id: "portal-transparencia",
        name: "Portal da Transparência",
        category: "civic",
        tagline: "Para onde vai o dinheiro público federal.",
        domains: ["portaldatransparencia.gov.br"],
        origin: "BR",
        attributes: attrs({ businessModel: "public", infiniteFeed: false, autoplay: false }),
    },
    {
        id: "consumidor-gov",
        name: "consumidor.gov.br",
        category: "civic",
        tagline: "Resolver conflitos de consumo direto com empresas.",
        domains: ["consumidor.gov.br"],
        origin: "BR",
        attributes: attrs({ businessModel: "public", infiniteFeed: false, autoplay: false }),
    },
    {
        id: "e-democracia",
        name: "e-Democracia",
        category: "civic",
        tagline: "Participação em audiências e projetos da Câmara.",
        domains: ["edemocracia.camara.leg.br"],
        origin: "BR",
        attributes: attrs({ businessModel: "public", infiniteFeed: false, autoplay: false }),
    },

    // ── Arena & Ateliê (jogos e criação) ─────────────────────────────────
    {
        id: "roblox",
        population: 4,
        name: "Roblox",
        category: "play",
        tagline: "Mundos criados por usuários.",
        domains: ["roblox.com"],
        origin: "US",
        attributes: attrs({ businessModel: "freemium" }),
    },
    {
        id: "free-fire",
        population: 4,
        name: "Free Fire",
        category: "play",
        tagline: "Battle royale mobile.",
        domains: ["ff.garena.com"],
        origin: "SG",
        attributes: attrs({ businessModel: "freemium" }),
    },
    {
        id: "steam",
        entry: "https://store.steampowered.com",
        population: 4,
        name: "Steam",
        category: "play",
        tagline: "Loja e comunidade de jogos de PC.",
        domains: ["steampowered.com", "steamcommunity.com"],
        origin: "US",
        attributes: attrs({ businessModel: "transaction" }),
    },
    {
        id: "lichess",
        name: "Lichess",
        category: "play",
        tagline: "Xadrez gratuito, livre e sem anúncios.",
        domains: ["lichess.org"],
        origin: "FR",
        attributes: attrs({
            businessModel: "donation",
            openSource: "yes",
            infiniteFeed: false,
            autoplay: false,
        }),
    },
    {
        id: "itch-io",
        name: "itch.io",
        category: "play",
        tagline: "Jogos independentes.",
        domains: ["itch.io"],
        origin: "US",
        attributes: attrs({ businessModel: "transaction", infiniteFeed: false }),
    },
    {
        id: "canva",
        population: 4,
        name: "Canva",
        category: "play",
        tagline: "Design gráfico simplificado.",
        domains: ["canva.com"],
        origin: "AU",
        attributes: attrs({ businessModel: "freemium", infiniteFeed: false }),
    },
];

// ---------------------------------------------------------------------------
// Volume de conteúdo (ordem de grandeza) — só onde diverge nitidamente da
// população. Sem override, a UI estima a partir da população e marca como tal.
// ---------------------------------------------------------------------------
const CONTENT_VOLUME: Record<string, 1 | 2 | 3 | 4 | 5> = {
    "google-search": 5, // indexa a web inteira
    youtube: 5,
    wikipedia: 5, // poucos editores, conteúdo imenso
    "google-maps": 5,
    openstreetmap: 4,
    reddit: 5,
    pinterest: 4,
    tiktok: 5,
    instagram: 5,
    x: 4,
    steam: 4,
    roblox: 5,
    "itch-io": 3,
    spotify: 4,
    "youtube-music": 4,
    netflix: 3, // catálogo grande, mas finito
    globoplay: 2,
    coursera: 3,
    "khan-academy": 3,
    substack: 4,
    mastodon: 3,
    bluesky: 3,
    // mensageiros: muita gente, pouco conteúdo público
    whatsapp: 1,
    telegram: 3,
    signal: 1,
    messenger: 1,
    discord: 3,
    gmail: 1,
    protonmail: 1,
    element: 1,
    // cidadania: bases pequenas, porém densas
    govbr: 2,
    "meu-sus-digital": 1,
    "portal-transparencia": 3,
};

// Deep links públicos e estáveis para um CONTEÚDO (não a home). Curadoria
// conservadora: só onde tenho confiança de que a URL existe e é pública.
const ENTRY_CONTENT: Record<string, { label: string; url: string }> = {
    wikipedia: { label: "um verbete ao acaso", url: "https://pt.wikipedia.org/wiki/Especial:Aleat%C3%B3ria" },
    youtube: { label: "o que está em alta agora", url: "https://www.youtube.com/feed/trending" },
    reddit: { label: "o mural r/popular", url: "https://www.reddit.com/r/popular/" },
    mastodon: { label: "a linha Explorar", url: "https://mastodon.social/explore" },
    lichess: { label: "partidas ao vivo (TV)", url: "https://lichess.org/tv" },
    "itch-io": { label: "jogos independentes em destaque", url: "https://itch.io/games" },
    openstreetmap: { label: "o mapa-múndi aberto", url: "https://www.openstreetmap.org/#map=3/-15/-55" },
    "khan-academy": { label: "as trilhas de estudo", url: "https://pt.khanacademy.org/" },
};

for (const p of PLACES) {
    if (CONTENT_VOLUME[p.id] !== undefined) p.contentVolume = CONTENT_VOLUME[p.id];
    if (ENTRY_CONTENT[p.id] !== undefined) p.entryContent = ENTRY_CONTENT[p.id];
}

export const PLACE_BY_ID: Record<string, Place> = Object.fromEntries(
    PLACES.map((p) => [p.id, p]),
);

/** Porta de entrada real usada pela expedição. */
export function entryUrl(place: Place): string {
    return place.entry ?? `https://${place.domains[0]}`;
}

/**
 * Destino da expedição. Prefere um conteúdo específico (não a home), caindo
 * para a porta de entrada quando não há um deep link confiável.
 */
export function expeditionTarget(place: Place): { url: string; label: string | null } {
    if (place.entryContent) return { url: place.entryContent.url, label: place.entryContent.label };
    return { url: entryUrl(place), label: null };
}

export const POPULATION_LABELS: Record<number, string> = {
    1: "menos de 1 milhão",
    2: "1 a 10 milhões",
    3: "10 a 100 milhões",
    4: "100 milhões a 1 bilhão",
    5: "mais de 1 bilhão",
};

export const CONTENT_VOLUME_LABELS: Record<number, string> = {
    1: "acervo enxuto",
    2: "acervo modesto",
    3: "acervo amplo",
    4: "acervo vasto",
    5: "acervo colossal",
};

export function placesInCategory(category: CategoryId): Place[] {
    return PLACES.filter((p) => p.category === category);
}

// ---------------------------------------------------------------------------
// Resolução de domínios e rótulos → lugar
// ---------------------------------------------------------------------------

/** Índice domínio → placeId; o domínio mais específico vence. */
const DOMAIN_INDEX: [string, string][] = PLACES.flatMap((p) =>
    p.domains.map((d) => [d.toLowerCase(), p.id] as [string, string]),
).sort((a, b) => b[0].length - a[0].length);

export function hostnameOf(url: string): string | null {
    try {
        return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
        return null;
    }
}

/** Casa um hostname com o lugar (sufixo de domínio; mais específico primeiro). */
export function placeIdForHost(host: string): string | null {
    const h = host.toLowerCase().replace(/^www\./, "");
    for (const [domain, id] of DOMAIN_INDEX) {
        if (h === domain || h.endsWith("." + domain)) return id;
    }
    return null;
}

export function placeIdForUrl(url: string): string | null {
    const host = hostnameOf(url);
    return host ? placeIdForHost(host) : null;
}

function normalizeLabel(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}

const LABEL_INDEX = new Map<string, string>();
for (const p of PLACES) {
    for (const label of [p.id, p.name, ...(p.aliases ?? [])]) {
        LABEL_INDEX.set(normalizeLabel(label), p.id);
    }
}

/** Casa um rótulo livre (nome, id, alias ou domínio) com um lugar. */
export function placeIdForLabel(label: string): string | null {
    const trimmed = label.trim();
    if (!trimmed) return null;
    const byLabel = LABEL_INDEX.get(normalizeLabel(trimmed));
    if (byLabel) return byLabel;
    if (trimmed.includes(".")) {
        return trimmed.includes("/")
            ? placeIdForUrl(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`)
            : placeIdForHost(trimmed);
    }
    return null;
}
