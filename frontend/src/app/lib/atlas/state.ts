/**
 * Estado do Atlas: puro (reducers) + persistência local.
 * A sincronização com o backend é feita pelo hook `useAtlas`.
 */

import { recordKey } from "./metrics";
import type { AtlasState, ImportResult, ImportSummary, RouteDecision, UsageRecord } from "./types";

export const STORAGE_KEY = "atlas:v1";

export function emptyState(): AtlasState {
    return {
        version: 1,
        records: {},
        imports: [],
        explored: {},
        decisions: {},
        contributeToBrazilMap: false,
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
    return touch({
        ...state,
        records,
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

/** Validação defensiva do que vem do storage/servidor. */
export function sanitizeState(raw: unknown): AtlasState | null {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Partial<AtlasState>;
    if (s.version !== 1 || typeof s.records !== "object" || !s.records) return null;
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
