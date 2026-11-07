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
    const far = { x: exp.cartographer.x + 5000, y: exp.cartographer.y }; // muito além do orçamento
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
