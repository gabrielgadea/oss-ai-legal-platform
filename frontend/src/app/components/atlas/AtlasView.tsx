"use client";

import { useEffect, useState } from "react";
import { Award, BarChart3, Cloud, CloudOff, Map as MapIcon, Plug, Sparkles, X } from "lucide-react";
import { track } from "@/app/lib/atlas/analytics";
import { formatMinutes } from "@/app/lib/atlas/metrics";
import { AchievementsPanel } from "./AchievementsPanel";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { BrazilPanel } from "./BrazilPanel";
import { IntegrationsPanel } from "./IntegrationsPanel";
import { MultiversePanel } from "./MultiversePanel";
import { PersonalMap } from "./PersonalMap";
import { PlaceDrawer } from "./PlaceDrawer";
import { ProgressBar, StatTile } from "./ui";
import { useAtlas } from "./useAtlas";

type Tab = "map" | "multiverse" | "brazil" | "achievements" | "analytics" | "integrations";

const TABS: { id: Tab; label: string; icon: typeof MapIcon }[] = [
    { id: "map", label: "Meu mapa", icon: MapIcon },
    { id: "multiverse", label: "Multiverso", icon: Sparkles },
    { id: "brazil", label: "Brasil", icon: MapIcon },
    { id: "achievements", label: "Conquistas", icon: Award },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "integrations", label: "Integrações", icon: Plug },
];

export function AtlasView() {
    const atlas = useAtlas();
    const { state, usage, metrics, projectedMetrics, game, actions } = atlas;
    const [tab, setTab] = useState<Tab>("map");
    const [selected, setSelected] = useState<string | null>(null);

    useEffect(() => {
        track("tab_viewed", { tab });
    }, [tab]);

    // Primeira visita sem dados: leva direto para as integrações.
    useEffect(() => {
        if (atlas.loaded && usage.length === 0 && Object.keys(state.explored).length === 0) setTab("integrations");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [atlas.loaded]);

    const badgeNames = game.badges.filter((b) => atlas.newBadges.includes(b.id)).map((b) => b.name);

    return (
        <div className="h-full overflow-y-auto bg-[#fafaf8]">
            <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
                {/* Cabeçalho + progresso */}
                <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h1 className="font-serif text-4xl font-light text-gray-900">Atlas Digital</h1>
                        <p className="mt-1 max-w-xl text-sm text-gray-600">
                            Veja onde sua atenção mora, conheça cada lugar — e decida se fica ou muda de rota.
                            Existem infinitos outros lugares no multiverso digital.
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
                        <span>
                            <Award className="mr-1.5 inline h-4 w-4" />
                            Nova conquista: <strong>{badgeNames.join(", ")}</strong>
                        </span>
                        <button onClick={actions.dismissBadges} aria-label="Fechar" className="rounded p-1 hover:bg-gray-100">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}

                {/* Abas */}
                <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-gray-200" role="tablist">
                    {TABS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            role="tab"
                            aria-selected={tab === id}
                            onClick={() => setTab(id)}
                            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                                tab === id ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
                            }`}
                        >
                            <Icon className="h-4 w-4" /> {label}
                        </button>
                    ))}
                </nav>

                <div className="mt-6">
                    {tab === "map" && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                <StatTile label="Tempo semanal" value={usage.length ? formatMinutes(metrics.totalWeeklyMinutes) : "—"} />
                                <StatTile label="Atenção saudável" value={usage.length ? String(metrics.healthyAttention) : "—"} hint="0–100, ponderado pelo tempo" />
                                <StatTile label="Diversidade" value={usage.length ? String(metrics.diversity) : "—"} hint="Equilíbrio entre bairros" />
                                <StatTile label="Lugares explorados" value={`${metrics.explored}/${metrics.catalogSize}`} hint={`${metrics.categoriesUsed} de 8 bairros com presença`} />
                            </div>
                            <PersonalMap
                                usage={usage}
                                state={state}
                                selected={selected}
                                onSelect={setSelected}
                                onOpenMultiverse={() => setTab("multiverse")}
                            />
                            <p className="text-xs text-gray-500">
                                Clique em qualquer lugar — inclusive os da névoa — para conhecê-lo, ver alternativas e decidir sua rota.
                            </p>
                        </div>
                    )}
                    {tab === "multiverse" && (
                        <MultiversePanel state={state} usage={usage} metrics={metrics} projectedMetrics={projectedMetrics} onSelect={setSelected} />
                    )}
                    {tab === "brazil" && <BrazilPanel state={state} metrics={metrics} onSetBrazil={actions.setBrazil} />}
                    {tab === "achievements" && <AchievementsPanel game={game} />}
                    {tab === "analytics" && <AnalyticsPanel usage={usage} metrics={metrics} />}
                    {tab === "integrations" && (
                        <IntegrationsPanel
                            state={state}
                            onImport={actions.importResult}
                            onSaveManual={(r) => {
                                actions.saveManual(r);
                                setTab("map");
                            }}
                            onRemoveSource={actions.removeSource}
                            onDeleteEverything={actions.deleteEverything}
                        />
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
                        onClose={() => setSelected(null)}
                        onDecide={actions.decide}
                        onToggleExplored={actions.toggleExplored}
                        onSelect={setSelected}
                    />
                </>
            )}
        </div>
    );
}
