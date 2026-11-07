import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateByUF,
  parseContribution,
  sanitizeEvents,
  summarizeEvents,
  type ContributionRow,
} from "../src/lib/atlasAggregate";

const row = (user: string, uf: string, healthy: number, updated = "2026-11-01T00:00:00Z"): ContributionRow => ({
  user_id: user,
  uf,
  week: "2026-W44",
  diversity: 50,
  healthy_attention: healthy,
  open_share: 10,
  ad_share: 60,
  weekly_hours: 20,
  category_share: { social: 40, video: 30, messaging: 30 },
  updated_at: updated,
});

test("k-anonimato: UF com menos de k participantes é omitida", () => {
  const rows = [
    ...Array.from({ length: 10 }, (_, i) => row(`sp${i}`, "SP", 40)),
    ...Array.from({ length: 9 }, (_, i) => row(`ac${i}`, "AC", 70)),
  ];
  const { aggregates, totalParticipants } = aggregateByUF(rows);
  assert.equal(totalParticipants, 19);
  assert.deepEqual(aggregates.map((a) => a.uf), ["SP"]);
  assert.equal(aggregates[0].healthyAttention, 40);
  assert.equal(aggregates[0].categoryShare.social, 40);
});

test("só a contribuição mais recente de cada pessoa conta", () => {
  const rows = Array.from({ length: 10 }, (_, i) => row(`u${i}`, "PE", 40));
  rows.push(row("u0", "PE", 90, "2026-11-05T00:00:00Z"));
  const { aggregates } = aggregateByUF(rows);
  assert.equal(aggregates[0].participants, 10);
  assert.equal(aggregates[0].healthyAttention, 45);
});

test("validação de contribuição", () => {
  const ok = parseContribution({
    uf: "rj", week: "2026-W45", diversity: 55, healthyAttention: 60, openShare: 5, adShare: 70,
    weeklyHours: 999, categoryShare: { social: 50, inexistente: 99 },
  });
  assert.ok(ok);
  assert.equal(ok.uf, "RJ");
  assert.equal(ok.weekly_hours, 168);
  assert.equal(ok.category_share.social, 50);
  assert.equal(ok.category_share.video, 0);
  assert.ok(!("inexistente" in ok.category_share));
  assert.equal(parseContribution({ uf: "XX", week: "2026-W45" }), null);
  assert.equal(parseContribution({ uf: "SP", week: "2026-45", diversity: 1, healthyAttention: 1, openShare: 1, adShare: 1, weeklyHours: 1 }), null);
});

test("eventos: lista fechada e propriedades sanitizadas", () => {
  const ev = sanitizeEvents({
    events: [
      { name: "import_succeeded", props: { source: "spotify", places: 3, nested: { a: 1 }, "bad key": 1 }, at: "2026-11-07T10:00:00Z" },
      { name: "evento_arbitrario", props: {} },
    ],
  });
  assert.equal(ev.length, 1);
  assert.deepEqual(ev[0].props, { source: "spotify", places: 3 });
  assert.deepEqual(sanitizeEvents({}), []);
});

test("funil de produto", () => {
  const s = summarizeEvents([
    { user_id: "a", name: "atlas_viewed" },
    { user_id: "b", name: "atlas_viewed" },
    { user_id: "a", name: "import_succeeded" },
    { user_id: "b", name: "manual_estimate_saved" },
    { user_id: "a", name: "route_decided" },
  ]);
  assert.deepEqual(s.funnel.map((f) => f.users), [2, 2, 0, 1]);
  assert.equal(s.events[0].name, "atlas_viewed");
});
