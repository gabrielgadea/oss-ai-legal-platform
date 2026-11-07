"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Download, Link2, Upload, UserPlus, X } from "lucide-react";
import { getAtlasProfile, saveAtlasProfile } from "@/app/lib/mikeApi";
import { PLACE_BY_ID } from "@/app/lib/atlas/catalog";
import {
    BLUESKY_DEFAULT_SERVICE,
    INTEGRATIONS,
    POST_LIMITS,
    blueskyLogin,
    blueskyProfile,
    bookmarksHtml,
    discoveryPost,
    downloadFile,
    loadSecret,
    mastodonVerify,
    normalizeInstance,
    passportJson,
    readPassport,
    saveSecret,
} from "@/app/lib/atlas/connectors";
import type { AtlasState, ConnectorId, Inhabitance } from "@/app/lib/atlas/types";
import { VOCAB } from "@/app/lib/atlas/world";
import { Section } from "./ui";

interface Props {
    state: AtlasState;
    discovered: Set<string>;
    onConnect: (id: ConnectorId, meta: { account: string; service: string }, placeId: string, inh: Omit<Inhabitance, "at" | "via">) => void;
    onDisconnect: (id: ConnectorId) => void;
    onWriteBack: (id: ConnectorId, on: boolean) => void;
    onCaravan: (handles: string[]) => Promise<void>;
    onReplaceState: (s: AtlasState) => void;
}

const input = "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm";

function ConnectorCard({
    id,
    title,
    state,
    onDisconnect,
    onWriteBack,
    children,
}: {
    id: ConnectorId;
    title: string;
    state: AtlasState;
    onDisconnect: (id: ConnectorId) => void;
    onWriteBack: (id: ConnectorId, on: boolean) => void;
    children: React.ReactNode;
}) {
    const meta = state.connectors[id];
    const inh = state.inhabit[id];
    const hasSecret = Boolean(loadSecret(id));
    const sample = discoveryPost(PLACE_BY_ID.lichess, POST_LIMITS[id]);
    return (
        <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-gray-900">
                    <ArrowLeftRight className="h-4 w-4" /> {title}
                </div>
                {meta && (
                    <button onClick={() => onDisconnect(id)} className="text-xs text-red-700 hover:underline">Desconectar</button>
                )}
            </div>
            {meta ? (
                <div className="mt-3 space-y-3 text-sm">
                    <div className="text-gray-700">
                        Conectado como <strong>{meta.account}</strong> <span className="text-gray-500">({meta.service})</span>
                        {!hasSecret && <span className="ml-1 text-amber-700">· credencial expirou nesta sessão, reconecte para publicar</span>}
                    </div>
                    {inh && (
                        <div className="rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
                            ← Importado: {inh.posts ?? 0} publicações · acompanha {inh.following ?? 0} · acompanhado por {inh.followers ?? 0}
                        </div>
                    )}
                    <label className="flex items-start gap-2">
                        <input type="checkbox" className="mt-1" checked={Boolean(state.writeBack[id])} onChange={(e) => onWriteBack(id, e.target.checked)} />
                        <span>
                            → <strong>Devolver descobertas automaticamente</strong>: cada território revelado no Atlas vira uma publicação pública aqui.
                        </span>
                    </label>
                    <details className="text-xs text-gray-600">
                        <summary className="cursor-pointer">Prévia da publicação</summary>
                        <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-gray-50 p-2 font-sans">{sample}</pre>
                    </details>
                </div>
            ) : (
                <div className="mt-3">{children}</div>
            )}
        </div>
    );
}

export function ConnectorsPanel({ state, discovered, onConnect, onDisconnect, onWriteBack, onCaravan, onReplaceState }: Props) {
    const [msg, setMsg] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [mInstance, setMInstance] = useState("");
    const [mToken, setMToken] = useState("");
    const [bHandle, setBHandle] = useState("");
    const [bPass, setBPass] = useState("");
    const [bService, setBService] = useState(BLUESKY_DEFAULT_SERVICE);
    const [remember, setRemember] = useState(false);
    const [handle, setHandle] = useState("");
    const [isPublic, setIsPublic] = useState(false);
    const [newLeader, setNewLeader] = useState("");
    const passRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        getAtlasProfile()
            .then(({ profile }) => {
                if (profile) {
                    setHandle(profile.handle);
                    setIsPublic(profile.isPublic);
                }
            })
            .catch(() => {});
    }, []);

    const connectMastodon = async () => {
        setBusy(true);
        setMsg(null);
        try {
            const instance = normalizeInstance(mInstance);
            const acc = await mastodonVerify(instance, mToken.trim());
            saveSecret("mastodon", { instance, token: mToken.trim() }, remember);
            onConnect("mastodon", { account: `@${acc.acct}`, service: instance }, "mastodon", {
                posts: acc.statuses_count,
                followers: acc.followers_count,
                following: acc.following_count,
            });
            setMToken("");
        } catch (e) {
            setMsg(e instanceof Error ? e.message : "Falha ao conectar.");
        }
        setBusy(false);
    };

    const connectBluesky = async () => {
        setBusy(true);
        setMsg(null);
        try {
            const session = await blueskyLogin(bHandle.trim(), bPass.trim(), bService.trim() || BLUESKY_DEFAULT_SERVICE);
            const prof = await blueskyProfile(session.did);
            saveSecret("bluesky", { identifier: session.handle, appPassword: bPass.trim(), service: bService.trim() }, remember);
            onConnect("bluesky", { account: `@${session.handle}`, service: bService.trim() }, "bluesky", {
                posts: prof.postsCount,
                followers: prof.followersCount,
                following: prof.followsCount,
            });
            setBPass("");
        } catch (e) {
            setMsg(e instanceof Error ? e.message : "Falha ao conectar.");
        }
        setBusy(false);
    };

    const saveProfile = async () => {
        try {
            await saveAtlasProfile(handle, isPublic);
            setMsg("Perfil de viajante salvo.");
        } catch (e) {
            setMsg(e instanceof Error ? e.message : "Não foi possível salvar o perfil.");
        }
    };

    return (
        <div className="space-y-6">
            <Section
                title="Pontes com as plataformas"
                subtitle="Mão dupla: ← importa o que você habita (publicações e laços) · → devolve cada território descoberto para a plataforma de origem."
            >
                <div className="grid gap-4 lg:grid-cols-2">
                    <ConnectorCard id="mastodon" title="Mastodon" state={state} onDisconnect={onDisconnect} onWriteBack={onWriteBack}>
                        <div className="space-y-2 text-sm">
                            <input className={input} placeholder="Instância (ex.: mastodon.social)" value={mInstance} onChange={(e) => setMInstance(e.target.value)} />
                            <input className={input} type="password" placeholder="Token de acesso" value={mToken} onChange={(e) => setMToken(e.target.value)} autoComplete="off" />
                            <p className="text-xs text-gray-500">
                                Na sua instância: Preferências → Desenvolvimento → Nova aplicação, com escopos <code>read:accounts</code> e <code>write:statuses</code>. Copie o token de acesso.
                            </p>
                            <button disabled={busy || !mInstance || !mToken} onClick={() => void connectMastodon()} className="rounded-lg bg-gray-900 px-3 py-1.5 text-white disabled:opacity-40">Conectar</button>
                        </div>
                    </ConnectorCard>
                    <ConnectorCard id="bluesky" title="Bluesky" state={state} onDisconnect={onDisconnect} onWriteBack={onWriteBack}>
                        <div className="space-y-2 text-sm">
                            <input className={input} placeholder="Handle (ex.: voce.bsky.social)" value={bHandle} onChange={(e) => setBHandle(e.target.value)} />
                            <input ref={passRef} className={input} type="password" placeholder="Senha de aplicativo (não a sua senha)" value={bPass} onChange={(e) => setBPass(e.target.value)} autoComplete="off" />
                            <input className={input} placeholder="Servidor (PDS)" value={bService} onChange={(e) => setBService(e.target.value)} />
                            <p className="text-xs text-gray-500">Em Configurações → Privacidade e segurança → Senhas de aplicativo. Revogável a qualquer momento.</p>
                            <button disabled={busy || !bHandle || !bPass} onClick={() => void connectBluesky()} className="rounded-lg bg-gray-900 px-3 py-1.5 text-white disabled:opacity-40">Conectar</button>
                        </div>
                    </ConnectorCard>
                </div>
                <label className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    Lembrar credenciais neste dispositivo (sem marcar, ficam só até fechar a aba). Elas nunca são enviadas ao servidor do Atlas.
                </label>
                {msg && <p className="mt-2 text-sm text-gray-700">{msg}</p>}
            </Section>

            <Section title="Levar o mapa para outras plataformas" subtitle="Sem precisar de login: arquivos abertos que qualquer navegador ou app importa.">
                <div className="grid gap-3 sm:grid-cols-3">
                    <button onClick={() => downloadFile("atlas-favoritos.html", bookmarksHtml([...discovered]), "text/html")} disabled={!discovered.size}
                        className="rounded-xl border border-gray-200 p-4 text-left hover:border-gray-400 disabled:opacity-40">
                        <Download className="h-4 w-4" />
                        <div className="mt-2 font-medium">Favoritos por reino</div>
                        <div className="text-xs text-gray-500">.html para Chrome, Firefox, Safari, Edge — {discovered.size} territórios</div>
                    </button>
                    <button onClick={() => downloadFile("atlas-passaporte.json", passportJson(state), "application/json")}
                        className="rounded-xl border border-gray-200 p-4 text-left hover:border-gray-400">
                        <Download className="h-4 w-4" />
                        <div className="mt-2 font-medium">Exportar passaporte</div>
                        <div className="text-xs text-gray-500">Todo o seu Atlas em JSON (portabilidade)</div>
                    </button>
                    <label className="cursor-pointer rounded-xl border border-gray-200 p-4 hover:border-gray-400">
                        <Upload className="h-4 w-4" />
                        <div className="mt-2 font-medium">Importar passaporte</div>
                        <div className="text-xs text-gray-500">Restaura um Atlas exportado</div>
                        <input type="file" accept=".json" className="hidden" onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const s = readPassport(await f.text());
                            if (s) {
                                onReplaceState(s);
                                setMsg("Passaporte restaurado.");
                            } else setMsg("Arquivo não é um passaporte do Atlas.");
                        }} />
                    </label>
                </div>
                <p className="mt-3 text-xs text-gray-500">Para agendar expedições na sua agenda (Google, Apple, Outlook), use “Agendar” dentro de cada expedição.</p>
            </Section>

            <Section title={`Caravanas — o novo "seguir"`} subtitle={VOCAB.follow.description}>
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2 text-sm">
                        <div className="font-medium text-gray-900">Seu passaporte de viajante</div>
                        <input className={input} placeholder="seu_handle" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} />
                        <label className="flex items-start gap-2 text-xs text-gray-600">
                            <input type="checkbox" className="mt-0.5" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                            Compartilhar rumores: quem estiver na sua caravana verá o <em>epíteto</em> (nunca o nome) dos territórios que você revelou.
                        </label>
                        <button onClick={() => void saveProfile()} disabled={handle.length < 3} className="rounded-lg bg-gray-900 px-3 py-1.5 text-white disabled:opacity-40">Salvar</button>
                    </div>
                    <div className="space-y-2 text-sm">
                        <div className="font-medium text-gray-900">{VOCAB.follow.action}</div>
                        <div className="flex gap-2">
                            <input className={input} placeholder="handle de outro viajante" value={newLeader} onChange={(e) => setNewLeader(e.target.value.toLowerCase())} />
                            <button onClick={() => { if (newLeader) { void onCaravan([...state.caravan, newLeader.replace(/^@/, "")]); setNewLeader(""); } }}
                                className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-white">
                                <UserPlus className="h-4 w-4" />
                            </button>
                        </div>
                        <ul className="flex flex-wrap gap-2">
                            {state.caravan.map((h) => (
                                <li key={h} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs">
                                    @{h}
                                    <button onClick={() => void onCaravan(state.caravan.filter((x) => x !== h))} aria-label={`Sair da caravana de ${h}`}><X className="h-3 w-3" /></button>
                                </li>
                            ))}
                            {state.caravan.length === 0 && <li className="text-xs text-gray-500">Você ainda viaja sozinho.</li>}
                        </ul>
                    </div>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-gray-600 sm:grid-cols-3">
                    <div><strong>{VOCAB.follow.verb}</strong> — {VOCAB.follow.description}</div>
                    <div><strong>{VOCAB.like.verb}</strong> — {VOCAB.like.description}</div>
                    <div><strong>{VOCAB.share.verb}</strong> — {VOCAB.share.description}</div>
                </div>
            </Section>

            <Section title="Mapa das integrações" subtitle="O que entra e o que sai, plataforma por plataforma.">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                                <th className="py-2 pr-3 font-medium">Plataforma</th>
                                <th className="py-2 pr-3 font-medium">← Importa</th>
                                <th className="py-2 pr-3 font-medium">→ Devolve</th>
                                <th className="py-2 font-medium">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {INTEGRATIONS.map((i) => (
                                <tr key={i.name} className="border-b border-gray-100 align-top">
                                    <td className="py-2 pr-3 font-medium text-gray-900"><Link2 className="mr-1 inline h-3.5 w-3.5" />{i.name}</td>
                                    <td className="py-2 pr-3 text-gray-600">{i.import}</td>
                                    <td className="py-2 pr-3 text-gray-600">{i.export}</td>
                                    <td className="py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${i.status === "ativo" ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-600"}`}>{i.status}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>
        </div>
    );
}
