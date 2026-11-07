"use client";

import { AlertTriangle, CheckCircle2, CircleDot } from "lucide-react";
import { DIMENSION_HELP, DIMENSION_LABELS, TERRAIN_INFO } from "@/app/lib/atlas/scoring";
import type { PlaceScores, ScoreDimension, Terrain } from "@/app/lib/atlas/types";

const TERRAIN_ICON = {
    clareira: CheckCircle2,
    trilha: CircleDot,
    labirinto: AlertTriangle,
} as const;

/** Status sempre com ícone + rótulo (nunca só cor). */
export function TerrainBadge({ terrain, size = "sm" }: { terrain: Terrain; size?: "sm" | "xs" }) {
    const info = TERRAIN_INFO[terrain];
    const Icon = TERRAIN_ICON[terrain];
    return (
        <span
            title={info.description}
            className={`inline-flex items-center gap-1 rounded-full border font-medium ${
                size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"
            }`}
            style={{ color: info.color, borderColor: `${info.color}55`, background: `${info.color}0d` }}
        >
            <Icon className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} />
            {info.label}
        </span>
    );
}

export function StatTile({
    label,
    value,
    hint,
    delta,
}: {
    label: string;
    value: string;
    hint?: string;
    delta?: { value: number; goodWhenPositive: boolean } | null;
}) {
    const showDelta = delta && delta.value !== 0;
    const good = showDelta && (delta.value > 0) === delta.goodWhenPositive;
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4" title={hint}>
            <div className="text-xs font-medium text-gray-500">{label}</div>
            <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums text-gray-900">{value}</span>
                {showDelta && (
                    <span className={`text-xs font-medium ${good ? "text-green-700" : "text-red-700"}`}>
                        {delta.value > 0 ? "▲" : "▼"} {Math.abs(delta.value)} na rota
                    </span>
                )}
            </div>
            {hint && <div className="mt-1 text-xs text-gray-500 line-clamp-2">{hint}</div>}
        </div>
    );
}

export function ScoreBars({ scores }: { scores: PlaceScores }) {
    return (
        <div className="space-y-2">
            {(Object.keys(DIMENSION_LABELS) as ScoreDimension[]).map((d) => (
                <div key={d} title={DIMENSION_HELP[d]}>
                    <div className="flex justify-between text-xs text-gray-600">
                        <span>{DIMENSION_LABELS[d]}</span>
                        <span className="tabular-nums">{scores[d]}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 rounded-full bg-gray-100">
                        <div className="h-1.5 rounded-full bg-gray-800" style={{ width: `${scores[d]}%` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function Section({
    title,
    subtitle,
    children,
    action,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-base font-semibold text-gray-900">{title}</h2>
                    {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
                </div>
                {action}
            </div>
            {children}
        </section>
    );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
    return (
        <div className={`h-1.5 rounded-full bg-gray-100 ${className}`}>
            <div
                className="h-1.5 rounded-full bg-gray-900 transition-all"
                style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }}
            />
        </div>
    );
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
            {children}
        </div>
    );
}
