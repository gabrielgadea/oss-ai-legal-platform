import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import {
  ATLAS_WORLD_K,
  aggregateWorld,
  normalizeHandle,
  parseDiscoveries,
  parseMarks,
  ATLAS_K_ANONYMITY,
  ATLAS_WINDOW_DAYS,
  aggregateByUF,
  parseContribution,
  sanitizeEvents,
  summarizeEvents,
  type ContributionRow,
} from "../lib/atlasAggregate";

/**
 * Atlas Digital — mapa da atividade digital.
 *
 * O parsing dos arquivos exportados acontece no navegador; este backend só
 * recebe agregados (minutos por lugar) e, com consentimento, indicadores
 * arredondados para o mapa do Brasil.
 */
export const atlasRouter = Router();

const MAX_STATE_BYTES = 512 * 1024;
const ANALYTICS_WINDOW_DAYS = 30;

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

// GET /atlas/state — estado pessoal (mapa, decisões, importações resumidas)
atlasRouter.get("/state", requireAuth, async (_req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const { data, error } = await db
    .from("atlas_states")
    .select("state")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return void res.status(500).json({ detail: error.message });
  res.json({ state: data?.state ?? null });
});

// PUT /atlas/state
atlasRouter.put("/state", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const state = req.body?.state;
  if (!state || typeof state !== "object" || state.version !== 1) {
    return void res.status(400).json({ detail: "Estado inválido" });
  }
  if (Buffer.byteLength(JSON.stringify(state)) > MAX_STATE_BYTES) {
    return void res.status(413).json({ detail: "Estado excede 512 KB" });
  }
  const db = createServerSupabase();
  const { error } = await db
    .from("atlas_states")
    .upsert({ user_id: userId, state, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return void res.status(500).json({ detail: error.message });
  res.status(204).send();
});

// DELETE /atlas/state — direito de eliminação (LGPD art. 18, VI)
atlasRouter.delete("/state", requireAuth, async (_req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const results = await Promise.all([
    db.from("atlas_states").delete().eq("user_id", userId),
    db.from("atlas_events").delete().eq("user_id", userId),
    db.from("atlas_discoveries").delete().eq("user_id", userId),
    db.from("atlas_marks").delete().eq("user_id", userId),
    db.from("atlas_caravans").delete().eq("follower_id", userId),
    db.from("atlas_profiles").delete().eq("user_id", userId),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) return void res.status(500).json({ detail: failed.error.message });
  res.status(204).send();
});

// POST /atlas/contribution — indicadores arredondados, uma linha por semana
atlasRouter.post("/contribution", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const parsed = parseContribution(req.body);
  if (!parsed) return void res.status(400).json({ detail: "Contribuição inválida" });
  const db = createServerSupabase();
  const { error } = await db
    .from("atlas_contributions")
    .upsert(
      { ...parsed, user_id: userId, updated_at: new Date().toISOString() },
      { onConflict: "user_id,week" },
    );
  if (error) return void res.status(500).json({ detail: error.message });
  res.status(204).send();
});

// DELETE /atlas/contribution — revogação do consentimento
atlasRouter.delete("/contribution", requireAuth, async (_req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const { error } = await db.from("atlas_contributions").delete().eq("user_id", userId);
  if (error) return void res.status(500).json({ detail: error.message });
  res.status(204).send();
});

// GET /atlas/brazil — agregados por UF com k-anonimato
atlasRouter.get("/brazil", requireAuth, async (_req, res) => {
  const db = createServerSupabase();
  const { data, error } = await db
    .from("atlas_contributions")
    .select("user_id, uf, week, diversity, healthy_attention, open_share, ad_share, weekly_hours, category_share, updated_at")
    .gte("updated_at", daysAgo(ATLAS_WINDOW_DAYS))
    .limit(50_000);
  if (error) return void res.status(500).json({ detail: error.message });
  const { aggregates, totalParticipants } = aggregateByUF((data ?? []) as ContributionRow[]);
  res.json({ k: ATLAS_K_ANONYMITY, windowDays: ATLAS_WINDOW_DAYS, aggregates, totalParticipants });
});

// POST /atlas/events — analytics de produto (lista fechada de eventos)
atlasRouter.post("/events", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const events = sanitizeEvents(req.body);
  if (events.length === 0) return void res.status(204).send();
  const db = createServerSupabase();
  const { error } = await db
    .from("atlas_events")
    .insert(events.map((e) => ({ user_id: userId, name: e.name, props: e.props, occurred_at: e.at })));
  if (error) return void res.status(500).json({ detail: error.message });
  res.status(204).send();
});

// GET /atlas/analytics/overview — contagens agregadas, sem dados individuais
atlasRouter.get("/analytics/overview", requireAuth, async (_req, res) => {
  const db = createServerSupabase();
  const { data, error } = await db
    .from("atlas_events")
    .select("user_id, name")
    .gte("occurred_at", daysAgo(ANALYTICS_WINDOW_DAYS))
    .limit(100_000);
  if (error) return void res.status(500).json({ detail: error.message });
  res.json({ windowDays: ANALYTICS_WINDOW_DAYS, ...summarizeEvents(data ?? []) });
});

// ---------------------------------------------------------------------------
// Mundo compartilhado
// ---------------------------------------------------------------------------

// PUT /atlas/discoveries — sincroniza os territórios revelados
atlasRouter.put("/discoveries", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const rows = parseDiscoveries(req.body).map((d) => ({ ...d, user_id: userId }));
  if (rows.length === 0) return void res.status(204).send();
  const db = createServerSupabase();
  const { error } = await db.from("atlas_discoveries").upsert(rows, { onConflict: "user_id,place_id" });
  if (error) return void res.status(500).json({ detail: error.message });
  res.status(204).send();
});

// PUT /atlas/marks — substitui o conjunto de lanternas e ecos da pessoa
atlasRouter.put("/marks", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const rows = parseMarks(req.body).map((m) => ({ ...m, user_id: userId, updated_at: new Date().toISOString() }));
  const db = createServerSupabase();
  const del = await db.from("atlas_marks").delete().eq("user_id", userId);
  if (del.error) return void res.status(500).json({ detail: del.error.message });
  if (rows.length) {
    const { error } = await db.from("atlas_marks").insert(rows);
    if (error) return void res.status(500).json({ detail: error.message });
  }
  res.status(204).send();
});

// GET /atlas/world — população, lanternas e ecos por território (k-anônimo)
atlasRouter.get("/world", requireAuth, async (_req, res) => {
  const db = createServerSupabase();
  const [d, m] = await Promise.all([
    db.from("atlas_discoveries").select("user_id, place_id, verified").limit(200_000),
    db.from("atlas_marks").select("user_id, place_id, lantern, echoes").limit(200_000),
  ]);
  const failed = d.error ?? m.error;
  if (failed) return void res.status(500).json({ detail: failed.message });
  res.json({ k: ATLAS_WORLD_K, places: aggregateWorld(d.data ?? [], m.data ?? []) });
});

// GET /atlas/profile
atlasRouter.get("/profile", requireAuth, async (_req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const { data, error } = await db
    .from("atlas_profiles")
    .select("handle, is_public")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return void res.status(500).json({ detail: error.message });
  res.json({ profile: data ? { handle: data.handle, isPublic: data.is_public } : null });
});

// PUT /atlas/profile — handle de viajante e visibilidade dos rumores
atlasRouter.put("/profile", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const handle = normalizeHandle(req.body?.handle);
  if (!handle) return void res.status(400).json({ detail: "Handle: 3 a 24 caracteres, letras minúsculas, números ou _" });
  const db = createServerSupabase();
  const { error } = await db.from("atlas_profiles").upsert(
    { user_id: userId, handle, is_public: req.body?.isPublic === true, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) {
    const taken = error.code === "23505";
    return void res.status(taken ? 409 : 500).json({ detail: taken ? "Este handle já tem dono" : error.message });
  }
  res.status(204).send();
});

// PUT /atlas/caravan — define as caravanas que a pessoa acompanha
atlasRouter.put("/caravan", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const handles = (Array.isArray(req.body?.handles) ? req.body.handles : [])
    .map(normalizeHandle)
    .filter((h: string | null): h is string => Boolean(h))
    .slice(0, 50);
  const db = createServerSupabase();
  const leaders = handles.length
    ? await db.from("atlas_profiles").select("user_id, handle").in("handle", handles)
    : { data: [], error: null };
  if (leaders.error) return void res.status(500).json({ detail: leaders.error.message });
  const del = await db.from("atlas_caravans").delete().eq("follower_id", userId);
  if (del.error) return void res.status(500).json({ detail: del.error.message });
  const rows = (leaders.data ?? [])
    .filter((l) => l.user_id !== userId)
    .map((l) => ({ follower_id: userId, leader_id: l.user_id }));
  if (rows.length) {
    const { error } = await db.from("atlas_caravans").insert(rows);
    if (error) return void res.status(500).json({ detail: error.message });
  }
  const found = new Set((leaders.data ?? []).map((l) => l.handle));
  res.json({ joined: [...found], notFound: handles.filter((h: string) => !found.has(h)) });
});

// GET /atlas/caravan — rumores: o que as caravanas públicas já desbravaram
atlasRouter.get("/caravan", requireAuth, async (_req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const links = await db.from("atlas_caravans").select("leader_id").eq("follower_id", userId);
  if (links.error) return void res.status(500).json({ detail: links.error.message });
  const ids = (links.data ?? []).map((l) => l.leader_id);
  if (ids.length === 0) return void res.json({ members: [] });
  const [profiles, disc] = await Promise.all([
    db.from("atlas_profiles").select("user_id, handle, is_public").in("user_id", ids),
    db.from("atlas_discoveries").select("user_id, place_id").in("user_id", ids),
  ]);
  const failed = profiles.error ?? disc.error;
  if (failed) return void res.status(500).json({ detail: failed.message });
  const members = (profiles.data ?? []).map((p) => ({
    handle: p.handle,
    isPublic: p.is_public,
    // só quem tornou o perfil público compartilha rumores
    discoveries: p.is_public
      ? (disc.data ?? []).filter((d) => d.user_id === p.user_id).map((d) => d.place_id)
      : [],
  }));
  res.json({ members });
});
