/**
 * Efeitos sonoros do mapa — skill `audio-design`, sintetizados com WebAudio
 * (sem arquivos de áudio: nada a licenciar, nada a baixar).
 *
 * - Barramentos: cada som → barramento SFX (headroom) → master (volume do
 *   jogador) → limitador de segurança → saída. O volume controla o GRUPO.
 * - Volume perceptual: o slider 0..1 vira ganho s² (com o slider linear quase
 *   nada muda na maior parte do curso).
 * - Variação: ±1 semitom e ±2 dB a cada disparo, para a repetição não soar robótica.
 * - Níveis de importância espelham o game feel: passos (pequeno), baú (médio),
 *   revelação (grande), seleção (interface).
 * - Desligado por padrão; o AudioContext só nasce num gesto do usuário
 *   (política de autoplay dos navegadores).
 */

export type SfxKind = "step" | "chest" | "reveal" | "select";

/** Slider 0..1 → ganho linear (curva quadrática; 0 = silêncio real). */
export function sliderToGain(slider: number): number {
    const s = Math.max(0, Math.min(1, Number.isFinite(slider) ? slider : 0));
    return s * s;
}

/** Ganho linear → dB (para exibição/depuração). */
export function gainToDb(gain: number): number {
    return gain <= 0 ? -Infinity : 20 * Math.log10(gain);
}

/** Variação por disparo: fator de altura (±semitons) e de ganho (±dB). */
export function vary(rand: () => number, semitones = 1, db = 2): { rate: number; gain: number } {
    const st = (rand() * 2 - 1) * semitones;
    const d = (rand() * 2 - 1) * db;
    return { rate: Math.pow(2, st / 12), gain: Math.pow(10, d / 20) };
}

const MAX_VOICES = 12;

class MapSfx {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private bus: GainNode | null = null;
    private noise: AudioBuffer | null = null;
    private volume = 0;
    private voices = 0;

    /** Define o volume (0..1). Com volume > 0 dentro de um gesto, inicializa o áudio. */
    setVolume(slider: number) {
        this.volume = Math.max(0, Math.min(1, slider));
        if (this.master && this.ctx) this.master.gain.setTargetAtTime(sliderToGain(this.volume), this.ctx.currentTime, 0.03);
    }

    /** Chamar em gestos do usuário (clique/toque): cria ou retoma o contexto. */
    unlock() {
        if (this.volume <= 0 || typeof window === "undefined") return;
        if (!this.ctx) {
            const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) return;
            const ctx = new Ctor();
            const limiter = ctx.createDynamicsCompressor(); // rede de segurança, não "o mixer"
            limiter.threshold.value = -6;
            limiter.knee.value = 0;
            limiter.ratio.value = 20;
            limiter.attack.value = 0.003;
            limiter.release.value = 0.25;
            limiter.connect(ctx.destination);
            const master = ctx.createGain();
            master.gain.value = sliderToGain(this.volume);
            master.connect(limiter);
            const bus = ctx.createGain();
            bus.gain.value = 0.7; // headroom do grupo SFX
            bus.connect(master);
            const len = Math.floor(ctx.sampleRate * 0.25);
            const noise = ctx.createBuffer(1, len, ctx.sampleRate);
            const ch = noise.getChannelData(0);
            for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
            Object.assign(this, { ctx, master, bus, noise });
        }
        if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
    }

    play(kind: SfxKind) {
        const ctx = this.ctx;
        if (!ctx || !this.bus || this.volume <= 0 || ctx.state !== "running") return;
        if (this.voices >= MAX_VOICES) return; // teto de polifonia
        const t = ctx.currentTime + 0.005;
        const v = vary(Math.random);
        if (kind === "step") this.hoof(t, v);
        else if (kind === "chest") this.chime(t, v);
        else if (kind === "reveal") this.fanfare(t, v);
        else this.tick(t, v);
    }

    private voice(node: AudioScheduledSourceNode, stopAt: number) {
        this.voices++;
        node.onended = () => {
            this.voices--;
        };
        node.stop(stopAt);
    }

    private env(t: number, peak: number, attack: number, decay: number): GainNode {
        const g = this.ctx!.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
        g.connect(this.bus!);
        return g;
    }

    /** Passo do cavalo: ruído filtrado curto, em par (ta-tum). */
    private hoof(t: number, v: { rate: number; gain: number }) {
        const ctx = this.ctx!;
        for (const [dt, f, peak] of [[0, 420, 0.22], [0.075, 300, 0.16]] as const) {
            const src = ctx.createBufferSource();
            src.buffer = this.noise;
            const bp = ctx.createBiquadFilter();
            bp.type = "bandpass";
            bp.frequency.value = f * v.rate;
            bp.Q.value = 1.4;
            src.connect(bp).connect(this.env(t + dt, peak * v.gain, 0.004, 0.08));
            src.start(t + dt);
            this.voice(src, t + dt + 0.12);
        }
    }

    /** Baú: arpejo maior ascendente, timbre de sino suave. */
    private chime(t: number, v: { rate: number; gain: number }) {
        const ctx = this.ctx!;
        [1046.5, 1318.5, 1568].forEach((f, i) => {
            const o = ctx.createOscillator();
            o.type = "triangle";
            o.frequency.value = f * v.rate;
            o.connect(this.env(t + i * 0.07, 0.16 * v.gain, 0.005, 0.45));
            o.start(t + i * 0.07);
            this.voice(o, t + i * 0.07 + 0.5);
        });
    }

    /** Revelação: acorde que abre (filtro varrendo) + brilho agudo. */
    private fanfare(t: number, v: { rate: number; gain: number }) {
        const ctx = this.ctx!;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(500, t);
        lp.frequency.exponentialRampToValueAtTime(3200, t + 0.6);
        lp.connect(this.env(t, 0.22 * v.gain, 0.12, 1.3));
        for (const f of [261.6, 329.6, 392, 523.3]) {
            const o = ctx.createOscillator();
            o.type = "sawtooth";
            o.frequency.value = f * v.rate;
            o.connect(lp);
            o.start(t);
            this.voice(o, t + 1.5);
        }
        const sh = ctx.createBufferSource();
        sh.buffer = this.noise;
        sh.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 6000;
        sh.connect(hp).connect(this.env(t + 0.05, 0.05 * v.gain, 0.2, 0.9));
        sh.start(t + 0.05);
        this.voice(sh, t + 1.2);
    }

    /** Seleção na interface: clique curto e discreto. */
    private tick(t: number, v: { rate: number; gain: number }) {
        const o = this.ctx!.createOscillator();
        o.type = "square";
        o.frequency.value = 1400 * v.rate;
        o.connect(this.env(t, 0.05 * v.gain, 0.002, 0.03));
        o.start(t);
        this.voice(o, t + 0.05);
    }
}

/** Instância única do mapa (não toca em `window` até o primeiro gesto). */
export const mapSfx = new MapSfx();
