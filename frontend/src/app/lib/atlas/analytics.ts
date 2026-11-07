/**
 * Analytics de produto do Atlas — mínimo e respeitoso.
 *
 * - Lista fechada de eventos (nada de "track everything").
 * - Propriedades só escalares e sem conteúdo pessoal (nunca nomes de
 *   arquivos, URLs ou lugares visitados — apenas contagens e categorias).
 * - Buffer em memória com flush em lote; falhas são descartadas em silêncio.
 */

export const ATLAS_EVENTS = [
    "atlas_viewed",
    "tab_viewed",
    "manual_estimate_saved",
    "import_succeeded",
    "import_failed",
    "place_explored",
    "route_decided",
    "portal_spun",
    "badge_earned",
    "brazil_contribution_toggled",
    "data_deleted",
    "expedition_started",
    "echoed",
    "lantern_toggled",
    "connector_connected",
    "caravan_updated",
] as const;

export type AtlasEventName = (typeof ATLAS_EVENTS)[number];
export type EventProps = Record<string, string | number | boolean>;

export interface AtlasEvent {
    name: AtlasEventName;
    props?: EventProps;
    at: string;
}

type Sender = (events: AtlasEvent[]) => Promise<void>;

let buffer: AtlasEvent[] = [];
let sender: Sender | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const local: Record<string, number> = {};

export function configureAnalytics(s: Sender) {
    sender = s;
}

export function track(name: AtlasEventName, props?: EventProps) {
    buffer.push({ name, props, at: new Date().toISOString() });
    local[name] = (local[name] ?? 0) + 1;
    if (buffer.length >= 20) void flush();
    else if (!timer) timer = setTimeout(() => void flush(), 5000);
}

export async function flush() {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
    if (!sender || buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    try {
        await sender(batch);
    } catch {
        // analytics nunca pode quebrar a experiência
    }
}

/** Contagem local da sessão (exibida na aba Analytics). */
export function sessionCounts(): Record<string, number> {
    return { ...local };
}
