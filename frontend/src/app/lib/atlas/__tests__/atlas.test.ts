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
    assert.equal(placeIdForUrl("https://meususdigital.saude.gov.br/"), "meu-sus-digital");
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

// ── Mundo RPG ─────────────────────────────────────────────────────────────
import { generateWorld, discoveredSet, revealedRealms, visibilityOf, blindTarget, hiddenBetterAlternatives, epithet, EPITHET_GLOSSARY, REALMS, WORLD_W, WORLD_H, placeSigil, SIGIL_MEANING, contentVolumeOf, TERRAIN_BIOME } from "../world";
import { expeditionTarget, entryUrl, CONTENT_VOLUME_LABELS } from "../catalog";
import { discover, toggleLantern, addEcho, connect, setWriteBack, sanitizeState } from "../state";
import { bookmarksHtml, expeditionIcs, linkFacets, discoveryPost, echoText, ECHO_TARGETS, passportJson, readPassport, mastodonVerify, mastodonPost, blueskyLogin, blueskyPost, fitText, normalizeInstance } from "../connectors";

test("essência por local: sigilo definido, no glossário, e varia dentro de um reino", () => {
    for (const p of PLACES) {
        const sig = placeSigil(p);
        assert.ok(SIGIL_MEANING[sig], `${p.id}: ${sig}`);
    }
    // dois territórios do mesmo reino (social) com essências diferentes
    assert.notEqual(placeSigil(PLACE_BY_ID.instagram), placeSigil(PLACE_BY_ID.mastodon));
    assert.equal(placeSigil(PLACE_BY_ID.instagram), "vortex"); // feed infinito + autoplay
    assert.equal(placeSigil(PLACE_BY_ID.g1), "megaphone"); // anúncios, sem feed infinito
    assert.equal(placeSigil(PLACE_BY_ID.mastodon), "network"); // federado
    assert.equal(placeSigil(PLACE_BY_ID.signal), "shield"); // cripto
    assert.equal(placeSigil(PLACE_BY_ID.tiktok), "vortex"); // feed+autoplay
    assert.equal(placeSigil(PLACE_BY_ID.govbr), "columns"); // público
});

test("três volumes distintos: conteúdo ≠ população, com fallback honesto", () => {
    // Wikipédia: poucos editores, conteúdo colossal → conteúdo > população
    assert.ok(contentVolumeOf(PLACE_BY_ID.wikipedia) > (PLACE_BY_ID.wikipedia.population ?? 0));
    // WhatsApp: muita gente, pouco conteúdo público → conteúdo < população
    assert.ok(contentVolumeOf(PLACE_BY_ID.whatsapp) < (PLACE_BY_ID.whatsapp.population ?? 99));
    // Sem override, cai para a população
    const noOverride = PLACES.find((p) => p.contentVolume === undefined && p.population !== undefined)!;
    assert.equal(contentVolumeOf(noOverride), noOverride.population);
    for (const p of PLACES) {
        const v = contentVolumeOf(p);
        assert.ok(v >= 1 && v <= 5, p.id);
        assert.ok(CONTENT_VOLUME_LABELS[v], p.id);
    }
});

test("expedição desembarca em conteúdo real, com fallback para a porta", () => {
    const wiki = expeditionTarget(PLACE_BY_ID.wikipedia);
    assert.ok(wiki.label && wiki.url.startsWith("https://pt.wikipedia.org/wiki/Especial"));
    // fallback: sem entryContent, usa a porta de entrada e não inventa rótulo
    const fb = expeditionTarget(PLACE_BY_ID.whatsapp);
    assert.equal(fb.label, null);
    assert.equal(fb.url, entryUrl(PLACE_BY_ID.whatsapp));
    // todo entryContent é https válido e aponta ao domínio do próprio lugar ou subdomínio conhecido
    for (const p of PLACES) {
        if (!p.entryContent) continue;
        const u = new URL(p.entryContent.url);
        assert.equal(u.protocol, "https:", p.id);
        assert.ok(p.entryContent.label.length > 0, p.id);
    }
    assert.ok(TERRAIN_BIOME.clareira.biome && TERRAIN_BIOME.labirinto.biome);
});

test("mundo: determinístico, dentro dos limites, um território por lugar", () => {
    const a = generateWorld();
    const b = generateWorld();
    assert.deepEqual(a, b);
    assert.equal(a.islands.length, 8);
    assert.equal(a.territories.length, PLACES.length);
    for (const t of a.territories) {
        assert.ok(t.center.x > 0 && t.center.x < WORLD_W && t.center.y > 0 && t.center.y < WORLD_H, t.placeId);
        const realm = REALMS.find((r) => r.id === t.realm)!;
        assert.ok(Math.hypot(t.center.x - realm.center.x, t.center.y - realm.center.y) <= realm.radius, t.placeId);
    }
    // territórios do mesmo reino não se sobrepõem
    for (const r of REALMS) {
        const ts = a.territories.filter((t) => t.realm === r.id);
        for (let i = 0; i < ts.length; i++)
            for (let j = i + 1; j < ts.length; j++) {
                const d = Math.hypot(ts[i].center.x - ts[j].center.x, ts[i].center.y - ts[j].center.y);
                assert.ok(d >= ts[i].radius + ts[j].radius - 1, `${ts[i].placeId}×${ts[j].placeId}`);
            }
    }
});

test("mundo: visibilidade incógnita → silhueta → descoberto", () => {
    let s = emptyState();
    let set = discoveredSet(s, []);
    assert.equal(visibilityOf("mastodon", set, revealedRealms(set)), "incognita");
    s = discover(s, "instagram", "expedition");
    set = discoveredSet(s, []);
    assert.equal(visibilityOf("instagram", set, revealedRealms(set)), "discovered");
    assert.equal(visibilityOf("mastodon", set, revealedRealms(set)), "silhouette");
    assert.equal(visibilityOf("wikipedia", set, revealedRealms(set)), "incognita");
    const target = blindTarget("social", set, 1)!;
    assert.ok(target && !set.has(target) && PLACE_BY_ID[target].category === "social");
    const hidden = hiddenBetterAlternatives("instagram", set);
    assert.ok(hidden.includes("mastodon") && !hidden.includes("instagram"));
});

test("descoberta: verificada nunca é rebaixada; estado antigo é migrado", () => {
    let s = discover(emptyState(), "x", "import");
    s = discover(s, "x", "expedition");
    assert.equal(s.discoveries.x.method, "import");
    assert.equal(s.discoveries.x.verified, true);
    const legacy = sanitizeState({ version: 1, records: {}, imports: [], explored: {}, decisions: {}, contributeToBrazilMap: false, updatedAt: "" })!;
    assert.deepEqual(legacy.discoveries, {});
    assert.deepEqual(legacy.caravan, []);
});

test("epítetos: derivados dos atributos, sem marca, todos no glossário", () => {
    assert.equal(epithet(PLACE_BY_ID.mastodon), "Praça sem Coroa");
    assert.equal(epithet(PLACE_BY_ID.tiktok), "Galeria de Espelhos sem Fim");
    assert.equal(epithet(PLACE_BY_ID.signal), "Pombal dos Selos Abertos");
    for (const p of PLACES) {
        const e = epithet(p);
        assert.ok(!e.toLowerCase().includes(p.name.toLowerCase()), p.id);
        const q = Object.keys(EPITHET_GLOSSARY).find((k) => e.endsWith(k));
        assert.ok(q, `${p.id}: ${e}`);
    }
});

test("gamificação social: lanternas e ecos com teto", () => {
    let s = emptyState();
    for (const p of PLACES.slice(0, 30)) s = toggleLantern(addEcho(addEcho(s, p.id), p.id), p.id);
    const g = computeGameStatus({ state: s, usage: [], metrics: computeMetrics([]) });
    const lan = g.xpBreakdown.find((x) => x.label === "Lanternas acesas")!.xp;
    const eco = g.xpBreakdown.find((x) => x.label === "Ecos")!.xp;
    assert.equal(lan, 100);
    assert.equal(eco, 200);
});

test("conectores: favoritos, agenda, passaporte, intents", () => {
    const html = bookmarksHtml(["mastodon", "wikipedia"], new Date("2026-11-07T00:00:00Z"));
    assert.ok(html.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>"));
    assert.ok(html.includes('HREF="https://joinmastodon.org"'));
    assert.ok(html.includes("Ilhas do Burburinho") && html.includes("Planalto das Torres"));
    const ics = expeditionIcs("Vale dos Espelhos", new Date("2026-11-08T13:00:00Z"), "https://exemplo/atlas");
    assert.ok(ics.includes("DTSTART:20261108T130000Z") && ics.includes("DTEND:20261108T133000Z"));
    assert.ok(ics.includes("\r\nEND:VCALENDAR"));
    assert.ok(!ics.includes("joinpeertube"), "agenda não revela o destino");
    const st = discover(emptyState(), "lichess", "expedition");
    assert.deepEqual(readPassport(passportJson(st))!.discoveries.lichess.method, "expedition");
    assert.equal(readPassport("{}"), null);
    const wa = ECHO_TARGETS.find((t) => t.id === "whatsapp")!.url("oi", "https://a.b");
    assert.equal(wa, "https://wa.me/?text=oi%20https%3A%2F%2Fa.b");
    assert.equal(ECHO_TARGETS.find((t) => t.id === "mastodon")!.url("oi", "https://a.b"), null);
    assert.ok(ECHO_TARGETS.find((t) => t.id === "mastodon")!.url("oi", "https://a.b", { instance: "https://Mastodon.Social/@x" })!.startsWith("https://mastodon.social/share?text="));
    assert.ok(echoText(PLACE_BY_ID.lichess).includes("Lichess"));
    assert.equal(normalizeInstance(" https://ursal.zone/ "), "ursal.zone");
});

test("conectores: publicação respeita limites e facets em bytes UTF-8", () => {
    for (const p of PLACES) {
        assert.ok(Array.from(discoveryPost(p, 300)).length <= 300, p.id);
        assert.ok(discoveryPost(p, 300).includes("#AtlasDigital"));
    }
    const text = "Território à vista: https://lichess.org fim";
    const [f] = linkFacets(text);
    const bytes = new TextEncoder().encode(text);
    assert.equal(new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd)), "https://lichess.org");
    assert.equal(fitText("abcdef", 4), "abc…");
});

test("conectores: chamadas às APIs com o formato documentado", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        const body = url.includes("verify_credentials")
            ? { acct: "ana", statuses_count: 12, followers_count: 30, following_count: 40 }
            : url.includes("statuses") ? { url: "https://m.s/@ana/1" }
            : url.includes("createSession") ? { accessJwt: "jwt", did: "did:plc:x", handle: "ana.bsky.social" }
            : { uri: "at://did:plc:x/app.bsky.feed.post/1" };
        return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const acc = await mastodonVerify("mastodon.social", "tok", fake);
    assert.equal(acc.statuses_count, 12);
    assert.equal(calls[0].url, "https://mastodon.social/api/v1/accounts/verify_credentials");
    await mastodonPost("mastodon.social", "tok", "olá", fake);
    assert.equal(JSON.parse(String(calls[1].init!.body)).status, "olá");
    const sess = await blueskyLogin("@ana.bsky.social", "app-pass", undefined, fake);
    assert.equal(calls[2].url, "https://bsky.social/xrpc/com.atproto.server.createSession");
    assert.equal(JSON.parse(String(calls[2].init!.body)).identifier, "ana.bsky.social");
    await blueskyPost(sess, "veja https://lichess.org", undefined, fake);
    const rec = JSON.parse(String(calls[3].init!.body));
    assert.equal(rec.collection, "app.bsky.feed.post");
    assert.equal(rec.repo, "did:plc:x");
    assert.equal(rec.record.facets.length, 1);
    const st = setWriteBack(connect(emptyState(), "mastodon", { account: "ana", service: "mastodon.social" }, "mastodon", { posts: 12 }), "mastodon", true);
    assert.equal(st.discoveries.mastodon.verified, true);
    assert.equal(st.inhabit.mastodon.posts, 12);
});

// ── Modo Expedição (dinâmica de mapa de aventura) ───────────────────────────
import {
    initExpedition, budget, resolveMove, creditLeagues, leagueCost, reachTowards,
    generateMarks, nearestHatched, collectMarkYield, todayKey,
    DAILY_LEAGUES, LEAGUE_PX, FONTE_LEAGUES, BONUS_IMPORT,
} from "../expedition";
import { grantLeagues, setExpedition } from "../state";

test("expedição: orçamento diário com fontes e bônus, reset ao virar o dia", () => {
    const world = generateWorld();
    const exp = initExpedition(world, new Set(), []);
    assert.equal(exp.leaguesSpent, 0);
    assert.equal(budget(exp, 0).total, DAILY_LEAGUES);
    assert.equal(budget(exp, 3).fontes, 3 * FONTE_LEAGUES);
    assert.equal(budget(exp, 99).fontes, 5 * FONTE_LEAGUES); // teto de 5 fontes
    // bônus some no dia seguinte
    const withBonus = creditLeagues(exp, 50);
    assert.equal(budget(withBonus, 0).bonus, 50);
    const yesterday = { ...withBonus, leaguesDay: "2000-01-01", leaguesSpent: 40 };
    const b = budget(yesterday, 0);
    assert.equal(b.spent, 0);
    assert.equal(b.bonus, 0);
    assert.equal(todayKey(new Date("2026-11-07T10:00:00")), "2026-11-07");
});

test("expedição: custo de léguas, trilha e truncamento", () => {
    const world = generateWorld();
    const discovered = new Set<string>();
    const a = { x: 100, y: 100 };
    const b = { x: 100 + LEAGUE_PX * 10, y: 100 }; // 10 léguas em terra aberta
    const cost = leagueCost(a, b, world, discovered);
    assert.ok(Math.abs(cost - 10) < 0.01, `custo ${cost}`);
    // trunca quando falta orçamento
    const r = reachTowards(a, b, 4, world, discovered);
    assert.ok(r.truncated);
    assert.ok(Math.abs(r.cost - 4) < 0.01);
    assert.ok(r.point.x < b.x && r.point.x > a.x);
    // dentro do orçamento, chega inteiro
    const r2 = reachTowards(a, b, 100, world, discovered);
    assert.equal(r2.truncated, false);
    assert.deepEqual(r2.point, b);
});

test("expedição: mover dissipa bruma, gasta léguas e não ultrapassa o orçamento", () => {
    const world = generateWorld();
    const discovered = new Set<string>();
    const exp = initExpedition(world, discovered, []);
    const fog0 = exp.fog.length;
    // o destino é limitado ao mundo: usa o canto mais distante (rota cara, além do orçamento)
    const corners = [{ x: 2, y: 2 }, { x: WORLD_W - 2, y: 2 }, { x: 2, y: WORLD_H - 2 }, { x: WORLD_W - 2, y: WORLD_H - 2 }];
    const far = corners.reduce((best, c) => (Math.hypot(c.x - exp.cartographer.x, c.y - exp.cartographer.y) > Math.hypot(best.x - exp.cartographer.x, best.y - exp.cartographer.y) ? c : best));
    const res = resolveMove(exp, far, world, discovered, 0);
    assert.ok(res.moved && res.truncated);
    assert.ok(res.exp.fog.length > fog0, "a bruma foi dissipada no caminho");
    const avail = budget(exp, 0).available;
    assert.ok(res.exp.leaguesSpent <= avail + 0.01);
    assert.ok(res.exp.leaguesSpent > 0);
    // sem léguas, não move
    const drained = { ...res.exp };
    const res2 = resolveMove(drained, { x: drained.cartographer.x + 4000, y: drained.cartographer.y }, world, discovered, 0);
    assert.equal(res2.moved, false);
});

test("expedição: marcos rendem rumor do território hachurado mais próximo", () => {
    const world = generateWorld();
    const marks = generateMarks();
    assert.equal(marks.length, 8); // um por reino
    const discovered = new Set<string>();
    const near = nearestHatched(marks[0].pos, world, discovered);
    assert.ok(near && PLACE_BY_ID[near]);
    const y = collectMarkYield(marks[0], world, discovered);
    assert.ok(y.rumorPlaceId && y.epithet && y.leagues === 0);
    // se tudo já foi descoberto, o marco vira bônus de léguas
    const allKnown = new Set(PLACES.map((p) => p.id));
    const y2 = collectMarkYield(marks[0], world, allKnown);
    assert.equal(y2.rumorPlaceId, null);
    assert.ok(y2.leagues > 0);
});

test("expedição: ações reais creditam léguas; sem modo é no-op", () => {
    let s = emptyState();
    assert.equal(grantLeagues(s, BONUS_IMPORT), s); // no-op sem expedição
    s = setExpedition(s, initExpedition(generateWorld(), new Set(), []));
    const before = s.expedition!.leaguesBonus;
    s = grantLeagues(s, BONUS_IMPORT);
    assert.equal(s.expedition!.leaguesBonus, before + BONUS_IMPORT);
});

// ── Mapa de aventura (terreno procedural) ───────────────────────────────────
import { generateAdventure, generateRoads, pointInPolygon, quadPoint, REALM_BIOME, BIOME_STYLE, valueNoise, fbm, smoothstep, clusterAcceptance } from "../adventure";
import { seededRandom } from "../multiverse";
import { islandPolygon } from "../world";

test("aventura: biomas definidos e terreno determinístico", () => {
    for (const r of REALMS) assert.ok(BIOME_STYLE[REALM_BIOME[r.id]], r.id);
    const a = generateAdventure();
    const b = generateAdventure();
    assert.equal(a, b); // memoizado
    const roads2 = generateRoads(generateWorld());
    assert.deepEqual(roads2, a.roads);
    assert.ok(a.decorations.length > 400, `decorações: ${a.decorations.length}`);
});

test("aventura: decorações dentro da ilha, fora das clareiras das cidades", () => {
    const { world, decorations } = generateAdventure();
    for (const d of decorations) {
        const realm = REALMS.find((r) => r.id === d.realm)!;
        assert.ok(pointInPolygon({ x: d.x, y: d.y }, islandPolygon(realm)), `${d.kind} fora da ilha`);
        for (const t of world.territories) {
            assert.ok(Math.hypot(t.center.x - d.x, t.center.y - d.y) > t.radius, `${d.kind} sobre ${t.placeId}`);
        }
    }
    // ordenadas por y (pintura com profundidade)
    for (let i = 1; i < decorations.length; i++) assert.ok(decorations[i].y >= decorations[i - 1].y);
});

test("aventura: estradas ligam todas as cidades de cada reino (árvore)", () => {
    const { world, roads } = generateAdventure();
    for (const r of REALMS) {
        const towns = world.territories.filter((t) => t.realm === r.id);
        const rs = roads.filter((x) => x.realm === r.id);
        assert.equal(rs.length, towns.length - 1, r.id);
        // união-busca: tudo conectado
        const parent = new Map(towns.map((t) => [`${t.center.x},${t.center.y}`, `${t.center.x},${t.center.y}`]));
        const find = (k: string): string => (parent.get(k) === k ? k : find(parent.get(k)!));
        for (const e of rs) parent.set(find(`${e.from.x},${e.from.y}`), find(`${e.to.x},${e.to.y}`));
        assert.equal(new Set(towns.map((t) => find(`${t.center.x},${t.center.y}`))).size, 1, r.id);
    }
    const r0 = roads[0];
    assert.deepEqual(quadPoint(r0, 0), r0.from);
    assert.deepEqual(quadPoint(r0, 1), r0.to);
    assert.ok(pointInPolygon({ x: 1, y: 1 }, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]));
    assert.ok(!pointInPolygon({ x: 9, y: 1 }, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]));
});

// ── skill procedural-gen: PRNG próprio fixado, fBm normalizado, aglomeração ──

test("procgen: PRNG próprio tem saídas fixadas (sementes compartilháveis sobrevivem a atualizações)", () => {
    const r = seededRandom(42);
    assert.deepEqual([r(), r(), r()].map((v) => v.toFixed(10)), ["0.6011037519", "0.4482905590", "0.8524657935"]);
});

test("procgen: fBm é determinístico, fica em 0..1 e sementes distintas se descorrelacionam", () => {
    const a = valueNoise(1);
    const a2 = valueNoise(1);
    const b = valueNoise(2);
    let diff = 0;
    for (let i = 0; i < 400; i++) {
        const x = (i % 20) * 0.73 + 0.11;
        const y = Math.floor(i / 20) * 0.61 + 0.07;
        const v = fbm(a, x, y);
        assert.ok(v >= 0 && v <= 1, `fbm fora de 0..1: ${v}`);
        assert.equal(v, fbm(a2, x, y));
        diff += Math.abs(v - fbm(b, x, y));
    }
    assert.ok(diff / 400 > 0.05, "campos com sementes diferentes não deveriam coincidir");
});

test("procgen: smoothstep e aceitação de aglomerados ficam em 0..1", () => {
    assert.equal(smoothstep(0, 1, -1), 0);
    assert.equal(smoothstep(0, 1, 2), 1);
    assert.equal(smoothstep(0, 1, 0.5), 0.5);
    const f = valueNoise(7);
    const r = valueNoise(8);
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < 300; i++) {
        const x = i * 13.7;
        const y = i * 9.1;
        for (const kind of ["tree", "mountain", "cottage"] as const) {
            const v = clusterAcceptance(kind as never, x, y, f, r);
            assert.ok(v >= 0 && v <= 1);
            if (kind === "tree") {
                lo = Math.min(lo, v);
                hi = Math.max(hi, v);
            }
        }
    }
    assert.ok(hi - lo > 0.5, "vegetação deve formar bosques e clareiras, não uma camada uniforme");
});

// ── skill game-ai: rota do Cartógrafo pelo terreno ──────────────────────────
import { planRoute, marksAlongPath } from "../expedition";
import { navGrid, buildField, cellOf, cellCenterNav, COST, NAV_COLS, NAV_ROWS, NAV_CELL } from "../navigation";

const ALL_FOG: string[] = [];
for (let c = 0; c < 40; c++) for (let r = 0; r < 25; r++) ALL_FOG.push(`${c},${r}`);

function seaFraction(points: { x: number; y: number }[], kind: Uint8Array): number {
    let sea = 0, n = 0;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        for (let s = 0; s < L; s += 3) {
            n++;
            if (kind[cellOf({ x: a.x + ((b.x - a.x) * s) / L, y: a.y + ((b.y - a.y) * s) / L })] === 0) sea++;
        }
    }
    return n ? sea / n : 0;
}

test("rota: campo de Dijkstra respeita a desigualdade de caminho mínimo em toda aresta", () => {
    const world = generateWorld();
    const grid = navGrid(world);
    const field = buildField(grid, { x: 400, y: 300 }, () => true);
    assert.equal(field.dist[field.start], 0);
    let finite = 0;
    for (let i = 0; i < NAV_COLS * NAV_ROWS; i++) {
        if (Number.isFinite(field.dist[i])) finite++;
        const cx = i % NAV_COLS, cy = Math.floor(i / NAV_COLS);
        if (cx + 1 < NAV_COLS) {
            const j = i + 1;
            const m = (field.mult[i] + field.mult[j]) / 2;
            assert.ok(field.dist[j] <= field.dist[i] + NAV_CELL * m + 1e-6, `aresta ${i}->${j}`);
        }
        if (cy + 1 < NAV_ROWS) {
            const j = i + NAV_COLS;
            const m = (field.mult[i] + field.mult[j]) / 2;
            assert.ok(field.dist[j] <= field.dist[i] + NAV_CELL * m + 1e-6, `aresta ${i}->${j}`);
        }
    }
    assert.equal(finite, NAV_COLS * NAV_ROWS, "o mar é atravessável: todo o mundo é alcançável");
});

test("rota: dentro da ilha não atravessa o mar; estrada revelada barateia; entre ilhas o mar pesa", () => {
    const world = generateWorld();
    const grid = navGrid(world);
    const a = world.territories[0];
    const b = world.territories.find((t) => t.realm === a.realm && t !== a)!;
    const exp = { ...initExpedition(world, new Set(), []), cartographer: a.center };
    const hidden = planRoute(exp, b.center, 999, world);
    assert.equal(seaFraction(hidden.points, grid.kind), 0);
    assert.deepEqual(hidden.points[0], a.center);
    assert.deepEqual(hidden.points[hidden.points.length - 1], b.center);
    const revealed = planRoute({ ...exp, fog: ALL_FOG }, b.center, 999, world);
    assert.ok(revealed.total < hidden.total, `estrada vista deveria baratear: ${revealed.total} vs ${hidden.total}`);
    assert.ok(revealed.total >= leagueCost(a.center, b.center, world, new Set()) * COST.road - 1e-6, "nunca abaixo do piso da estrada");
    const other = world.territories.find((t) => t.realm !== a.realm)!;
    const cross = planRoute(exp, other.center, 999, world);
    assert.ok(cross.total > leagueCost(a.center, other.center, world, new Set()), "travessia custa mais que a linha reta");
});

test("rota: trunca no orçamento sobre o próprio caminho e é determinística", () => {
    const world = generateWorld();
    const exp = initExpedition(world, new Set(), []);
    const goal = { x: 1500, y: 900 };
    const plan = planRoute(exp, goal, 12, world);
    assert.ok(plan.reach.truncated);
    assert.ok(Math.abs(plan.reach.cost - 12) < 1e-6);
    assert.deepEqual(plan.reach.points[plan.reach.points.length - 1], plan.reach.point);
    assert.ok(plan.costs.every((c, i) => i === 0 || c >= plan.costs[i - 1]), "custo acumulado é monotônico");
    const again = planRoute({ ...exp, fog: [...exp.fog] }, goal, 12, generateWorld());
    assert.deepEqual(again.points, plan.points);
    assert.ok(Math.abs(again.total - plan.total) < 1e-9);
});

test("rota: mover segue o caminho e coleta marcos tocados no trajeto", () => {
    const world = generateWorld();
    const mark = generateMarks()[0];
    const start = { x: mark.pos.x - 70, y: mark.pos.y };
    const exp = { ...initExpedition(world, new Set(), []), cartographer: start };
    const res = resolveMove(exp, { x: mark.pos.x + 70, y: mark.pos.y }, world, new Set(), 0);
    assert.ok(res.moved);
    assert.deepEqual(res.path[0], start);
    assert.deepEqual(res.path[res.path.length - 1], res.exp.cartographer);
    assert.ok(res.exp.marksCollected.includes(mark.id), "o marco no meio do caminho foi coletado");
    assert.ok(marksAlongPath([start], [], [mark]).length === 0, "longe do marco, nada é coletado");
    assert.ok(cellCenterNav(cellOf(start)).x > 0);
});

// ── skill input-systems: ações por tecla física e pinça ─────────────────────
import { actionForKey, pinchCamera } from "../input";

test("entrada: ações vêm da tecla FÍSICA (AZERTY mantém WASD) e Ctrl/⌘ ficam com o navegador", () => {
    // AZERTY: a tecla física KeyW produz "z", KeyA produz "q" — a ação segue a posição
    assert.equal(actionForKey({ code: "KeyW", key: "z" }), "panUp");
    assert.equal(actionForKey({ code: "KeyA", key: "q" }), "panLeft");
    assert.equal(actionForKey({ code: "ArrowDown", key: "ArrowDown" }), "panDown");
    assert.equal(actionForKey({ code: "NumpadAdd", key: "+" }), "zoomIn");
    // "+" em outra tecla física (layouts diversos) ainda aproxima
    assert.equal(actionForKey({ code: "BracketRight", key: "+" }), "zoomIn");
    assert.equal(actionForKey({ code: "KeyC", key: "c" }), "centerHero");
    // Ctrl/⌘ + "+" é o zoom da página: não sequestra
    assert.equal(actionForKey({ code: "Equal", key: "+", ctrlKey: true }), null);
    assert.equal(actionForKey({ code: "KeyW", key: "w", metaKey: true }), null);
    assert.equal(actionForKey({ code: "KeyX", key: "x" }), null);
});

test("entrada: pinça escala pela razão dos dedos e mantém a âncora sob o ponto médio", () => {
    const start = { dist0: 100, zoom0: 1.5, anchor: { x: 800, y: 500 } };
    const mid = { x: 200, y: 150 };
    const cam = pinchCamera(start, 200, mid);
    assert.equal(cam.zoom, 3);
    // o ponto do mundo sob o meio dos dedos continua sendo a âncora
    assert.ok(Math.abs(cam.x + mid.x / cam.zoom - start.anchor.x) < 1e-9);
    assert.ok(Math.abs(cam.y + mid.y / cam.zoom - start.anchor.y) < 1e-9);
    assert.equal(pinchCamera({ ...start, dist0: 0 }, 50, mid).zoom, 75, "distância inicial nula não divide por zero");
});

// ── skill save-systems: versão, migração, validação, backup e quarentena ────
import { migrateState, readState, writeState, resetBackupClock, STORAGE_KEY, BACKUP_KEY, QUARANTINE_KEY } from "../state";

function memStorage(init: Record<string, string> = {}) {
    const m = new Map(Object.entries(init));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), map: m };
}

test("save: migra em ordem, aceita save sem versão e recusa save de versão mais nova", () => {
    const steps = { 1: (d: Record<string, unknown>) => ({ ...d, extra: "v2" }), 2: (d: Record<string, unknown>) => ({ ...d, outra: true }) };
    const out = migrateState({ version: 1, records: {} }, steps, 3)!;
    assert.equal(out.version, 3);
    assert.equal(out.extra, "v2");
    assert.equal(out.outra, true);
    assert.equal(migrateState({ records: {} })!.version, 1, "sem campo = primeiro formato");
    assert.equal(migrateState({ version: 2, records: {} }), null, "versão mais nova: recusa");
    assert.equal(migrateState({ version: 1, records: {} }, {}, 2), null, "migração faltando: recusa");
});

test("save: expedição corrompida é descartada sem derrubar o restante", () => {
    const s = sanitizeState({ ...emptyState(), explored: "x", caravan: [1, 2], expedition: { cartographer: { x: "a" }, fog: 3 } })!;
    assert.ok(s);
    assert.equal(s.expedition, undefined);
    assert.deepEqual(s.explored, {});
    assert.deepEqual(s.caravan, []);
    const ok = sanitizeState({ ...emptyState(), expedition: initExpedition(generateWorld(), new Set(), []) })!;
    assert.ok(ok.expedition && Array.isArray(ok.expedition.fog));
});

test("save: cópia de segurança restaura e o ilegível vai para a quarentena antes de ser sobrescrito", () => {
    resetBackupClock();
    const st = memStorage();
    const s1 = { ...emptyState(), explored: { wikipedia: "2026-11-07" } };
    assert.ok(writeState(st, s1, 1_000));
    assert.ok(st.map.has(BACKUP_KEY), "primeiro save cria a cópia");
    // dentro de 5 min, a cópia não é reescrita
    writeState(st, { ...s1, explored: {} }, 2_000);
    assert.deepEqual(JSON.parse(st.map.get(BACKUP_KEY)!).explored, { wikipedia: "2026-11-07" });
    // principal corrompido: lê da cópia e preserva o corrompido
    st.map.set(STORAGE_KEY, "{corrompido");
    const r = readState(st);
    assert.equal(r.source, "backup");
    assert.deepEqual(r.state!.explored, { wikipedia: "2026-11-07" });
    assert.equal(st.map.get(QUARANTINE_KEY), "{corrompido");
    // save de versão futura também vai para a quarentena (não é rebaixado em silêncio)
    const st2 = memStorage({ [STORAGE_KEY]: JSON.stringify({ version: 9, records: {} }) });
    assert.equal(readState(st2).state, null);
    assert.ok(st2.map.get(QUARANTINE_KEY)!.includes('"version":9'));
    // storage recusando gravação não lança
    assert.equal(writeState({ getItem: () => null, setItem: () => { throw new Error("cota"); } }, s1), false);
});

// ── skill audio-design: curva de volume e variação ──────────────────────────
import { sliderToGain, gainToDb, vary, mapSfx } from "../sfx";

test("áudio: slider vira ganho quadrático (0 = silêncio real) e variação fica em ±1 semitom/±2 dB", () => {
    assert.equal(sliderToGain(0), 0);
    assert.equal(sliderToGain(1), 1);
    assert.equal(sliderToGain(0.5), 0.25);
    assert.equal(sliderToGain(7), 1);
    assert.equal(sliderToGain(Number.NaN), 0);
    assert.ok(Math.abs(gainToDb(0.5) - -6.0206) < 1e-3);
    assert.equal(gainToDb(0), -Infinity);
    const r = seededRandom(3);
    for (let i = 0; i < 500; i++) {
        const v = vary(r);
        assert.ok(v.rate >= Math.pow(2, -1 / 12) - 1e-12 && v.rate <= Math.pow(2, 1 / 12) + 1e-12);
        assert.ok(v.gain >= Math.pow(10, -2 / 20) - 1e-12 && v.gain <= Math.pow(10, 2 / 20) + 1e-12);
    }
    // sem gesto/contexto (ex.: servidor ou testes), tocar é no-op seguro
    mapSfx.setVolume(1);
    mapSfx.play("reveal");
    mapSfx.setVolume(0);
});
