"use client";

import { useEffect, useState } from "react";
import { Award, BarChart3, BookOpen, Cloud, CloudOff, Compass, Globe2, Map as MapIcon, Plug, X } from "lucide-react";
import { track } from "@/app/lib/atlas/analytics";
import { PLACE_BY_ID } from "@/app/lib/atlas/catalog";
import { formatMinutes } from "@/app/lib/atlas/metrics";
import { REALMS, randomExpedition } from "@/app/lib/atlas/world";
import { AchievementsPanel } from "./AchievementsPanel";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { BrazilPanel } from "./BrazilPanel";
import { ConnectorsPanel } from "./ConnectorsPanel";
import { EchoDialog } from "./EchoDialog";
import { ExpeditionDialog } from "./ExpeditionDialog";
import { IntegrationsPanel } from "./IntegrationsPanel";
import { JournalPanel } from "./JournalPanel";
import { PlaceDrawer } from "./PlaceDrawer";
import { ProgressBar, StatTile } from "./ui";
import { useAtlas } from "./useAtlas";
import { WorldMap } from "./WorldMap";

type Tab = "world" | "journal" | "brazil" | "achievements" | "analytics" | "connections";

const TABS: { id: Tab; label: string; icon: typeof MapIcon }[] = [
    { id: "world", label: "Mundo", icon: Globe2 },
    { id: "journal", label: "Diário", icon: BookOpen },
    { id: "brazil", label: "Brasil", icon: MapIcon },
    { id: "achievements", label: "Conquistas", icon: Award },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "connections", label: "Conexões", icon: Plug },
];

export function AtlasView() {
    const atlas = useAtlas();
    const { state, usage, discovered, realms, world, rumors, metrics, projectedMetrics, game, actions } = atlas;
    const { expedition: expState, leagues } = atlas;
    const [tab, setTab] = useState<Tab>("world");
    const [selected, setSelected] = useState<string | null>(null);
    const [expedition, setExpedition] = useState<string | null>(null);
    const [echo, setEcho] = useState<string | null>(null);
    const [expMode, setExpMode] = useState(false);

    const toggleExpMode = () => {
        setExpMode((on) => {
            if (!on) {
                atlas.actions.enterExpedition();
                setSelected(null);
                track("tab_viewed", { tab: "expedition_mode" });
            }
            return !on;
        });
    };

    useEffect(() => {
        track("tab_viewed", { tab });
    }, [tab]);

    const startExpedition = (placeId: string) => {
        setSelected(null);
        setExpedition(placeId);
    };

    const badgeNames = game.badges.filter((b) => atlas.newBadges.includes(b.id)).map((b) => b.name);
    const blank = discovered.size === 0;

    return (
        <div className="h-full overflow-y-auto bg-[#fafaf8]">
            <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
                <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h1 className="font-serif text-4xl font-light text-gray-900">Atlas Digital</h1>
                        <p className="mt-1 max-w-xl text-sm text-gray-600">
                            Um mapa do seu território digital — e do multiverso que você ainda não pisou. O desconhecido
                            fica hachurado até você ir lá.
                        </p>
                    </div>
                    <div className="w-full rounded-xl border border-gray-200 bg-white p-3 md:w-72">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-semibold text-gray-900">{game.level.title}</span>
                            <span className="tabular-nums text-gray-600">{game.xp} XP</span>
                        </div>
                        <ProgressBar value={game.levelProgress} className="mt-2" />
                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-500">
                            <span>{game.nextLevel ? `Próximo: ${game.nextLevel.title} (${game.nextLevel.min} XP)` : "Nível máximo"}</span>
                            <span className="flex items-center gap-1" title="Estado da sincronização">
                                {atlas.sync === "offline" ? <CloudOff className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
                                {atlas.sync === "offline" ? "só neste navegador" : atlas.sync === "syncing" ? "salvando…" : "salvo"}
                            </span>
                        </div>
                    </div>
                </header>

                {badgeNames.length > 0 && (
                    <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-900 bg-white px-4 py-3 text-sm">
                        <span><Award className="mr-1.5 inline h-4 w-4" /> Nova conquista: <strong>{badgeNames.join(", ")}</strong></span>
                        <button onClick={actions.dismissBadges} aria-label="Fechar" className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
                    </div>
                )}

                <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-gray-200" role="tablist">
                    {TABS.map(({ id, label, icon: Icon }) => (
                        <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === id ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
                            <Icon className="h-4 w-4" /> {label}
                        </button>
                    ))}
                </nav>

                <div className="mt-6">
                    {tab === "world" && (
                        <div className="space-y-4">
                            {blank && (
                                <div className="flex flex-col gap-3 rounded-2xl border border-[#1b2742] bg-[#070d1c] p-5 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <h2 className="font-serif text-2xl text-[#eaf2ff]">O cosmos está sob criptografia</h2>
                                        <p className="text-sm text-[#9fb4da]">
                                            Ilumine os setores que você já habita trazendo seus dados — ou atravesse a bruma numa sondagem.
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        <button onClick={() => setTab("connections")} className="rounded-lg border border-[#2e466e] px-3 py-2 text-sm text-[#9fb4da] hover:bg-[#13213d]">Trazer meus dados</button>
                                        <button onClick={() => {
                                                const target = randomExpedition(discovered, Date.now());
                                                if (target) startExpedition(target);
                                            }}
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#5fe3ff] px-3 py-2 text-sm font-medium text-[#041018]">
                                            <Compass className="h-4 w-4" /> Primeira sondagem
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
                                    <StatTile label="Territórios revelados" value={`${discovered.size}/${metrics.catalogSize}`} hint={`${realms.size} de ${REALMS.length} reinos`} />
                                    <StatTile label="Tempo semanal" value={usage.length ? formatMinutes(metrics.totalWeeklyMinutes) : "—"} />
                                    <StatTile label="Atenção saudável" value={usage.length ? String(metrics.healthyAttention) : "—"} hint="0–100, ponderado pelo tempo" />
                                    <StatTile label="Diversidade" value={usage.length ? String(metrics.diversity) : "—"} hint="Equilíbrio entre reinos" />
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1b2742] bg-[#070d1c] px-4 py-2.5">
                                <button
                                    onClick={toggleExpMode}
                                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${expMode ? "bg-[#5fe3ff] text-[#041018]" : "border border-[#2e466e] text-[#9fb4da] hover:bg-[#13213d]"}`}
                                >
                                    <Compass className="h-4 w-4" /> {expMode ? "Modo Expedição: ligado" : "Modo Expedição"}
                                </button>
                                {expMode && leagues ? (
                                    <div className="flex flex-1 items-center gap-3">
                                        <span className="text-xs font-medium text-[#9fb4da]">Léguas</span>
                                        <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[#13213d]">
                                            <div className="h-full rounded-full bg-[#5fe3ff] shadow-[0_0_8px_#5fe3ff]" style={{ width: `${Math.round((leagues.available / Math.max(1, leagues.total)) * 100)}%` }} />
                                        </div>
                                        <span className="tabular-nums text-xs text-[#eaf2ff]">{Math.floor(leagues.available)}/{leagues.total}</span>
                                        <span className="hidden font-mono text-[11px] text-[#6f86b4] sm:inline" title="Base diária + fontes (territórios habitados) + bônus de ações reais">
                                            base {leagues.base} · fontes +{leagues.fontes} · bônus +{leagues.bonus}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="text-xs text-[#6f86b4]">Mova o Cartógrafo para dissipar a Bruma. Chegue a um território para revelá-lo.</span>
                                )}
                            </div>
                            <WorldMap
                                state={state}
                                usage={usage}
                                discovered={discovered}
                                realms={realms}
                                world={world}
                                rumors={rumors}
                                justRevealed={atlas.justRevealed}
                                selected={selected}
                                onSelect={setSelected}
                                onExpedition={startExpedition}
                                mode={expMode ? "expedition" : "browse"}
                                expedition={expState}
                                leagues={leagues}
                                onMove={actions.moveCartographer}
                            />
                            <p className="text-xs text-gray-500">
                                {expMode
                                    ? "Clique no mapa para mover o Cartógrafo e dissipar a Bruma (custa léguas; labirinto custa mais, trilhas menos). Marcos dão rumores; chegar a um território o revela."
                                    : "Arraste para navegar, use a roda do mouse ou os botões para aproximar. Clique numa terra hachurada para partir em expedição."}
                            </p>
                        </div>
                    )}
                    {tab === "journal" && (
                        <JournalPanel state={state} discovered={discovered} realms={realms} metrics={metrics} projectedMetrics={projectedMetrics} onSelect={setSelected} onExpedition={startExpedition} />
                    )}
                    {tab === "brazil" && <BrazilPanel state={state} metrics={metrics} onSetBrazil={actions.setBrazil} />}
                    {tab === "achievements" && <AchievementsPanel game={game} />}
                    {tab === "analytics" && <AnalyticsPanel usage={usage} metrics={metrics} />}
                    {tab === "connections" && (
                        <div className="space-y-6">
                            <ConnectorsPanel
                                state={state}
                                discovered={discovered}
                                onConnect={actions.connect}
                                onDisconnect={actions.disconnect}
                                onWriteBack={actions.setWriteBack}
                                onCaravan={actions.setCaravan}
                                onReplaceState={actions.replaceState}
                            />
                            <IntegrationsPanel
                                state={state}
                                onImport={actions.importResult}
                                onSaveManual={(r) => {
                                    actions.saveManual(r);
                                    setTab("world");
                                }}
                                onRemoveSource={actions.removeSource}
                                onDeleteEverything={actions.deleteEverything}
                            />
                        </div>
                    )}
                </div>
            </div>

            {selected && (
                <>
                    <div className="fixed inset-0 z-[110] bg-black/10" onClick={() => setSelected(null)} />
                    <PlaceDrawer
                        placeId={selected}
                        usage={usage}
                        state={state}
                        discovered={discovered}
                        realms={realms}
                        world={world}
                        rumors={rumors}
                        onClose={() => setSelected(null)}
                        onDecide={actions.decide}
                        onSelect={setSelected}
                        onExpedition={startExpedition}
                        onLantern={actions.toggleLantern}
                        onEcho={setEcho}
                    />
                </>
            )}
            {expedition && (
                <ExpeditionDialog
                    placeId={expedition}
                    realmKnown={realms.has(PLACE_BY_ID[expedition].category)}
                    rumor={rumors[expedition]}
                    onDiscover={(id) => actions.discover(id, "expedition")}
                    onEcho={(id) => {
                        setExpedition(null);
                        setEcho(id);
                    }}
                    onClose={() => setExpedition(null)}
                />
            )}
            {echo && <EchoDialog placeId={echo} state={state} onEcho={actions.echo} onClose={() => setEcho(null)} />}

            {/* Avisos (descobertas devolvidas, erros de conectores) */}
            <div className="pointer-events-none fixed bottom-4 left-1/2 z-[150] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
                {atlas.notices.map((n) => (
                    <div key={n.id} className={`pointer-events-auto rounded-lg px-4 py-2.5 text-sm shadow-lg ${n.kind === "error" ? "bg-red-700 text-white" : "bg-[#2b2216] text-[#f3e9d2]"}`}>
                        {n.text}
                        {n.url && <a href={n.url} target="_blank" rel="noreferrer" className="ml-2 underline">ver</a>}
                    </div>
                ))}
            </div>
        </div>
    );
}
