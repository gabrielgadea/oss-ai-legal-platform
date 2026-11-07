"use client";

import { useEffect, useState } from "react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { getAtlasAnalyticsOverview } from "@/app/lib/mikeApi";
import { sessionCounts } from "@/app/lib/atlas/analytics";
import { CATEGORIES, PLACE_BY_ID } from "@/app/lib/atlas/catalog";
import {
    QUALITY_LABELS,
    dailySeries,
    formatMinutes,
    hourlyProfile,
    type AtlasMetrics,
} from "@/app/lib/atlas/metrics";
import { scoresFor } from "@/app/lib/atlas/scoring";
import type { DataQuality, EffectiveUsage } from "@/app/lib/atlas/types";
import { EmptyHint, Section, StatTile, TerrainBadge } from "./ui";

const AXIS = { fontSize: 11, fill: "#6b7280" };
const QUALITY_COLORS: Record<DataQuality, string> = {
    measured: "#111827",
    derived: "#6b7280",
    "self-reported": "#d1d5db",
};

function ChartTooltip({ active, payload, label, unit = "h" }: { active?: boolean; payload?: { value: number }[]; label?: string; unit?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
            <div className="font-medium text-gray-900">{label}</div>
            <div className="tabular-nums text-gray-700">
                {unit === "min" ? formatMinutes(payload[0].value) : `${payload[0].value} ${unit}`}
            </div>
        </div>
    );
}

export function AnalyticsPanel({ usage, metrics }: { usage: EffectiveUsage[]; metrics: AtlasMetrics }) {
    const [overview, setOverview] = useState<Awaited<ReturnType<typeof getAtlasAnalyticsOverview>> | null>(null);
    useEffect(() => {
        getAtlasAnalyticsOverview().then(setOverview).catch(() => setOverview(null));
    }, []);

    if (usage.length === 0) {
        return <EmptyHint>Sem dados ainda. Vá em <strong>Integrações</strong> para importar ou estimar sua atividade.</EmptyHint>;
    }

    const byCat = CATEGORIES.map((c) => ({
        name: c.name,
        color: c.color,
        hours: Math.round((metrics.byCategory[c.id] / 60) * 10) / 10,
    }));
    const hourly = hourlyProfile(usage);
    const hourData = hourly?.map((m, h) => ({ name: `${h}h`, minutes: Math.round(m) }));
    const daily = dailySeries(usage);
    const maxPlace = usage[0]?.weeklyMinutes || 1;
    const counts = sessionCounts();

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                <StatTile label="Tempo semanal" value={formatMinutes(metrics.totalWeeklyMinutes)} />
                <StatTile label="Atenção saudável" value={String(metrics.healthyAttention)} hint="Saúde média dos lugares, ponderada pelo tempo." />
                <StatTile label="Diversidade" value={String(metrics.diversity)} hint="Entropia entre bairros: 0 = um só, 100 = equilíbrio total." />
                <StatTile label="Top 3 lugares" value={`${metrics.top3Share}%`} hint="Quanto do seu tempo cabe em 3 lugares." />
                <StatTile label="Em lugares abertos" value={`${metrics.openShare}%`} hint="Código aberto ou federados." />
                <StatTile label="Com anúncios" value={`${metrics.adShare}%`} hint="Lugares cujo modelo é publicidade." />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <Section title="Horas por semana em cada bairro">
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={byCat} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                                <CartesianGrid vertical={false} stroke="#f3f4f6" />
                                <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                                <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f9fafb" }} />
                                <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={36}>
                                    {byCat.map((d) => <Cell key={d.name} fill={d.color} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Section>

                <Section title="Lugares mais habitados">
                    <ul className="space-y-2.5">
                        {usage.slice(0, 8).map((u) => {
                            const p = PLACE_BY_ID[u.placeId];
                            const s = scoresFor(u.placeId);
                            return (
                                <li key={u.placeId}>
                                    <div className="flex items-center justify-between gap-2 text-sm">
                                        <span className="flex items-center gap-2 font-medium text-gray-900">
                                            {p.name} <TerrainBadge terrain={s.terrain} size="xs" />
                                        </span>
                                        <span className="tabular-nums text-gray-700">{formatMinutes(u.weeklyMinutes)}</span>
                                    </div>
                                    <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                                        <div className="h-1.5 rounded-full bg-gray-800" style={{ width: `${(u.weeklyMinutes / maxPlace) * 100}%` }} />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </Section>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <Section title="Ao longo do dia" subtitle="Minutos por hora (só dados com horário).">
                    {hourData ? (
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={hourData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                                    <CartesianGrid vertical={false} stroke="#f3f4f6" />
                                    <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} interval={2} />
                                    <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                                    <Tooltip content={<ChartTooltip unit="min" />} cursor={{ fill: "#f9fafb" }} />
                                    <Bar dataKey="minutes" fill="#2a78d6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <EmptyHint>Importe um arquivo com horários (Takeout, Spotify, Netflix) para ver seu ritmo diário.</EmptyHint>
                    )}
                </Section>

                <Section title="Tendência diária" subtitle="Minutos por dia no período importado.">
                    {daily.length > 1 ? (
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                                    <CartesianGrid vertical={false} stroke="#f3f4f6" />
                                    <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
                                    <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                                    <Tooltip content={<ChartTooltip unit="min" />} />
                                    <Line type="monotone" dataKey="minutes" stroke="#2a78d6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <EmptyHint>Precisa de pelo menos 2 dias de dados com data.</EmptyHint>
                    )}
                </Section>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <Section title="Qualidade dos dados" subtitle="Quanto do seu mapa é medido, derivado ou estimado.">
                    <div className="flex h-3 overflow-hidden rounded-full">
                        {(Object.keys(QUALITY_LABELS) as DataQuality[]).map((q) => (
                            <div key={q} style={{ width: `${metrics.qualityShare[q]}%`, background: QUALITY_COLORS[q] }} />
                        ))}
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-4 text-xs text-gray-700">
                        {(Object.keys(QUALITY_LABELS) as DataQuality[]).map((q) => (
                            <li key={q} className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: QUALITY_COLORS[q] }} />
                                {QUALITY_LABELS[q]} <strong className="tabular-nums">{metrics.qualityShare[q]}%</strong>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-3 text-xs text-gray-500">
                        Concentração (HHI entre lugares): <strong className="tabular-nums">{metrics.hhi}</strong> — acima de 2500 indica alta concentração.
                    </p>
                </Section>

                <Section title="Analytics do produto" subtitle="Eventos agregados (sem conteúdo pessoal), últimos 30 dias.">
                    {overview ? (
                        <>
                            <ul className="space-y-1.5 text-sm">
                                {overview.funnel.map((f, i) => {
                                    const top = overview.funnel[0]?.users || 1;
                                    return (
                                        <li key={f.step}>
                                            <div className="flex justify-between text-xs text-gray-600">
                                                <span>{i + 1}. {f.step}</span>
                                                <span className="tabular-nums">{f.users} pessoas</span>
                                            </div>
                                            <div className="mt-0.5 h-1.5 rounded-full bg-gray-100">
                                                <div className="h-1.5 rounded-full bg-gray-800" style={{ width: `${(f.users / top) * 100}%` }} />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    ) : (
                        <p className="text-sm text-gray-500">Backend de analytics indisponível. Eventos desta sessão:</p>
                    )}
                    <p className="mt-3 text-xs text-gray-500">
                        Nesta sessão: {Object.entries(counts).map(([k, v]) => `${k} (${v})`).join(", ") || "nenhum evento"}.
                    </p>
                </Section>
            </div>
        </div>
    );
}
