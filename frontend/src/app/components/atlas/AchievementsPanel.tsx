"use client";

import { Award, CheckCircle2, Lock, Target } from "lucide-react";
import { LEVELS, XP_RULES, type GameStatus } from "@/app/lib/atlas/gamification";
import { ProgressBar, Section } from "./ui";

export function AchievementsPanel({ game }: { game: GameStatus }) {
    return (
        <div className="space-y-6">
            <Section title="Missões" subtitle="Premiam consciência e exploração — nunca tempo de tela.">
                <ul className="grid gap-3 md:grid-cols-2">
                    {game.missions.map((m) => (
                        <li key={m.id} className={`rounded-xl border p-4 ${m.done ? "border-green-200 bg-green-50/50" : "border-gray-200"}`}>
                            <div className="flex items-start gap-3">
                                {m.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-700" /> : <Target className="mt-0.5 h-5 w-5 text-gray-400" />}
                                <div className="flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-medium text-gray-900">{m.title}</span>
                                        <span className="text-xs text-gray-500">+{XP_RULES.perMission} XP</span>
                                    </div>
                                    <p className="mt-0.5 text-sm text-gray-600">{m.description}</p>
                                    {!m.done && <ProgressBar value={m.progress} className="mt-2" />}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </Section>

            <Section title="Conquistas" subtitle={`${game.badges.filter((b) => b.earned).length} de ${game.badges.length} conquistadas`}>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {game.badges.map((b) => (
                        <li key={b.id} className={`rounded-xl border p-4 ${b.earned ? "border-gray-900" : "border-gray-200 opacity-80"}`}>
                            <div className="flex items-center gap-2">
                                {b.earned ? <Award className="h-5 w-5 text-gray-900" /> : <Lock className="h-4 w-4 text-gray-400" />}
                                <span className={`font-medium ${b.earned ? "text-gray-900" : "text-gray-600"}`}>{b.name}</span>
                            </div>
                            <p className="mt-1 text-xs text-gray-600">{b.description}</p>
                            {!b.earned && <ProgressBar value={b.progress} className="mt-2" />}
                        </li>
                    ))}
                </ul>
            </Section>

            <div className="grid gap-6 md:grid-cols-2">
                <Section title="De onde vem seu XP">
                    <table className="w-full text-sm">
                        <tbody>
                            {game.xpBreakdown.map((x) => (
                                <tr key={x.label} className="border-b border-gray-100">
                                    <td className="py-1.5 text-gray-700">{x.label}</td>
                                    <td className="py-1.5 text-right tabular-nums font-medium">{x.xp}</td>
                                </tr>
                            ))}
                            <tr>
                                <td className="py-1.5 font-semibold">Total</td>
                                <td className="py-1.5 text-right font-semibold tabular-nums">{game.xp}</td>
                            </tr>
                        </tbody>
                    </table>
                </Section>
                <Section title="Jornada">
                    <ol className="space-y-2">
                        {LEVELS.map((l) => {
                            const reached = game.xp >= l.min;
                            return (
                                <li key={l.title} className="flex items-start gap-3">
                                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${reached ? "bg-gray-900" : "border border-gray-300"}`} />
                                    <div>
                                        <div className={`text-sm font-medium ${reached ? "text-gray-900" : "text-gray-500"}`}>
                                            {l.title} <span className="text-xs font-normal text-gray-400">· {l.min} XP</span>
                                        </div>
                                        <div className="text-xs text-gray-500">{l.description}</div>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </Section>
            </div>
        </div>
    );
}
