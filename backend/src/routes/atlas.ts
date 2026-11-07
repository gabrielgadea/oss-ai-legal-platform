import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import {
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
