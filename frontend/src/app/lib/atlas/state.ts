/**
 * Estado do Atlas: puro (reducers) + persistência local.
 * A sincronização com o backend é feita pelo hook `useAtlas`.
 */

import { recordKey } from "./metrics";
import type {
    AtlasState,
    ConnectorId,
    DiscoveryMethod,
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

/** Validação defensiva do que vem do storage/servidor. */
export function sanitizeState(raw: unknown): AtlasState | null {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Partial<AtlasState>;
    if (s.version !== 1 || typeof s.records !== "object" || !s.records) return null;
    // Estados antigos (sem os campos do mundo) recebem os padrões.
    return { ...emptyState(), ...s } as AtlasState;
}

export function loadLocal(): AtlasState | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? sanitizeState(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

export function saveLocal(state: AtlasState) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // storage indisponível (modo privado): o estado segue só em memória
    }
}

export function clearLocal() {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* noop */
    }
}
