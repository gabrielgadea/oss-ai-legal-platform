"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, ShieldCheck, Trash2 } from "lucide-react";
import { CATEGORIES, PLACES } from "@/app/lib/atlas/catalog";
import { track } from "@/app/lib/atlas/analytics";
import { IMPORTERS, detectAndParse, manualRecords } from "@/app/lib/atlas/importers";
import { QUALITY_LABELS } from "@/app/lib/atlas/metrics";
import type { AtlasState, ImportResult, UsageRecord } from "@/app/lib/atlas/types";
import { Section } from "./ui";

const MAX_FILE_BYTES = 150 * 1024 * 1024;

/** Integrações via API: o que é (e o que não é) possível hoje. */
const API_ROADMAP = [
    { name: "Spotify Web API", status: "Planejado", note: "Permite ler as últimas faixas tocadas (janela curta) via OAuth." },
    { name: "Tempo de uso (Android) / Tempo de Tela (iOS)", status: "Via CSV", note: "Os sistemas não expõem esses dados a apps web; transcreva pelo CSV." },
    { name: "Extensão de navegador", status: "Planejado", note: "Medição local de tempo por site, sem enviar URLs ao servidor." },
    { name: "Meta, TikTok, X", status: "Via exportação", note: "Sem API pública de histórico de uso; usar o pacote de dados (LGPD, portabilidade)." },
];

export function IntegrationsPanel({
    state,
    onImport,
    onSaveManual,
    onRemoveSource,
    onDeleteEverything,
}: {
    state: AtlasState;
    onImport: (r: ImportResult, fileName: string) => void;
    onSaveManual: (records: UsageRecord[]) => void;
    onRemoveSource: (source: string) => void;
    onDeleteEverything: () => Promise<void>;
}) {
    const initialManual = useMemo(() => {
        const out: Record<string, number> = {};
        for (const r of Object.values(state.records)) {
            if (r.source === "manual") out[r.placeId] = Math.round((r.minutes / 60) * 10) / 10;
        }
        return out;
    }, [state.records]);
    const [hours, setHours] = useState<Record<string, number>>(initialManual);
    const [last, setLast] = useState<{ fileName: string; result?: ImportResult; error?: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        setBusy(true);
        for (const file of Array.from(files)) {
            try {
                if (file.size > MAX_FILE_BYTES) throw new Error("Arquivo muito grande (limite 150 MB).");
                const text = await file.text();
                const result = detectAndParse(file.name, text);
                if (result.records.length === 0) throw new Error("Nenhum lugar do catálogo encontrado neste arquivo.");
                onImport(result, file.name);
                setLast({ fileName: file.name, result });
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Falha ao ler o arquivo.";
                setLast({ fileName: file.name, error: msg });
                track("import_failed");
            }
        }
        setBusy(false);
        if (fileRef.current) fileRef.current.value = "";
    };

    const manualTotal = Object.values(hours).reduce((a, b) => a + (b || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50/60 p-4 text-sm text-green-900">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                    <strong>Seus arquivos não saem do seu dispositivo.</strong> A leitura acontece no navegador;
                    só os totais por lugar (minutos/semana) são guardados — e você pode apagar tudo a qualquer momento.
                </div>
            </div>

            <Section title="Importar dados das plataformas" subtitle="Use o direito de portabilidade (LGPD, art. 18, V): baixe seus dados e traga para o seu mapa.">
                <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        void handleFiles(e.dataTransfer.files);
                    }}
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 p-8 text-center"
                >
                    <FileUp className="h-8 w-8 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-700">Arraste arquivos .json ou .csv aqui</p>
                    <button
                        onClick={() => fileRef.current?.click()}
                        disabled={busy}
                        className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                        {busy ? "Lendo…" : "Escolher arquivos"}
                    </button>
                    <input ref={fileRef} type="file" multiple accept=".json,.csv,application/json,text/csv" className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
                    <p className="mt-2 text-xs text-gray-500">O formato é detectado automaticamente. Extraia o .zip antes de enviar.</p>
                </div>

                {last && (
                    <div className={`mt-4 rounded-lg border p-3 text-sm ${last.error ? "border-red-200 bg-red-50 text-red-800" : "border-gray-200 bg-gray-50 text-gray-800"}`}>
                        <div className="font-medium">{last.fileName}</div>
                        {last.error ? (
                            <div>{last.error}</div>
                        ) : (
                            last.result && (
                                <>
                                    <div>
                                        {last.result.eventsParsed.toLocaleString("pt-BR")} eventos · {last.result.records.length} lugares ·
                                        período de {last.result.periodDays} dias
                                    </div>
                                    {last.result.warnings.map((w) => <div key={w} className="text-xs text-gray-600">• {w}</div>)}
                                    {last.result.unmatched.length > 0 && (
                                        <div className="mt-1 text-xs text-gray-600">
                                            Fora do catálogo (o multiverso é maior!): {last.result.unmatched.slice(0, 8).map((u) => `${u.label} (${u.count})`).join(", ")}
                                        </div>
                                    )}
                                </>
                            )
                        )}
                    </div>
                )}

                <ul className="mt-5 grid gap-3 md:grid-cols-2">
                    {IMPORTERS.map((imp) => {
                        const done = state.imports.find((i) => i.source === imp.source);
                        return (
                            <li key={imp.source} className="rounded-xl border border-gray-200 p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="font-medium text-gray-900">{imp.name}</div>
                                        <div className="text-xs text-gray-500">{imp.platform} · dado {QUALITY_LABELS[imp.quality].toLowerCase()}</div>
                                    </div>
                                    {done && (
                                        <button onClick={() => onRemoveSource(imp.source)} title="Remover dados desta fonte" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                                <p className="mt-2 text-xs leading-relaxed text-gray-600">{imp.howTo}</p>
                                <p className="mt-1 font-mono text-[11px] text-gray-400">{imp.fileHint}</p>
                                {done && (
                                    <p className="mt-2 text-xs font-medium text-green-700">
                                        ✓ {done.fileName} · {done.placesMatched} lugares · {new Date(done.importedAt).toLocaleDateString("pt-BR")}
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </Section>

            <Section
                title="Estimativa rápida"
                subtitle="Sem arquivos? Estime suas horas por semana. Dados medidos ou derivados sempre têm prioridade sobre a estimativa."
                action={
                    <button
                        onClick={() => onSaveManual(manualRecords(hours))}
                        className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
                    >
                        Salvar no mapa ({manualTotal.toFixed(1)} h)
                    </button>
                }
            >
                <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                    {CATEGORIES.map((c) => (
                        <div key={c.id}>
                            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} /> {c.name}
                                <span className="text-xs font-normal text-gray-500">{c.metaphor}</span>
                            </div>
                            <div className="space-y-1.5">
                                {PLACES.filter((p) => p.category === c.id).map((p) => (
                                    <label key={p.id} className="flex items-center gap-3 text-sm">
                                        <span className="w-36 shrink-0 truncate text-gray-700">{p.name}</span>
                                        <input
                                            type="range"
                                            min={0}
                                            max={40}
                                            step={0.5}
                                            value={hours[p.id] ?? 0}
                                            onChange={(e) => setHours((h) => ({ ...h, [p.id]: Number(e.target.value) }))}
                                            className="flex-1 accent-gray-900"
                                            aria-label={`Horas por semana em ${p.name}`}
                                        />
                                        <span className="w-12 text-right tabular-nums text-gray-600">{(hours[p.id] ?? 0).toFixed(1)}h</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="Integrações diretas (API)" subtitle="Transparência sobre o que as plataformas permitem hoje.">
                <ul className="divide-y divide-gray-100 text-sm">
                    {API_ROADMAP.map((r) => (
                        <li key={r.name} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                            <span className="font-medium text-gray-900">{r.name}</span>
                            <span className="text-xs text-gray-600 sm:max-w-md sm:text-right">
                                <span className="mr-2 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">{r.status}</span>
                                {r.note}
                            </span>
                        </li>
                    ))}
                </ul>
            </Section>

            <Section title="Seus dados, suas regras" subtitle="Direito de eliminação (LGPD, art. 18, VI).">
                {confirmDelete ? (
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="text-red-700">Apagar mapa, importações, decisões e contribuições ao mapa do Brasil?</span>
                        <button
                            onClick={async () => {
                                await onDeleteEverything();
                                setHours({});
                                setConfirmDelete(false);
                            }}
                            className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white"
                        >
                            Sim, apagar tudo
                        </button>
                        <button onClick={() => setConfirmDelete(false)} className="rounded-lg border border-gray-300 px-3 py-1.5">Cancelar</button>
                    </div>
                ) : (
                    <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" /> Apagar todos os meus dados do Atlas
                    </button>
                )}
            </Section>
        </div>
    );
}
