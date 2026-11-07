"use client";

import { useState } from "react";
import { Send, Share2, X } from "lucide-react";
import { PLACE_BY_ID, entryUrl } from "@/app/lib/atlas/catalog";
import {
    BLUESKY_DEFAULT_SERVICE,
    ECHO_TARGETS,
    POST_LIMITS,
    blueskyLogin,
    blueskyPost,
    discoveryPost,
    echoText,
    loadSecret,
    mastodonPost,
    nativeShare,
} from "@/app/lib/atlas/connectors";
import type { AtlasState, ConnectorId } from "@/app/lib/atlas/types";
import { VOCAB } from "@/app/lib/atlas/world";

export function EchoDialog({
    placeId,
    state,
    onEcho,
    onClose,
}: {
    placeId: string;
    state: AtlasState;
    onEcho: (placeId: string, target: string) => void;
    onClose: () => void;
}) {
    const place = PLACE_BY_ID[placeId];
    const [instance, setInstance] = useState(state.connectors.mastodon?.service ?? "");
    const [status, setStatus] = useState<string | null>(null);
    const text = echoText(place);
    const link = entryUrl(place);
    const connected = (Object.keys(state.connectors) as ConnectorId[]).filter((id) => loadSecret(id));

    const open = (id: string) => {
        const t = ECHO_TARGETS.find((x) => x.id === id)!;
        const url = t.url(text, link, { instance });
        if (!url) {
            setStatus("Informe sua instância do Mastodon (ex.: mastodon.social).");
            return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
        onEcho(placeId, id);
        setStatus(`Eco aberto em ${t.name}. Confirme por lá.`);
    };

    const publish = async (id: ConnectorId) => {
        const secret = loadSecret(id);
        if (!secret) return;
        setStatus("Publicando…");
        try {
            const body = discoveryPost(place, POST_LIMITS[id]);
            if (id === "mastodon") await mastodonPost(secret.instance, secret.token, body);
            else {
                const service = secret.service || BLUESKY_DEFAULT_SERVICE;
                await blueskyPost(await blueskyLogin(secret.identifier, secret.appPassword, service), body, service);
            }
            onEcho(placeId, `${id}-api`);
            setStatus(`Publicado no ${id === "mastodon" ? "Mastodon" : "Bluesky"} ✓`);
        } catch (e) {
            setStatus(e instanceof Error ? e.message : "Falha ao publicar.");
        }
    };

    return (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="relative w-full max-w-md rounded-2xl border border-[#1e2c4a] bg-[#070d1c] p-6 text-[#cdd9f0] shadow-[0_0_60px_rgba(0,0,0,0.6)]">
                <button onClick={onClose} className="absolute right-3 top-3 rounded p-1 text-[#8fa6cc] hover:bg-[#13213d]" aria-label="Fechar">
                    <X className="h-4 w-4" />
                </button>
                <h2 className="font-serif text-2xl text-[#eaf2ff]">{VOCAB.share.verb} “{place.name}”</h2>
                <p className="mt-1 text-sm text-[#9fb4da]">{VOCAB.share.description}</p>
                <blockquote className="mt-3 rounded-lg border border-[#1e2c4a] bg-[#0a1430] p-3 text-sm italic text-[#9fb4da]">
                    {text} <span className="not-italic text-[#5fe3ff]">{link}</span>
                </blockquote>

                {connected.length > 0 && (
                    <div className="mt-4">
                        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#5fe3ff]">Publicar direto (conectado)</div>
                        <div className="flex flex-wrap gap-2">
                            {connected.map((id) => (
                                <button key={id} onClick={() => void publish(id)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#5fe3ff] px-3 py-1.5 text-sm font-medium text-[#041018]">
                                    <Send className="h-3.5 w-3.5" /> {id === "mastodon" ? "Mastodon" : "Bluesky"}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-4">
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#6f86b4]">Ecoar em outras terras</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {ECHO_TARGETS.map((t) => (
                            <button key={t.id} onClick={() => open(t.id)} className="rounded-lg border border-[#2e466e] px-3 py-1.5 text-sm text-[#9fb4da] hover:bg-[#13213d]">
                                {t.name}
                            </button>
                        ))}
                    </div>
                    <input
                        value={instance}
                        onChange={(e) => setInstance(e.target.value)}
                        placeholder="Instância Mastodon (ex.: mastodon.social)"
                        className="mt-2 w-full rounded-lg border border-[#2e466e] bg-[#0a1430] px-3 py-1.5 text-sm text-[#cdd9f0] placeholder:text-[#4e6490]"
                    />
                </div>

                <button
                    onClick={async () => {
                        if (await nativeShare(place)) {
                            onEcho(placeId, "native");
                            setStatus("Eco enviado ✓");
                        } else setStatus("Seu navegador não tem folha de compartilhamento nativa.");
                    }}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#2e466e] px-3 py-2 text-sm font-medium text-[#9fb4da] hover:bg-[#13213d]"
                >
                    <Share2 className="h-4 w-4" /> Outros apps do aparelho
                </button>
                {status && <p className="mt-3 text-sm text-[#9fb4da]">{status}</p>}
            </div>
        </div>
    );
}
