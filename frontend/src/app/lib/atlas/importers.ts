/**
 * Importadores de dados das plataformas.
 *
 * Privacidade por desenho: TODO o parsing roda no navegador. O arquivo bruto
 * nunca sai do dispositivo — apenas os agregados (minutos por lugar) entram
 * no estado do Atlas.
 *
 * Base legal: direito de portabilidade da LGPD (Lei 13.709/2018, art. 18, V).
 * Cada plataforma oferece exportação dos dados pessoais; o Atlas lê esses
 * arquivos exportados. Ver docs/atlas-digital.md para o passo a passo.
 */

import { CATEGORY_BY_ID, PLACE_BY_ID, hostnameOf, placeIdForLabel, placeIdForUrl } from "./catalog";
import type { DataQuality, ImportResult, SourceId, UsageRecord } from "./types";

const DAY_MS = 86_400_000;

export interface ImporterInfo {
    source: SourceId;
    name: string;
    platform: string;
    quality: DataQuality;
    howTo: string;
    fileHint: string;
}

export const IMPORTERS: ImporterInfo[] = [
    {
        source: "google-takeout-activity",
        name: "Minha Atividade (Google Takeout)",
        platform: "Google · YouTube · Busca · Maps",
        quality: "derived",
        howTo:
            "takeout.google.com → selecione 'Minha atividade' (formato JSON) e/ou 'YouTube e YouTube Music' → histórico (JSON). Extraia o .zip e envie o arquivo MyActivity.json ou watch-history.json.",
        fileHint: "MyActivity.json, watch-history.json, search-history.json",
    },
    {
        source: "google-takeout-browser",
        name: "Histórico do Chrome (Google Takeout)",
        platform: "Navegação web (todos os sites)",
        quality: "derived",
        howTo:
            "takeout.google.com → selecione 'Chrome' → histórico. Extraia e envie History.json (ou BrowserHistory.json).",
        fileHint: "History.json, BrowserHistory.json",
    },
    {
        source: "spotify",
        name: "Histórico de streaming do Spotify",
        platform: "Spotify",
        quality: "measured",
        howTo:
            "spotify.com → Conta → Privacidade → Baixar seus dados. Envie os arquivos StreamingHistory*.json (ou Streaming_History_Audio_*.json do histórico estendido).",
        fileHint: "StreamingHistory_music_0.json",
    },
    {
        source: "netflix",
        name: "Atividade de visualização da Netflix",
        platform: "Netflix",
        quality: "measured",
        howTo:
            "netflix.com → Conta → Baixar suas informações pessoais. No pacote, envie CONTENT_INTERACTION/ViewingActivity.csv.",
        fileHint: "ViewingActivity.csv",
    },
    {
        source: "csv",
        name: "Planilha genérica (CSV)",
        platform: "Qualquer plataforma (ex.: tempo de tela do celular)",
        quality: "self-reported",
        howTo:
            "Colunas: plataforma, minutos e (opcional) data. Útil para transcrever o 'Tempo de uso' do Android ou o 'Tempo de Tela' do iOS.",
        fileHint: "plataforma,minutos,data",
    },
];

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

interface TimedEvent {
    placeId: string;
    t: number; // epoch ms
}

class Accumulator {
    private recs = new Map<string, UsageRecord>();
    private minT = Infinity;
    private maxT = -Infinity;
    unmatched = new Map<string, number>();

    constructor(
        private source: SourceId,
        private quality: DataQuality,
    ) {}

    add(placeId: string, minutes: number, t?: number) {
        let r = this.recs.get(placeId);
        if (!r) {
            r = {
                placeId,
                source: this.source,
                quality: this.quality,
                minutes: 0,
                periodDays: 7,
                sessions: 0,
            };
            this.recs.set(placeId, r);
        }
        r.minutes += minutes;
        r.sessions = (r.sessions ?? 0) + 1;
        if (t !== undefined && Number.isFinite(t)) {
            this.minT = Math.min(this.minT, t);
            this.maxT = Math.max(this.maxT, t);
            const d = new Date(t);
            r.hourHistogram ??= new Array(24).fill(0);
            r.hourHistogram[d.getHours()] += minutes;
            r.daily ??= {};
            const key = isoDay(d);
            r.daily[key] = (r.daily[key] ?? 0) + minutes;
        }
    }

    /** Registra um instante coberto pelo export (mesmo sem lugar casado). */
    seen(t: number) {
        if (!Number.isFinite(t)) return;
        this.minT = Math.min(this.minT, t);
        this.maxT = Math.max(this.maxT, t);
    }

    miss(label: string) {
        if (!label) return;
        this.unmatched.set(label, (this.unmatched.get(label) ?? 0) + 1);
    }

    result(eventsParsed: number, warnings: string[], fallbackDays = 7): ImportResult {
        const span = Number.isFinite(this.minT) ? (this.maxT - this.minT) / DAY_MS : NaN;
        const periodDays = Number.isFinite(span) ? Math.max(1, Math.ceil(span)) : fallbackDays;
        const records = [...this.recs.values()].map((r) => ({
            ...r,
            minutes: Math.round(r.minutes * 10) / 10,
            periodDays,
        }));
        return {
            source: this.source,
            records,
            eventsParsed,
            periodDays,
            unmatched: [...this.unmatched.entries()]
                .map(([label, count]) => ({ label, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 25),
            warnings,
        };
    }
}

function isoDay(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** Teto de minutos atribuível a um único evento, por bairro. */
const GAP_CAP_MIN: Record<string, number> = {
    video: 20,
    audio: 10,
    play: 30,
    default: 10,
};
const SINGLE_EVENT_MIN: Record<string, number> = { video: 3, default: 1 };

/**
 * Converte uma sequência de eventos com timestamp em minutos por lugar.
 * Heurística: o intervalo até o próximo evento é atribuído ao evento atual,
 * limitado por um teto por bairro; intervalos maiores contam um mínimo fixo.
 * O resultado é marcado como "derivado" — nunca como medido.
 */
export function minutesFromEventStream(events: TimedEvent[], acc: Accumulator) {
    const sorted = [...events].sort((a, b) => a.t - b.t);
    for (let i = 0; i < sorted.length; i++) {
        const e = sorted[i];
        const cat = PLACE_BY_ID[e.placeId]?.category ?? "default";
        const cap = GAP_CAP_MIN[cat] ?? GAP_CAP_MIN.default;
        const single = SINGLE_EVENT_MIN[cat] ?? SINGLE_EVENT_MIN.default;
        const next = sorted[i + 1];
        const gapMin = next ? (next.t - e.t) / 60_000 : Infinity;
        acc.add(e.placeId, gapMin <= cap ? Math.max(gapMin, 0.1) : single, e.t);
    }
}

function parseJson(text: string): unknown {
    // Remove BOM que alguns exports incluem.
    return JSON.parse(text.replace(/^﻿/, ""));
}

/** Parser CSV mínimo com suporte a aspas (RFC 4180). */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;
    const s = text.replace(/^﻿/, "");
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (quoted) {
            if (c === '"') {
                if (s[i + 1] === '"') {
                    field += '"';
                    i++;
                } else quoted = false;
            } else field += c;
        } else if (c === '"') quoted = true;
        else if (c === "," || c === ";") {
            row.push(field);
            field = "";
        } else if (c === "\n" || c === "\r") {
            if (c === "\r" && s[i + 1] === "\n") i++;
            row.push(field);
            if (row.some((f) => f.trim() !== "")) rows.push(row);
            row = [];
            field = "";
        } else field += c;
    }
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
    return rows;
}

// ---------------------------------------------------------------------------
// Importadores
// ---------------------------------------------------------------------------

interface TakeoutActivityItem {
    header?: string;
    title?: string;
    titleUrl?: string;
    time?: string;
    products?: string[];
}

export function parseTakeoutActivity(items: TakeoutActivityItem[]): ImportResult {
    const acc = new Accumulator("google-takeout-activity", "derived");
    const events: TimedEvent[] = [];
    for (const it of items) {
        const t = it.time ? Date.parse(it.time) : NaN;
        if (!Number.isFinite(t)) continue;
        acc.seen(t);
        const placeId =
            (it.header && placeIdForLabel(it.header)) ||
            (it.products?.[0] && placeIdForLabel(it.products[0])) ||
            (it.titleUrl && placeIdForUrl(it.titleUrl)) ||
            null;
        if (placeId) events.push({ placeId, t });
        else acc.miss(it.header ?? (it.titleUrl ? hostnameOf(it.titleUrl) ?? "" : ""));
    }
    minutesFromEventStream(events, acc);
    return acc.result(items.length, [
        "Duração estimada a partir do intervalo entre eventos (dado derivado, não medido).",
    ]);
}

interface BrowserHistoryItem {
    url?: string;
    time_usec?: number;
    title?: string;
}

export function parseBrowserHistory(items: BrowserHistoryItem[]): ImportResult {
    const acc = new Accumulator("google-takeout-browser", "derived");
    const events: TimedEvent[] = [];
    for (const it of items) {
        if (!it.url || typeof it.time_usec !== "number") continue;
        const t = it.time_usec / 1000;
        acc.seen(t);
        const placeId = placeIdForUrl(it.url);
        if (placeId) events.push({ placeId, t });
        else acc.miss(hostnameOf(it.url) ?? "");
    }
    minutesFromEventStream(events, acc);
    return acc.result(items.length, [
        "Só a navegação no Chrome é coberta; apps do celular ficam de fora.",
        "Duração estimada a partir do intervalo entre visitas (dado derivado).",
    ]);
}

interface SpotifyItem {
    endTime?: string;
    msPlayed?: number;
    ts?: string;
    ms_played?: number;
}

export function parseSpotify(items: SpotifyItem[]): ImportResult {
    const acc = new Accumulator("spotify", "measured");
    let n = 0;
    for (const it of items) {
        const ms = it.msPlayed ?? it.ms_played;
        const when = it.ts ?? (it.endTime ? it.endTime.replace(" ", "T") + "Z" : undefined);
        if (typeof ms !== "number" || ms <= 0) continue;
        n++;
        const t = when ? Date.parse(when) : NaN;
        acc.add("spotify", ms / 60_000, Number.isFinite(t) ? t : undefined);
    }
    return acc.result(n, []);
}

function parseDuration(s: string): number {
    const parts = s.trim().split(":").map(Number);
    if (parts.some((p) => !Number.isFinite(p))) return 0;
    while (parts.length < 3) parts.unshift(0);
    const [h, m, sec] = parts;
    return h * 60 + m + sec / 60;
}

export function parseNetflixCsv(rows: string[][]): ImportResult {
    const acc = new Accumulator("netflix", "measured");
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const iStart = header.indexOf("start time");
    const iDur = header.indexOf("duration");
    const iType = header.indexOf("supplemental video type");
    let n = 0;
    for (const row of rows.slice(1)) {
        // Trailers e prévias (autoplay) aparecem como vídeos suplementares.
        if (iType >= 0 && row[iType]?.trim()) continue;
        const minutes = parseDuration(row[iDur] ?? "");
        if (minutes <= 0) continue;
        const t = Date.parse((row[iStart] ?? "").replace(" ", "T") + "Z");
        n++;
        acc.add("netflix", minutes, Number.isFinite(t) ? t : undefined);
    }
    return acc.result(n, []);
}

const COL_PLACE = ["plataforma", "platform", "app", "aplicativo", "lugar", "site"];
const COL_MIN = ["minutos", "minutes", "min", "tempo"];
const COL_DATE = ["data", "date", "dia"];

export function parseGenericCsv(rows: string[][]): ImportResult {
    const acc = new Accumulator("csv", "self-reported");
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const iPlace = header.findIndex((h) => COL_PLACE.includes(h));
    const iMin = header.findIndex((h) => COL_MIN.includes(h));
    const iDate = header.findIndex((h) => COL_DATE.includes(h));
    if (iPlace < 0 || iMin < 0) {
        throw new Error("CSV precisa das colunas 'plataforma' e 'minutos'.");
    }
    let n = 0;
    for (const row of rows.slice(1)) {
        const label = row[iPlace] ?? "";
        const minutes = Number((row[iMin] ?? "").replace(",", "."));
        if (!Number.isFinite(minutes) || minutes <= 0) continue;
        const placeId = placeIdForLabel(label);
        if (!placeId) {
            acc.miss(label.trim());
            continue;
        }
        n++;
        const t = iDate >= 0 ? Date.parse(row[iDate] ?? "") : NaN;
        acc.add(placeId, minutes, Number.isFinite(t) ? t : undefined);
    }
    return acc.result(n, iDate < 0 ? ["Sem coluna de data: assumido período de 7 dias."] : []);
}

/** Estimativa manual (horas por semana) → registros autodeclarados. */
export function manualRecords(hoursPerWeek: Record<string, number>): UsageRecord[] {
    return Object.entries(hoursPerWeek)
        .filter(([id, h]) => PLACE_BY_ID[id] && h > 0)
        .map(([placeId, h]) => ({
            placeId,
            source: "manual" as const,
            quality: "self-reported" as const,
            minutes: Math.round(h * 60),
            periodDays: 7,
        }));
}

// ---------------------------------------------------------------------------
// Detecção automática
// ---------------------------------------------------------------------------

export function detectAndParse(fileName: string, text: string): ImportResult {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".csv")) {
        const rows = parseCsv(text);
        if (rows.length < 2) throw new Error("CSV vazio.");
        const header = rows[0].map((h) => h.trim().toLowerCase());
        if (header.includes("start time") && header.includes("duration")) return parseNetflixCsv(rows);
        return parseGenericCsv(rows);
    }
    const data = parseJson(text);
    if (data && typeof data === "object" && !Array.isArray(data)) {
        const bh = (data as Record<string, unknown>)["Browser History"];
        if (Array.isArray(bh)) return parseBrowserHistory(bh as BrowserHistoryItem[]);
    }
    if (Array.isArray(data) && data.length > 0) {
        const first = data[0] as Record<string, unknown>;
        if ("msPlayed" in first || "ms_played" in first) return parseSpotify(data as SpotifyItem[]);
        if ("time" in first && ("header" in first || "title" in first)) {
            return parseTakeoutActivity(data as TakeoutActivityItem[]);
        }
    }
    throw new Error(
        "Formato não reconhecido. Formatos aceitos: Google Takeout (JSON), Spotify (JSON), Netflix (CSV) ou CSV genérico.",
    );
}

export function categoryNameOf(placeId: string): string {
    const p = PLACE_BY_ID[placeId];
    return p ? CATEGORY_BY_ID[p.category].name : "";
}
