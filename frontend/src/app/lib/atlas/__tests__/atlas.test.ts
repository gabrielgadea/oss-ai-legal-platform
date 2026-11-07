/**
 * Testes do núcleo do Atlas Digital (funções puras).
 * Executar: npm run test:atlas --prefix frontend
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { CATEGORIES, PLACES, PLACE_BY_ID, placeIdForLabel, placeIdForUrl } from "../catalog";
import { scoresFor, scorePlace } from "../scoring";
import { computeMetrics, effectiveUsage, projectRoute } from "../metrics";
import { detectAndParse, manualRecords, parseCsv } from "../importers";
import { computeGameStatus } from "../gamification";
import { alternativesFor, portals } from "../multiverse";
import { UFS, buildContribution, isoWeek, simulatedAggregates } from "../brazil";
import { applyImport, applyManual, emptyState, setDecision } from "../state";

test("catálogo: ids únicos, categorias válidas, 8 bairros", () => {
    const ids = PLACES.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
    const cats = new Set(CATEGORIES.map((c) => c.id));
    assert.equal(cats.size, 8);
    for (const p of PLACES) assert.ok(cats.has(p.category), p.id);
    for (const c of CATEGORIES) assert.ok(PLACES.some((p) => p.category === c.id), c.id);
});

test("catálogo: resolução de domínios prefere o mais específico", () => {
    assert.equal(placeIdForUrl("https://music.youtube.com/watch?v=1"), "youtube-music");
    assert.equal(placeIdForUrl("https://www.youtube.com/watch?v=1"), "youtube");
    assert.equal(placeIdForUrl("https://mail.google.com/mail/u/0"), "gmail");
    assert.equal(placeIdForUrl("https://www.google.com/search?q=x"), "google-search");
    assert.equal(placeIdForUrl("https://meusus.saude.gov.br/"), "meu-sus-digital");
    assert.equal(placeIdForUrl("https://servicos.gov.br/"), "govbr");
    assert.equal(placeIdForUrl("https://example.org"), null);
    assert.equal(placeIdForLabel("Wikipedia"), "wikipedia");
    assert.equal(placeIdForLabel("Wikipédia"), "wikipedia");
    assert.equal(placeIdForLabel("Search"), "google-search");
});

test("scoring: limites 0–100 e ordem esperada", () => {
    for (const p of PLACES) {
        const s = scorePlace(p);
        for (const v of [s.privacy, s.attention, s.agency, s.openness, s.health]) {
            assert.ok(v >= 0 && v <= 100, `${p.id} fora do intervalo`);
        }
        assert.ok(s.confidence >= 0 && s.confidence <= 1);
    }
    assert.equal(scoresFor("tiktok").terrain, "labirinto");
    assert.equal(scoresFor("signal").terrain, "clareira");
    assert.ok(scoresFor("mastodon").health > scoresFor("x").health);
    assert.ok(scoresFor("wikipedia").health > scoresFor("google-search").health);
});

test("métricas: dupla contagem evitada (medido vence autodeclarado)", () => {
    let s = emptyState();
    s = applyManual(s, manualRecords({ spotify: 10, youtube: 5 }));
    s = applyImport(
        s,
        {
            source: "spotify",
            records: [{ placeId: "spotify", source: "spotify", quality: "measured", minutes: 120, periodDays: 7 }],
            eventsParsed: 10,
            periodDays: 7,
            unmatched: [],
            warnings: [],
        },
        "x.json",
    );
    const usage = effectiveUsage(s);
    const sp = usage.find((u) => u.placeId === "spotify")!;
    assert.equal(sp.quality, "measured");
    assert.equal(Math.round(sp.weeklyMinutes), 120);
    const yt = usage.find((u) => u.placeId === "youtube")!;
    assert.equal(yt.weeklyMinutes, 300);
});

test("métricas: diversidade e concentração", () => {
    const concentrated = computeMetrics(effectiveUsage(applyManual(emptyState(), manualRecords({ tiktok: 20 }))));
    assert.equal(concentrated.diversity, 0);
    assert.equal(concentrated.top3Share, 100);
    assert.equal(concentrated.labyrinthShare, 100);

    const even: Record<string, number> = {};
    for (const c of CATEGORIES) even[PLACES.find((p) => p.category === c.id)!.id] = 2;
    const diverse = computeMetrics(effectiveUsage(applyManual(emptyState(), manualRecords(even))));
    assert.equal(diverse.diversity, 100);
    assert.equal(diverse.categoriesUsed, 8);
});

test("rota planejada: migrar move o tempo para o destino", () => {
    const usage = effectiveUsage(applyManual(emptyState(), manualRecords({ x: 10, wikipedia: 2 })));
    let s = setDecision(emptyState(), "x", "leave", "mastodon");
    const projected = projectRoute(usage, s.decisions);
    assert.equal(projected.find((u) => u.placeId === "x"), undefined);
    assert.equal(projected.find((u) => u.placeId === "mastodon")!.weeklyMinutes, 600);
    s = setDecision(emptyState(), "x", "reduce");
    const reduced = projectRoute(usage, s.decisions);
    assert.equal(reduced.find((u) => u.placeId === "x")!.weeklyMinutes, 300);
    const before = computeMetrics(usage).healthyAttention;
    const after = computeMetrics(projectRoute(usage, setDecision(emptyState(), "x", "leave", "mastodon").decisions)).healthyAttention;
    assert.ok(after > before);
});

test("importador: Google Takeout Minha Atividade", () => {
    const t0 = Date.parse("2026-10-01T10:00:00Z");
    const items = [
        { header: "YouTube", title: "Watched A", titleUrl: "https://www.youtube.com/watch?v=a", time: new Date(t0).toISOString() },
        { header: "YouTube", title: "Watched B", titleUrl: "https://www.youtube.com/watch?v=b", time: new Date(t0 + 8 * 60000).toISOString() },
        { header: "Search", title: "Searched for x", titleUrl: "https://www.google.com/search?q=x", time: new Date(t0 + 16 * 60000).toISOString() },
        { header: "Desconhecido", title: "?", time: new Date(t0 + 3 * 86400000).toISOString() },
    ];
    const r = detectAndParse("MyActivity.json", JSON.stringify(items));
    assert.equal(r.source, "google-takeout-activity");
    const yt = r.records.find((x) => x.placeId === "youtube")!;
    assert.equal(yt.quality, "derived");
    assert.equal(yt.minutes, 16);
    assert.ok(r.records.find((x) => x.placeId === "google-search"));
    assert.equal(r.unmatched[0].label, "Desconhecido");
    assert.equal(r.periodDays, 3);
});

test("importador: Chrome, Spotify, Netflix e CSV genérico", () => {
    const bh = {
        "Browser History": [
            { url: "https://pt.wikipedia.org/wiki/Brasil", time_usec: 1_760_000_000_000_000 },
            { url: "https://lichess.org/", time_usec: 1_760_000_300_000_000 },
        ],
    };
    const chrome = detectAndParse("History.json", JSON.stringify(bh));
    assert.equal(chrome.source, "google-takeout-browser");
    assert.equal(chrome.records.find((r) => r.placeId === "wikipedia")!.minutes, 5);

    const sp = detectAndParse(
        "StreamingHistory_music_0.json",
        JSON.stringify([
            { endTime: "2026-10-01 10:00", artistName: "A", trackName: "T", msPlayed: 180000 },
            { endTime: "2026-10-02 10:00", artistName: "A", trackName: "T", msPlayed: 120000 },
        ]),
    );
    assert.equal(sp.records[0].minutes, 5);
    assert.equal(sp.records[0].quality, "measured");

    const nf = detectAndParse(
        "ViewingActivity.csv",
        'Profile Name,Start Time,Duration,Attributes,Title,Supplemental Video Type,Device Type,Bookmark,Latest Bookmark,Country\n' +
            'Ana,2026-10-01 20:00:00,00:45:00,,"Série: T1, E1",,TV,00:45:00,00:45:00,BR (Brazil)\n' +
            "Ana,2026-10-01 21:00:00,00:01:30,,Trailer,TRAILER,TV,00:01:30,00:01:30,BR (Brazil)\n",
    );
    assert.equal(nf.records[0].minutes, 45);

    const csv = detectAndParse("uso.csv", "plataforma;minutos\nInstagram;90\nWhatsApp;60\nAppInexistente;5\n");
    assert.equal(csv.records.length, 2);
    assert.equal(csv.unmatched[0].label, "AppInexistente");
    assert.throws(() => detectAndParse("x.json", '{"a":1}'));
});

test("csv: aspas e separadores", () => {
    assert.deepEqual(parseCsv('a,"b, c","d ""e"""\n1,2,3'), [
        ["a", "b, c", 'd "e"'],
        ["1", "2", "3"],
    ]);
});

test("multiverso: alternativas sempre melhores e no mesmo bairro", () => {
    for (const p of PLACES) {
        for (const alt of alternativesFor(p.id)) {
            assert.equal(alt.place.category, p.category);
            assert.ok(alt.healthGain > 0);
        }
    }
    assert.ok(alternativesFor("instagram").some((a) => a.place.id === "pixelfed"));
    const ps = portals(["instagram", "youtube"], 42);
    assert.equal(ps.length, 3);
    assert.equal(new Set(ps.map((p) => p.category)).size, 3);
    assert.deepEqual(portals([], 7).map((p) => p.id), portals([], 7).map((p) => p.id));
});

test("gamificação: XP nunca cresce com mais tempo de tela", () => {
    const mk = (h: number) => {
        const state = applyManual(emptyState(), manualRecords({ tiktok: h, instagram: h }));
        const usage = effectiveUsage(state);
        return computeGameStatus({ state, usage, metrics: computeMetrics(usage, state.explored) }).xp;
    };
    assert.equal(mk(1), mk(40));
    const empty = emptyState();
    const g = computeGameStatus({ state: empty, usage: [], metrics: computeMetrics([]) });
    assert.equal(g.xp, 0);
    assert.equal(g.level.title, "Turista");
});

test("brasil: 27 UFs únicas, células únicas, contribuição arredondada", () => {
    assert.equal(UFS.length, 27);
    assert.equal(new Set(UFS.map((u) => u.code)).size, 27);
    assert.equal(new Set(UFS.map((u) => `${u.col},${u.row}`)).size, 27);
    assert.equal(simulatedAggregates().length, 27);
    const usage = effectiveUsage(applyManual(emptyState(), manualRecords({ whatsapp: 7, g1: 3 })));
    const c = buildContribution("PE", computeMetrics(usage), new Date("2026-11-07T12:00:00Z"));
    assert.equal(c.week, "2026-W45");
    for (const v of [c.diversity, c.healthyAttention, c.openShare, c.adShare]) assert.equal(v % 5, 0);
    assert.equal(isoWeek(new Date("2021-01-01T12:00:00Z")), "2020-W53");
    assert.ok(!("placeId" in c));
    assert.ok(PLACE_BY_ID.whatsapp);
});
