/**
 * Entrada do mapa — skill `input-systems`: o jogo lê AÇÕES, não teclas.
 *
 * - Teclado por tecla FÍSICA (`KeyboardEvent.code`): WASD fica no mesmo lugar
 *   em AZERTY/Dvorak/ABNT2. Os caracteres "+"/"−" ficam como alternativa para
 *   layouts em que eles moram em outra tecla física.
 * - Combinações com Ctrl/⌘/Alt são do navegador (Ctrl+"+" é o zoom da página):
 *   nunca são sequestradas.
 * - Toque: o gesto de pinça vira zoom em torno do ponto médio dos dedos.
 */

export type MapAction = "panLeft" | "panRight" | "panUp" | "panDown" | "zoomIn" | "zoomOut" | "centerHero";

export const KEY_BINDINGS: Readonly<Record<string, MapAction>> = {
    ArrowLeft: "panLeft",
    KeyA: "panLeft",
    ArrowRight: "panRight",
    KeyD: "panRight",
    ArrowUp: "panUp",
    KeyW: "panUp",
    ArrowDown: "panDown",
    KeyS: "panDown",
    Equal: "zoomIn",
    NumpadAdd: "zoomIn",
    Minus: "zoomOut",
    NumpadSubtract: "zoomOut",
    KeyC: "centerHero",
};

const CHAR_BINDINGS: Readonly<Record<string, MapAction>> = { "+": "zoomIn", "-": "zoomOut", "−": "zoomOut" };

export interface KeyLike {
    code: string;
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
}

/** Ação do mapa para um evento de teclado (ou null: deixa o navegador agir). */
export function actionForKey(e: KeyLike): MapAction | null {
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    return KEY_BINDINGS[e.code] ?? CHAR_BINDINGS[e.key] ?? null;
}

export interface Cam {
    x: number;
    y: number;
    zoom: number;
}

export interface PinchStart {
    dist0: number;
    zoom0: number;
    /** Ponto do MUNDO sob o meio dos dedos no início do gesto (fica preso a eles). */
    anchor: { x: number; y: number };
}

/** Câmera durante a pinça: escala pela razão das distâncias, mantendo a âncora sob os dedos. */
export function pinchCamera(start: PinchStart, dist: number, midScreen: { x: number; y: number }): Cam {
    const zoom = start.zoom0 * (dist / Math.max(1, start.dist0));
    return { zoom, x: start.anchor.x - midScreen.x / zoom, y: start.anchor.y - midScreen.y / zoom };
}
