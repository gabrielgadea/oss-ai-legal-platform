/**
 * Conectores bidirecionais do Atlas.
 *
 *   IMPORTAR  ← plataformas: arquivos de portabilidade (importers.ts) e APIs
 *               (Mastodon, Bluesky) que trazem o que você HABITA: o que
 *               produz e os laços que tem lá.
 *   DEVOLVER  → plataformas: cada território descoberto pode voltar para as
 *               suas plataformas de origem como publicação, favorito,
 *               evento de agenda ou mensagem — manual ou automaticamente.
 *
 * Tokens de acesso NUNCA entram no estado sincronizado: ficam só neste
 * navegador (sessionStorage, ou localStorage se a pessoa pedir) e as
 * chamadas vão direto do navegador para a plataforma.
 */

import { CATEGORY_BY_ID, PLACES, PLACE_BY_ID, entryUrl } from "./catalog";
import { sanitizeState } from "./state";
import type { AtlasState, ConnectorId, Place } from "./types";
import { epithet, REALM_BY_ID } from "./world";

type Fetch = typeof fetch;

// ---------------------------------------------------------------------------
// Ecos por intenção de compartilhamento (sem credenciais)
// ---------------------------------------------------------------------------

export interface EchoTarget {
    id: string;
    name: string;
    placeId?: string;
    /** Monta a URL de compartilhamento; `null` se depende de configuração. */
    url: (text: string, link: string, opts?: { instance?: string }) => string | null;
}

const enc = encodeURIComponent;

export const ECHO_TARGETS: EchoTarget[] = [
    { id: "whatsapp", name: "WhatsApp", placeId: "whatsapp", url: (t, l) => `https://wa.me/?text=${enc(`${t} ${l}`)}` },
    { id: "telegram", name: "Telegram", placeId: "telegram", url: (t, l) => `https://t.me/share/url?url=${enc(l)}&text=${enc(t)}` },
    { id: "bluesky", name: "Bluesky", placeId: "bluesky", url: (t, l) => `https://bsky.app/intent/compose?text=${enc(`${t}\n${l}`)}` },
    {
        id: "mastodon",
        name: "Mastodon",
        placeId: "mastodon",
        url: (t, l, o) => (o?.instance ? `https://${normalizeInstance(o.instance)}/share?text=${enc(`${t}\n${l}`)}` : null),
    },
    { id: "threads", name: "Threads", placeId: "threads", url: (t, l) => `https://www.threads.com/intent/post?text=${enc(`${t} ${l}`)}` },
    { id: "x", name: "X", placeId: "x", url: (t, l) => `https://x.com/intent/tweet?text=${enc(t)}&url=${enc(l)}` },
    { id: "linkedin", name: "LinkedIn", placeId: "linkedin", url: (_t, l) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(l)}` },
    { id: "facebook", name: "Facebook", placeId: "facebook", url: (_t, l) => `https://www.facebook.com/sharer/sharer.php?u=${enc(l)}` },
    { id: "reddit", name: "Reddit", placeId: "reddit", url: (t, l) => `https://www.reddit.com/submit?url=${enc(l)}&title=${enc(t)}` },
    { id: "email", name: "E-mail", url: (t, l) => `mailto:?subject=${enc("Uma descoberta no Atlas Digital")}&body=${enc(`${t}\n\n${l}`)}` },
];

/** Texto de um eco. Inclui a marca: ecoar é sobre algo que você JÁ viveu. */
export function echoText(place: Place): string {
    const realm = REALM_BY_ID[place.category];
    return `Descobri "${place.name}" — ${epithet(place)} — ${realm.prep} ${realm.name} do meu Atlas Digital. #AtlasDigital`;
}

/** Web Share API (abre a folha de compartilhamento nativa do aparelho). */
export async function nativeShare(place: Place): Promise<boolean> {
    if (typeof navigator === "undefined" || !("share" in navigator)) return false;
    try {
        await navigator.share({ title: place.name, text: echoText(place), url: entryUrl(place) });
        return true;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Devolução por arquivo (sem credenciais): favoritos, agenda e passaporte
// ---------------------------------------------------------------------------

const escHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Favoritos no formato Netscape Bookmark — importável em Chrome, Firefox,
 * Safari e Edge. Uma pasta por reino com os territórios descobertos.
 */
export function bookmarksHtml(placeIds: string[], now = new Date()): string {
    const ts = Math.floor(now.getTime() / 1000);
    const byRealm = new Map<string, Place[]>();
    for (const id of placeIds) {
        const p = PLACE_BY_ID[id];
        if (!p) continue;
        const list = byRealm.get(p.category) ?? [];
        list.push(p);
        byRealm.set(p.category, list);
    }
    const lines = [
        "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
        '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
        "<TITLE>Bookmarks</TITLE>",
        "<H1>Bookmarks</H1>",
        "<DL><p>",
        `    <DT><H3 ADD_DATE="${ts}">Atlas Digital</H3>`,
        "    <DL><p>",
    ];
    for (const [cat, places] of byRealm) {
        lines.push(`        <DT><H3 ADD_DATE="${ts}">${escHtml(REALM_BY_ID[cat as Place["category"]].name)}</H3>`);
        lines.push("        <DL><p>");
        for (const p of places) {
            lines.push(`            <DT><A HREF="${escHtml(entryUrl(p))}" ADD_DATE="${ts}">${escHtml(`${p.name} — ${epithet(p)}`)}</A>`);
        }
        lines.push("        </DL><p>");
    }
    lines.push("    </DL><p>", "</DL><p>");
    return lines.join("\n");
}

function icsDate(d: Date): string {
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsEscape(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * Evento de agenda (iCalendar, RFC 5545) para uma expedição — Google
 * Agenda, Apple Calendar e Outlook importam .ics. Não revela o destino:
 * o link aponta para o Atlas, onde a hachura continua a ser atravessada.
 */
export function expeditionIcs(realmName: string, start: Date, atlasUrl: string, durationMin = 30): string {
    const end = new Date(start.getTime() + durationMin * 60_000);
    const uid = `atlas-${start.getTime()}-${Math.random().toString(36).slice(2)}@atlas-digital`;
    return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Atlas Digital//PT-BR",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${icsDate(new Date())}`,
        `DTSTART:${icsDate(start)}`,
        `DTEND:${icsDate(end)}`,
        `SUMMARY:${icsEscape(`Expedição: Terra Incógnita (${realmName})`)}`,
        `DESCRIPTION:${icsEscape(`Hora de atravessar a hachura. Abra o Atlas: ${atlasUrl}`)}`,
        `URL:${atlasUrl}`,
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ].join("\r\n");
}

/** Passaporte: o próprio Atlas também é portável (LGPD, art. 18, V). */
export function passportJson(state: AtlasState): string {
    return JSON.stringify({ kind: "atlas-digital-passport", exportedAt: new Date().toISOString(), state }, null, 2);
}

export function readPassport(text: string): AtlasState | null {
    try {
        const data = JSON.parse(text);
        return data?.kind === "atlas-digital-passport" ? sanitizeState(data.state) : null;
    } catch {
        return null;
    }
}

export function downloadFile(name: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Segredos dos conectores (nunca sincronizados)
// ---------------------------------------------------------------------------

const SECRET_PREFIX = "atlas:secret:";

export function saveSecret(id: ConnectorId, value: Record<string, string>, remember: boolean) {
    try {
        const store = remember ? window.localStorage : window.sessionStorage;
        (remember ? window.sessionStorage : window.localStorage).removeItem(SECRET_PREFIX + id);
        store.setItem(SECRET_PREFIX + id, JSON.stringify(value));
    } catch {
        /* storage indisponível */
    }
}

export function loadSecret(id: ConnectorId): Record<string, string> | null {
    try {
        const raw =
            window.sessionStorage.getItem(SECRET_PREFIX + id) ?? window.localStorage.getItem(SECRET_PREFIX + id);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function clearSecret(id: ConnectorId) {
    try {
        window.sessionStorage.removeItem(SECRET_PREFIX + id);
        window.localStorage.removeItem(SECRET_PREFIX + id);
    } catch {
        /* noop */
    }
}

// ---------------------------------------------------------------------------
// Mastodon (API REST; token de acesso pessoal)
// ---------------------------------------------------------------------------

export function normalizeInstance(input: string): string {
    return input.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
}

export interface MastodonAccount {
    acct: string;
    statuses_count: number;
    followers_count: number;
    following_count: number;
}

export async function mastodonVerify(instance: string, token: string, f: Fetch = fetch): Promise<MastodonAccount> {
    const res = await f(`https://${normalizeInstance(instance)}/api/v1/accounts/verify_credentials`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Mastodon recusou o token (${res.status}).`);
    return (await res.json()) as MastodonAccount;
}

export async function mastodonPost(
    instance: string,
    token: string,
    status: string,
    f: Fetch = fetch,
): Promise<{ url: string }> {
    const res = await f(`https://${normalizeInstance(instance)}/api/v1/statuses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status, visibility: "public" }),
    });
    if (!res.ok) throw new Error(`Falha ao publicar no Mastodon (${res.status}).`);
    return (await res.json()) as { url: string };
}

// ---------------------------------------------------------------------------
// Bluesky (AT Protocol / XRPC; senha de aplicativo)
// ---------------------------------------------------------------------------

export const BLUESKY_DEFAULT_SERVICE = "https://bsky.social";
const BLUESKY_APPVIEW = "https://public.api.bsky.app";

export interface BlueskySession {
    accessJwt: string;
    did: string;
    handle: string;
}

export async function blueskyLogin(
    identifier: string,
    appPassword: string,
    service = BLUESKY_DEFAULT_SERVICE,
    f: Fetch = fetch,
): Promise<BlueskySession> {
    const res = await f(`${service}/xrpc/com.atproto.server.createSession`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.replace(/^@/, ""), password: appPassword }),
    });
    if (!res.ok) throw new Error(`Bluesky recusou a senha de aplicativo (${res.status}).`);
    return (await res.json()) as BlueskySession;
}

export async function blueskyProfile(
    actor: string,
    f: Fetch = fetch,
): Promise<{ handle: string; postsCount: number; followersCount: number; followsCount: number }> {
    const res = await f(`${BLUESKY_APPVIEW}/xrpc/app.bsky.actor.getProfile?actor=${enc(actor)}`);
    if (!res.ok) throw new Error(`Perfil do Bluesky indisponível (${res.status}).`);
    return await res.json();
}

/** Facets de link com offsets em BYTES UTF-8, como exige o AT Protocol. */
export function linkFacets(text: string): { index: { byteStart: number; byteEnd: number }; features: { $type: string; uri: string }[] }[] {
    const encoder = new TextEncoder();
    const out = [];
    const re = /https?:\/\/[^\s]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        const byteStart = encoder.encode(text.slice(0, m.index)).length;
        const byteEnd = byteStart + encoder.encode(m[0]).length;
        out.push({ index: { byteStart, byteEnd }, features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }] });
    }
    return out;
}

export async function blueskyPost(
    session: BlueskySession,
    text: string,
    service = BLUESKY_DEFAULT_SERVICE,
    f: Fetch = fetch,
): Promise<{ uri: string }> {
    const res = await f(`${service}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessJwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            repo: session.did,
            collection: "app.bsky.feed.post",
            record: {
                $type: "app.bsky.feed.post",
                text,
                facets: linkFacets(text),
                createdAt: new Date().toISOString(),
                langs: ["pt"],
            },
        }),
    });
    if (!res.ok) throw new Error(`Falha ao publicar no Bluesky (${res.status}).`);
    return await res.json();
}

// ---------------------------------------------------------------------------
// Devolução automática de descobertas
// ---------------------------------------------------------------------------

export const POST_LIMITS: Record<ConnectorId, number> = { mastodon: 500, bluesky: 300 };

/** Limite contado em grafemas aproximados (code points). */
export function fitText(text: string, limit: number): string {
    const chars = Array.from(text);
    return chars.length <= limit ? text : chars.slice(0, limit - 1).join("") + "…";
}

/** Publicação de descoberta: o novo lugar e seu conteúdo, na plataforma de origem. */
export function discoveryPost(place: Place, limit: number): string {
    const realm = REALM_BY_ID[place.category];
    const link = entryUrl(place);
    const head = `🗺️ Novo território no meu Atlas Digital: ${place.name} — ${epithet(place)} (${realm.name}).`;
    const body = `${place.tagline} Bairro: ${CATEGORY_BY_ID[place.category].metaphor.toLowerCase()}.`;
    const tail = `\n${link}\n#AtlasDigital`;
    return fitText(`${head} ${body}`, limit - Array.from(tail).length) + tail;
}

export interface WriteBackResult {
    connector: ConnectorId;
    ok: boolean;
    url?: string;
    error?: string;
}

/** Envia a descoberta para cada conector com devolução automática ligada. */
export async function writeBackDiscovery(
    placeId: string,
    state: AtlasState,
    f: Fetch = fetch,
): Promise<WriteBackResult[]> {
    const place = PLACE_BY_ID[placeId];
    if (!place) return [];
    const results: WriteBackResult[] = [];
    for (const id of Object.keys(state.writeBack) as ConnectorId[]) {
        if (!state.writeBack[id] || !state.connectors[id]) continue;
        const secret = loadSecret(id);
        if (!secret) {
            results.push({ connector: id, ok: false, error: "Credencial expirada nesta sessão — reconecte." });
            continue;
        }
        try {
            const text = discoveryPost(place, POST_LIMITS[id]);
            if (id === "mastodon") {
                const r = await mastodonPost(secret.instance, secret.token, text, f);
                results.push({ connector: id, ok: true, url: r.url });
            } else {
                const service = secret.service || BLUESKY_DEFAULT_SERVICE;
                const session = await blueskyLogin(secret.identifier, secret.appPassword, service, f);
                const r = await blueskyPost(session, text, service, f);
                results.push({ connector: id, ok: true, url: r.uri });
            }
        } catch (e) {
            results.push({ connector: id, ok: false, error: e instanceof Error ? e.message : "Erro desconhecido" });
        }
    }
    return results;
}

/** Catálogo de integrações para a aba Conexões (transparência). */
export const INTEGRATIONS: {
    name: string;
    import: string;
    export: string;
    status: "ativo" | "planejado";
}[] = [
    { name: "Mastodon", import: "Perfil: publicações, seguidores, seguindo (API)", export: "Publica descobertas (API) ou via intenção", status: "ativo" },
    { name: "Bluesky", import: "Perfil: posts, seguidores, seguindo (AT Protocol)", export: "Publica descobertas (AT Protocol) ou via intenção", status: "ativo" },
    { name: "Google (Takeout)", import: "Minha Atividade, YouTube, Chrome (arquivo)", export: "Favoritos .html e agenda .ics", status: "ativo" },
    { name: "Spotify", import: "Histórico de streaming (arquivo)", export: "—", status: "ativo" },
    { name: "Netflix", import: "Atividade de visualização (arquivo)", export: "—", status: "ativo" },
    { name: "WhatsApp, Telegram, Threads, X, LinkedIn, Facebook, Reddit, e-mail", import: "Via pacote de dados / CSV", export: "Ecoar por intenção de compartilhamento", status: "ativo" },
    { name: "Navegadores (Chrome, Firefox, Safari, Edge)", import: "Histórico (Takeout)", export: "Favoritos por reino (.html)", status: "ativo" },
    { name: "Agendas (Google, Apple, Outlook)", import: "—", export: "Expedições agendadas (.ics)", status: "ativo" },
    { name: "Spotify / YouTube (OAuth)", import: "Ouvidos recentemente / inscrições", export: "Salvar podcasts, inscrever-se em canais", status: "planejado" },
    { name: "Extensão de navegador", import: "Tempo por site medido localmente", export: "Favoritos e marcadores diretos", status: "planejado" },
];

export function discoveredPlaces(ids: Iterable<string>): Place[] {
    const set = new Set(ids);
    return PLACES.filter((p) => set.has(p.id));
}
