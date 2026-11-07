"use client";

import { useEffect, useMemo, useState } from "react";
import { getAtlasBrazil } from "@/app/lib/mikeApi";
import { CATEGORIES, CATEGORY_BY_ID } from "@/app/lib/atlas/catalog";
import {
    BRAZIL_METRICS,
    K_ANONYMITY,
    UFS,
    UF_BY_CODE,
    simulatedAggregates,
    topCategory,
    type BrazilMetric,
    type Region,
    type UFAggregate,
} from "@/app/lib/atlas/brazil";
import type { AtlasMetrics } from "@/app/lib/atlas/metrics";
import type { AtlasState } from "@/app/lib/atlas/types";
import { Section } from "./ui";

const CELL = 74;
const GAP = 6;

/** Rampa sequencial de um só tom (magnitude), clara → escura. */
const RAMP = ["#e3eefb", "#bcd5f3", "#8db6e9", "#5b93dc", "#2a78d6", "#1d5aa6", "#123d73"];

function rampColor(t: number): string {
    const i = Math.max(0, Math.min(RAMP.length - 1, Math.round(t * (RAMP.length - 1))));
    return RAMP[i];
}

export function BrazilPanel({
    state,
    metrics,
    onSetBrazil,
}: {
    state: AtlasState;
    metrics: AtlasMetrics;
    onSetBrazil: (uf: string | undefined, contribute: boolean) => void;
}) {
    const [real, setReal] = useState<UFAggregate[] | null>(null);
    const [realTotal, setRealTotal] = useState(0);
    const [mode, setMode] = useState<"real" | "sim">("sim");
    const [metric, setMetric] = useState<BrazilMetric>("healthyAttention");
    const [selected, setSelected] = useState<string>(state.uf ?? "SP");

    useEffect(() => {
        getAtlasBrazil()
            .then((r) => {
                const aggs = r.aggregates as UFAggregate[];
                setReal(aggs);
                setRealTotal(r.totalParticipants);
                if (aggs.length > 0) setMode("real");
            })
            .catch(() => setReal(null));
    }, []);

    const data = useMemo(() => (mode === "real" ? real ?? [] : simulatedAggregates()), [mode, real]);
    const byUf = new Map(data.map((a) => [a.uf, a]));
    const values = data.map((a) => a[metric]);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    const norm = (v: number) => (max === min ? 0.5 : (v - min) / (max - min));
    const meta = BRAZIL_METRICS[metric];
    const sel = byUf.get(selected);
    const selUf = UF_BY_CODE[selected];

    const cols = Math.max(...UFS.map((u) => u.col)) + 1;
    const rows = Math.max(...UFS.map((u) => u.row)) + 1;
    const width = cols * (CELL + GAP);
    const height = rows * (CELL + GAP);

    const regions = (["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"] as Region[]).map((region) => {
        const list = data.filter((a) => UF_BY_CODE[a.uf]?.region === region);
        const n = list.reduce((s, a) => s + a.participants, 0);
        const avg = n ? list.reduce((s, a) => s + a[metric] * a.participants, 0) / n : null;
        return { region, n, avg };
    });

    return (
        <div className="space-y-6">
            <Section
                title="Mapa geral do Brasil"
                subtitle="Como o país habita o território digital — agregado por UF, só com participação voluntária."
                action={
                    <div className="flex rounded-lg border border-gray-300 p-0.5 text-xs font-medium">
                        <button onClick={() => setMode("real")} className={`rounded-md px-2.5 py-1 ${mode === "real" ? "bg-gray-900 text-white" : "text-gray-700"}`}>
                            Dados reais
                        </button>
                        <button onClick={() => setMode("sim")} className={`rounded-md px-2.5 py-1 ${mode === "sim" ? "bg-gray-900 text-white" : "text-gray-700"}`}>
                            Simulação
                        </button>
                    </div>
                }
            >
                {mode === "sim" ? (
                    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        ⚠ <strong>Dados simulados</strong> para demonstrar a visualização. Não representam nenhuma medição real.
                    </div>
                ) : (
                    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                        {realTotal} participantes nos últimos 28 dias. Cada UF só aparece com ≥ {K_ANONYMITY} participantes (k-anonimato);
                        as demais ficam em branco.
                    </div>
                )}

                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <label className="text-gray-600">Métrica</label>
                    <select value={metric} onChange={(e) => setMetric(e.target.value as BrazilMetric)} className="rounded-lg border border-gray-300 px-2 py-1.5">
                        {(Object.keys(BRAZIL_METRICS) as BrazilMetric[]).map((m) => (
                            <option key={m} value={m}>{BRAZIL_METRICS[m].label}</option>
                        ))}
                    </select>
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div>
                        <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto block h-auto w-full max-w-[560px]" role="img" aria-label={`Cartograma do Brasil: ${meta.label} por UF`}>
                            {UFS.map((u) => {
                                const a = byUf.get(u.code);
                                const t = a ? norm(a[metric]) : 0;
                                const fill = a ? rampColor(t) : "#f3f4f6";
                                const dark = a && t > 0.55;
                                const x = u.col * (CELL + GAP);
                                const y = u.row * (CELL + GAP);
                                const isSel = selected === u.code;
                                return (
                                    <g key={u.code} onClick={() => setSelected(u.code)} className="cursor-pointer">
                                        <title>{`${u.name}: ${a ? `${a[metric]}${meta.unit}` : "dados insuficientes"}`}</title>
                                        <rect x={x} y={y} width={CELL} height={CELL} rx={8} fill={fill} stroke={isSel ? "#111827" : a ? "none" : "#d1d5db"} strokeWidth={isSel ? 2.5 : 1} strokeDasharray={a ? undefined : "3 3"} />
                                        <text x={x + CELL / 2} y={y + CELL / 2 - 4} textAnchor="middle" style={{ fontSize: 16, fontWeight: 700 }} fill={dark ? "#fff" : "#111827"}>
                                            {u.code}
                                        </text>
                                        <text x={x + CELL / 2} y={y + CELL / 2 + 14} textAnchor="middle" style={{ fontSize: 12 }} fill={dark ? "#e5e7eb" : "#4b5563"}>
                                            {a ? `${a[metric]}${meta.unit}` : "—"}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>
                        <div className="mx-auto mt-3 flex max-w-[560px] items-center gap-2 text-xs text-gray-600">
                            <span className="tabular-nums">{min}{meta.unit}</span>
                            <div className="flex h-2 flex-1 overflow-hidden rounded-full">
                                {RAMP.map((c) => <div key={c} className="flex-1" style={{ background: c }} />)}
                            </div>
                            <span className="tabular-nums">{max}{meta.unit}</span>
                        </div>
                        <p className="mx-auto mt-2 max-w-[560px] text-[11px] text-gray-500">
                            Cartograma de blocos: cada UF tem o mesmo tamanho, posições aproximam a geografia.
                            {meta.higherIsBetter ? "" : " Nesta métrica, valores menores tendem a indicar mais equilíbrio."}
                        </p>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                        <div className="text-xs text-gray-500">{selUf?.region}</div>
                        <div className="font-serif text-2xl text-gray-900">{selUf?.name}</div>
                        {sel ? (
                            <>
                                <div className="mt-1 text-xs text-gray-500">{sel.participants} participantes</div>
                                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                    {(Object.keys(BRAZIL_METRICS) as BrazilMetric[]).map((m) => (
                                        <div key={m} className="rounded-lg bg-gray-50 px-2 py-1.5">
                                            <dt className="text-[11px] text-gray-500">{BRAZIL_METRICS[m].label}</dt>
                                            <dd className="font-semibold tabular-nums">{sel[m]}{BRAZIL_METRICS[m].unit}</dd>
                                        </div>
                                    ))}
                                </dl>
                                <div className="mt-4 text-xs font-medium text-gray-700">
                                    Bairro mais habitado: {CATEGORY_BY_ID[topCategory(sel.categoryShare)].name}
                                </div>
                                <div className="mt-2 space-y-1.5">
                                    {CATEGORIES.map((c) => (
                                        <div key={c.id} className="flex items-center gap-2 text-xs">
                                            <span className="w-24 shrink-0 text-gray-600">{c.name}</span>
                                            <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                                                <div className="h-1.5 rounded-full" style={{ width: `${sel.categoryShare[c.id] ?? 0}%`, background: c.color }} />
                                            </div>
                                            <span className="w-8 text-right tabular-nums text-gray-700">{sel.categoryShare[c.id] ?? 0}%</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="mt-3 text-sm text-gray-500">
                                Dados insuficientes: menos de {K_ANONYMITY} participantes nesta UF. Convide pessoas do seu estado.
                            </p>
                        )}
                    </div>
                </div>

                <div className="mt-6 overflow-x-auto">
                    <table className="w-full text-sm">
                        <caption className="mb-2 text-left text-xs font-medium text-gray-500">Resumo por região — {meta.label}</caption>
                        <thead>
                            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                                <th className="py-1.5 font-medium">Região</th>
                                <th className="py-1.5 text-right font-medium">Participantes</th>
                                <th className="py-1.5 text-right font-medium">Média ponderada</th>
                            </tr>
                        </thead>
                        <tbody>
                            {regions.map((r) => (
                                <tr key={r.region} className="border-b border-gray-100">
                                    <td className="py-1.5">{r.region}</td>
                                    <td className="py-1.5 text-right tabular-nums">{r.n}</td>
                                    <td className="py-1.5 text-right tabular-nums">{r.avg === null ? "—" : `${Math.round(r.avg)}${meta.unit}`}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>

            <Section title="Coloque seu ponto no mapa" subtitle="Participação voluntária, revogável a qualquer momento.">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <select
                        value={state.uf ?? ""}
                        onChange={(e) => onSetBrazil(e.target.value || undefined, state.contributeToBrazilMap && Boolean(e.target.value))}
                        className="rounded-lg border border-gray-300 px-2 py-1.5"
                    >
                        <option value="">Selecione sua UF</option>
                        {[...UFS].sort((a, b) => a.name.localeCompare(b.name)).map((u) => (
                            <option key={u.code} value={u.code}>{u.name}</option>
                        ))}
                    </select>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            disabled={!state.uf || metrics.placesUsed === 0}
                            checked={state.contributeToBrazilMap}
                            onChange={(e) => onSetBrazil(state.uf, e.target.checked)}
                        />
                        Contribuir com meus indicadores agregados
                    </label>
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-gray-600">
                    <li>Enviamos só: UF, semana, diversidade, atenção saudável, % aberto, % anúncios, horas/semana e a divisão por bairro — tudo arredondado de 5 em 5.</li>
                    <li>Nunca enviamos quais plataformas você usa, arquivos importados ou horários.</li>
                    <li>O dado é pseudonimizado (vinculado à sua conta só para permitir exclusão). Desmarcar apaga suas contribuições.</li>
                    <li>Base legal: consentimento (LGPD, art. 7º, I), com finalidade específica de estatística agregada.</li>
                </ul>
                {metrics.placesUsed === 0 && <p className="mt-2 text-xs text-amber-700">Registre sua atividade primeiro para poder contribuir.</p>}
            </Section>
        </div>
    );
}
