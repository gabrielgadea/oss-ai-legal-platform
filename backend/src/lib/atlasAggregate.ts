/**
 * Agregação do mapa do Brasil (Atlas Digital) com k-anonimato.
 * Funções puras — sem acesso a banco — para facilitar testes.
 */

export const ATLAS_K_ANONYMITY = 10;
export const ATLAS_WINDOW_DAYS = 28;

export const ATLAS_CATEGORIES = [
  "social",
  "video",
  "messaging",
  "knowledge",
  "audio",
  "commerce",
  "civic",
  "play",
] as const;

export const ATLAS_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

const METRICS = ["diversity", "healthy_attention", "open_share", "ad_share", "weekly_hours"] as const;

export interface ContributionRow {
  user_id: string;
  uf: string;
  week: string;
  diversity: number;
  healthy_attention: number;
  open_share: number;
  ad_share: number;
  weekly_hours: number;
  category_share: Record<string, number>;
  updated_at: string;
}

export interface UFAggregateOut {
  uf: string;
  participants: number;
  diversity: number;
  healthyAttention: number;
  openShare: number;
  adShare: number;
  weeklyHours: number;
  categoryShare: Record<string, number>;
}

/** Valida e normaliza uma contribuição recebida do cliente. */
export function parseContribution(body: unknown): Omit<ContributionRow, "user_id" | "updated_at"> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const uf = String(b.uf ?? "").toUpperCase();
  const week = String(b.week ?? "");
  if (!(ATLAS_UFS as readonly string[]).includes(uf)) return null;
  if (!/^\d{4}-W\d{2}$/.test(week)) return null;
  const pct = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
  };
  const diversity = pct(b.diversity);
  const healthy = pct(b.healthyAttention);
  const open = pct(b.openShare);
  const ad = pct(b.adShare);
  const hoursRaw = Number(b.weeklyHours);
  if ([diversity, healthy, open, ad].some((v) => v === null) || !Number.isFinite(hoursRaw)) return null;
  const share = (b.categoryShare ?? {}) as Record<string, unknown>;
  const category_share: Record<string, number> = {};
  for (const c of ATLAS_CATEGORIES) category_share[c] = pct(share[c]) ?? 0;
  return {
    uf,
    week,
    diversity: diversity!,
    healthy_attention: healthy!,
    open_share: open!,
    ad_share: ad!,
    weekly_hours: Math.max(0, Math.min(168, Math.round(hoursRaw))),
    category_share,
  };
}

/**
 * Mantém só a contribuição mais recente de cada pessoa na janela e agrega
 * por UF, descartando UFs com menos de `k` participantes.
 */
export function aggregateByUF(rows: ContributionRow[], k = ATLAS_K_ANONYMITY): {
  aggregates: UFAggregateOut[];
  totalParticipants: number;
} {
  const latest = new Map<string, ContributionRow>();
  for (const r of rows) {
    const cur = latest.get(r.user_id);
    if (!cur || r.updated_at > cur.updated_at) latest.set(r.user_id, r);
  }
  const byUf = new Map<string, ContributionRow[]>();
  for (const r of latest.values()) {
    const list = byUf.get(r.uf) ?? [];
    list.push(r);
    byUf.set(r.uf, list);
  }
  const aggregates: UFAggregateOut[] = [];
  for (const [uf, list] of byUf) {
    if (list.length < k) continue;
    const mean = (key: (typeof METRICS)[number]) =>
      Math.round(list.reduce((s, r) => s + Number(r[key] ?? 0), 0) / list.length);
    const categoryShare: Record<string, number> = {};
    for (const c of ATLAS_CATEGORIES) {
      categoryShare[c] = Math.round(
        list.reduce((s, r) => s + Number(r.category_share?.[c] ?? 0), 0) / list.length,
      );
    }
    aggregates.push({
      uf,
      participants: list.length,
      diversity: mean("diversity"),
      healthyAttention: mean("healthy_attention"),
      openShare: mean("open_share"),
      adShare: mean("ad_share"),
      weeklyHours: mean("weekly_hours"),
      categoryShare,
    });
  }
  return { aggregates: aggregates.sort((a, b) => a.uf.localeCompare(b.uf)), totalParticipants: latest.size };
}

// ---------------------------------------------------------------------------
// Analytics de produto
// ---------------------------------------------------------------------------

export const ATLAS_EVENT_NAMES = new Set([
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
]);

export interface AtlasEventIn {
  name: string;
  props: Record<string, string | number | boolean>;
  at: string;
}

/** Filtra eventos fora da lista e propriedades não escalares/longas. */
export function sanitizeEvents(body: unknown, max = 50): AtlasEventIn[] {
  const events = (body as { events?: unknown })?.events;
  if (!Array.isArray(events)) return [];
  const out: AtlasEventIn[] = [];
  for (const e of events.slice(0, max)) {
    if (!e || typeof e !== "object") continue;
    const ev = e as Record<string, unknown>;
    const name = String(ev.name ?? "");
    if (!ATLAS_EVENT_NAMES.has(name)) continue;
    const props: Record<string, string | number | boolean> = {};
    const raw = (ev.props ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(raw).slice(0, 10)) {
      if (!/^[a-zA-Z_]{1,32}$/.test(k)) continue;
      if (typeof v === "number" && Number.isFinite(v)) props[k] = v;
      else if (typeof v === "boolean") props[k] = v;
      else if (typeof v === "string") props[k] = v.slice(0, 64);
    }
    const at = typeof ev.at === "string" && !Number.isNaN(Date.parse(ev.at)) ? ev.at : new Date().toISOString();
    out.push({ name, props, at });
  }
  return out;
}

export const ATLAS_FUNNEL: { step: string; event: string }[] = [
  { step: "Abriu o Atlas", event: "atlas_viewed" },
  { step: "Registrou atividade", event: "manual_estimate_saved|import_succeeded" },
  { step: "Explorou um lugar", event: "place_explored" },
  { step: "Decidiu uma rota", event: "route_decided" },
];

export function summarizeEvents(rows: { user_id: string; name: string }[]) {
  const byName = new Map<string, { count: number; users: Set<string> }>();
  for (const r of rows) {
    const cur = byName.get(r.name) ?? { count: 0, users: new Set<string>() };
    cur.count++;
    cur.users.add(r.user_id);
    byName.set(r.name, cur);
  }
  const events = [...byName.entries()]
    .map(([name, v]) => ({ name, count: v.count, users: v.users.size }))
    .sort((a, b) => b.count - a.count);
  const funnel = ATLAS_FUNNEL.map(({ step, event }) => {
    const users = new Set<string>();
    for (const n of event.split("|")) byName.get(n)?.users.forEach((u) => users.add(u));
    return { step, users: users.size };
  });
  return { events, funnel };
}
