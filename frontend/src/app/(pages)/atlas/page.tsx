"use client";

import dynamic from "next/dynamic";

/**
 * O Atlas é local-first (estado no localStorage), então renderiza só no
 * cliente para evitar divergência de hidratação com o HTML do servidor.
 */
const AtlasView = dynamic(
    () => import("@/app/components/atlas/AtlasView").then((m) => m.AtlasView),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
            </div>
        ),
    },
);

export default function AtlasPage() {
    return <AtlasView />;
}
