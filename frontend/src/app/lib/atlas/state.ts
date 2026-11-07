/**
 * Estado do Atlas: puro (reducers) + persistência local.
 * A sincronização com o backend é feita pelo hook `useAtlas`.
 */

import { creditLeagues } from "./expedition";
import { recordKey } from "./metrics";
import type {
    AtlasState,
    ConnectorId,
    DiscoveryMethod,
    ExpeditionState,
    ImportResult,
    ImportSummary,
    Inhabitance,
    RouteDecision,
    UsageRecord,
} from "./types";

export const STORAGE_KEY = "atlas:v1";

export function emptyState(): AtlasState {
    return {
        version: 1,
        records: {},
        imports: [],
        explored: {},
        decisions: {},
        contributeToBrazilMap: false,
        discoveries: {},
        lanterns: {},
        echoes: {},
        caravan: [],
        inhabit: {},
        connectors: {},
        writeBack: {},
        updatedAt: new Date(0).toISOString(),
    };
}

const touch = (s: AtlasState): AtlasState => ({ ...s, updatedAt: new Date().toISOString() });

/** Substitui os registros de uma fonte inteira (reimportar não duplica). */
export function applyImport(state: AtlasState, result: ImportResult, fileName: string): AtlasState {
    const records = Object.fromEntries(
        Object.entries(state.records).filter(([, r]) => r.source !== result.source),
    );
    for (const r of result.records) records[recordKey(r)] = r;
    const summary: ImportSummary = {
        source: result.source,
        fileName,
        importedAt: new Date().toISOString(),
        eventsParsed: result.eventsParsed,
        placesMatched: result.records.length,
        periodDays: result.periodDays,
    };
    const discoveries = { ...state.discoveries };
    for (const r of result.records) {
        if (!discoveries[r.placeId]?.verified) {
            discoveries[r.placeId] = { at: summary.importedAt, method: "import", verified: true };
        }
    }
    return touch({
        ...state,
        records,
        discoveries,
        imports: [...state.imports.filter((i) => i.source !== result.source), summary],
    });
}

export function applyManual(state: AtlasState, manual: UsageRecord[]): AtlasState {
    const records = Object.fromEntries(
        Object.entries(state.records).filter(([, r]) => r.source !== "manual"),
    );
    for (const r of manual) records[recordKey(r)] = r;
    return touch({ ...state, records });
}

export function removeSource(state: AtlasState, source: string): AtlasState {
    return touch({
        ...state,
        records: Object.fromEntries(Object.entries(state.records).filter(([, r]) => r.source !== source)),
        imports: state.imports.filter((i) => i.source !== source),
    });
}

export function toggleExplored(state: AtlasState, placeId: string): AtlasState {
    const explored = { ...state.explored };
    if (explored[placeId]) delete explored[placeId];
    else explored[placeId] = new Date().toISOString();
    return touch({ ...state, explored });
}

export function setDecision(
    state: AtlasState,
    placeId: string,
    decision: RouteDecision | null,
    target?: string,
): AtlasState {
    const decisions = { ...state.decisions };
    if (!decision) delete decisions[placeId];
    else decisions[placeId] = target ? { decision, target } : { decision };
    return touch({ ...state, decisions });
}

/** Revela um território. Uma descoberta verificada nunca é rebaixada. */
export function discover(
    state: AtlasState,
    placeId: string,
    method: DiscoveryMethod,
    verified = method === "import" || method === "connector",
): AtlasState {
    const prev = state.discoveries[placeId];
    if (prev && (prev.verified || !verified)) return state;
    return touch({
        ...state,
        discoveries: { ...state.discoveries, [placeId]: { at: new Date().toISOString(), method, verified } },
    });
}

export function toggleLantern(state: AtlasState, placeId: string): AtlasState {
    const lanterns = { ...state.lanterns };
    if (lanterns[placeId]) delete lanterns[placeId];
    else lanterns[placeId] = new Date().toISOString();
    return touch({ ...state, lanterns });
}

export function addEcho(state: AtlasState, placeId: string): AtlasState {
    return touch({ ...state, echoes: { ...state.echoes, [placeId]: (state.echoes[placeId] ?? 0) + 1 } });
}

export function setCaravan(state: AtlasState, handles: string[]): AtlasState {
    return touch({ ...state, caravan: [...new Set(handles)] });
}

export function connect(
    state: AtlasState,
    id: ConnectorId,
    meta: { account: string; service: string },
    placeId: string,
    inhabitance: Omit<Inhabitance, "at" | "via">,
): AtlasState {
    const at = new Date().toISOString();
    const next = discover(state, placeId, "connector", true);
    return touch({
        ...next,
        connectors: { ...next.connectors, [id]: { ...meta, connectedAt: at } },
        inhabit: { ...next.inhabit, [placeId]: { ...inhabitance, via: id, at } },
    });
}

export function disconnect(state: AtlasState, id: ConnectorId): AtlasState {
    const connectors = { ...state.connectors };
    delete connectors[id];
    const writeBack = { ...state.writeBack };
    delete writeBack[id];
    return touch({ ...state, connectors, writeBack });
}

export function setWriteBack(state: AtlasState, id: ConnectorId, on: boolean): AtlasState {
    return touch({ ...state, writeBack: { ...state.writeBack, [id]: on } });
}

/** Grava o estado do Modo Expedição. */
export function setExpedition(state: AtlasState, expedition: ExpeditionState): AtlasState {
    return touch({ ...state, expedition });
}

/** Credita léguas de bônus por uma ação real; no-op se o modo não foi iniciado. */
export function grantLeagues(state: AtlasState, n: number): AtlasState {
    if (!state.expedition || n <= 0) return state;
    return touch({ ...state, expedition: creditLeagues(state.expedition, n) });
}

// ── Persistência (skill save-systems) ──────────────────────────────────────
// Versão do esquema + migrações em ordem, validação campo a campo, cópia de
// segurança e quarentena: um save ilegível ou de uma versão mais nova nunca é
// sobrescrito em silêncio. (`localStorage.setItem` já é atômico por chave, então
// não há o risco de arquivo pela metade que exige temp + rename.)

export const STATE_VERSION = 1;
export const BACKUP_KEY = `${STORAGE_KEY}:backup`;
export const QUARANTINE_KEY = `${STORAGE_KEY}:quarentena`;
const BACKUP_EVERY_MS = 5 * 60 * 1000;

type Raw = Record<string, unknown>;
/** Migração da versão N para N+1 (função pura). O próximo formato entra aqui. */
export const MIGRATIONS: Record<number, (d: Raw) => Raw> = {};

const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Leva um save de qualquer versão conhecida até a atual; null se for de versão mais nova ou inválida. */
export function migrateState(raw: unknown, migrations = MIGRATIONS, current = STATE_VERSION): Raw | null {
    if (!isObj(raw)) return null;
    let v = raw.version === undefined ? 1 : Number(raw.version); // sem campo = primeiro formato publicado
    if (!Number.isInteger(v) || v < 1 || v > current) return null; // mais novo: recusa (não rebaixa)
    let d: Raw = { ...raw, version: v }; // sempre carimba a versão
    while (v < current) {
        const step = migrations[v];
        if (!step) return null;
        d = step(d);
        v += 1;
        d.version = v;
    }
    return d;
}

function validExpedition(e: unknown): e is ExpeditionState {
    if (!isObj(e) || !isObj(e.cartographer)) return false;
    const c = e.cartographer as Raw;
    return (
        isNum(c.x) && isNum(c.y) &&
        isStrArr(e.fog) && typeof e.leaguesDay === "string" &&
        isNum(e.leaguesSpent) && e.leaguesSpent >= 0 &&
        isNum(e.leaguesBonus) && e.leaguesBonus >= 0 &&
        isStrArr(e.marksCollected) && isStrArr(e.rumorsFound)
    );
}

/** Validação defensiva do que vem do storage/servidor (migra, confere tipos, descarta o corrompido). */
export function sanitizeState(raw: unknown): AtlasState | null {
    const d = migrateState(raw);
    if (!d || !isObj(d.records)) return null;
    const base = emptyState();
    const out: Raw = { ...base, ...d, version: STATE_VERSION };
    for (const k of ["explored", "decisions", "discoveries", "lanterns", "echoes", "inhabit", "connectors", "writeBack"] as const) {
        if (!isObj(out[k])) out[k] = base[k];
    }
    if (!Array.isArray(out.imports)) out.imports = base.imports;
    if (!isStrArr(out.caravan)) out.caravan = base.caravan;
    if (typeof out.contributeToBrazilMap !== "boolean") out.contributeToBrazilMap = false;
    // Expedição corrompida não derruba o mapa: some e é recriada ao entrar no modo.
    if (out.expedition !== undefined && !validExpedition(out.expedition)) delete out.expedition;
    return out as unknown as AtlasState;
}

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

function parse(raw: string | null): unknown {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/** Lê o estado: principal → (quarentena do ilegível) → cópia de segurança. */
export function readState(storage: StorageLike): { state: AtlasState | null; source: "main" | "backup" | null } {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
        const s = sanitizeState(parse(raw));
        if (s) return { state: s, source: "main" };
        try {
            storage.setItem(QUARANTINE_KEY, raw); // preserva antes que o próximo save o sobrescreva
        } catch {
            /* sem espaço: segue para a cópia de segurança */
        }
    }
    const bak = sanitizeState(parse(storage.getItem(BACKUP_KEY)));
    return bak ? { state: bak, source: "backup" } : { state: null, source: null };
}

let lastBackupAt = -Infinity;

/** Grava o estado; renova a cópia de segurança no máximo a cada 5 min. Retorna false se o storage recusou. */
export function writeState(storage: StorageLike, state: AtlasState, now = Date.now()): boolean {
    try {
        const json = JSON.stringify(state);
        storage.setItem(STORAGE_KEY, json);
        if (now - lastBackupAt >= BACKUP_EVERY_MS) {
            storage.setItem(BACKUP_KEY, json);
            lastBackupAt = now;
        }
        return true;
    } catch {
        return false; // cota cheia / modo privado: o estado segue em memória
    }
}

/** Só para testes: zera o relógio da cópia de segurança. */
export function resetBackupClock() {
    lastBackupAt = -Infinity;
}

export function loadLocal(): AtlasState | null {
    if (typeof window === "undefined") return null;
    try {
        return readState(window.localStorage).state;
    } catch {
        return null;
    }
}

export function saveLocal(state: AtlasState) {
    try {
        writeState(window.localStorage, state);
    } catch {
        // storage indisponível (modo privado): o estado segue só em memória
    }
}

export function clearLocal() {
    try {
        // apagar os dados apaga TODAS as cópias (LGPD): principal, segurança e quarentena
        for (const k of [STORAGE_KEY, BACKUP_KEY, QUARANTINE_KEY]) window.localStorage.removeItem(k);
        lastBackupAt = -Infinity;
    } catch {
        /* noop */
    }
}
