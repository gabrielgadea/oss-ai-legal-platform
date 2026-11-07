"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Maximize2, Minus, Plus } from "lucide-react";
import type { AtlasWorldStats } from "@/app/lib/mikeApi";
import { CONTENT_VOLUME_LABELS, PLACES, PLACE_BY_ID, POPULATION_LABELS } from "@/app/lib/atlas/catalog";
import { formatMinutes } from "@/app/lib/atlas/metrics";
import { scoresFor, TERRAIN_INFO } from "@/app/lib/atlas/scoring";
import { FOG_CELL, generateMarks, planRoute, type Budget, type MoveResult } from "@/app/lib/atlas/expedition";
import { actionForKey, pinchCamera, type PinchStart } from "@/app/lib/atlas/input";
import { mapSfx } from "@/app/lib/atlas/sfx";
import {
    BIOME_STYLE,
    REALM_BIOME,
    fbm,
    generateAdventure,
    quadPoint,
    valueNoise,
    type Decoration,
} from "@/app/lib/atlas/adventure";
import type { AtlasState, CategoryId, EffectiveUsage, ExpeditionState } from "@/app/lib/atlas/types";
import { REALMS, REALM_BY_ID, WORLD_H, WORLD_W, contentVolumeOf, epithet, type Pt, type Territory } from "@/app/lib/atlas/world";

// ───────────────────────────────────────────────────────────────────────────
// Pincéis (arte procedural original)
// ───────────────────────────────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D;

function shade(hex: string, amt: number): string {
    const n = parseInt(hex.slice(1), 16);
    const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt))));
    const r = f((n >> 16) & 255);
    const g = f((n >> 8) & 255);
    const b = f(n & 255);
    return `rgb(${r},${g},${b})`;
}

function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0.28) {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
}

function blob(ctx: Ctx, x: number, y: number, r: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
}

const TREE_GREENS = ["#3f8a2c", "#4b9a33", "#367a26", "#55a03a"];
const AUTUMN = ["#e08a2a", "#c9452a", "#e8b830", "#b5652a", "#d66b2a", "#9a7a2a"];

function drawTree(ctx: Ctx, d: Decoration, mid: string) {
    const { x, y, s } = d;
    shadow(ctx, x + s * 0.2, y + 1, s * 0.8, s * 0.3);
    ctx.fillStyle = "#5a3b1e";
    ctx.fillRect(x - s * 0.12, y - s * 0.6, s * 0.24, s * 0.6);
    const cy = y - s * 1.0;
    const dark = shade(mid, -0.35);
    blob(ctx, x - s * 0.38, cy + s * 0.15, s * 0.5, dark);
    blob(ctx, x + s * 0.38, cy + s * 0.15, s * 0.5, dark);
    blob(ctx, x, cy - s * 0.12, s * 0.6, mid);
    blob(ctx, x - s * 0.18, cy - s * 0.3, s * 0.26, shade(mid, 0.3));
}

function drawPine(ctx: Ctx, d: Decoration, snowy: boolean) {
    const { x, y, s } = d;
    shadow(ctx, x + s * 0.2, y + 1, s * 0.6, s * 0.22);
    ctx.fillStyle = "#4a321a";
    ctx.fillRect(x - s * 0.08, y - s * 0.35, s * 0.16, s * 0.35);
    for (let i = 0; i < 3; i++) {
        const w = s * (0.85 - i * 0.2);
        const by = y - s * 0.3 - i * s * 0.55;
        const ty = by - s * 0.8;
        ctx.fillStyle = "#24503a";
        ctx.beginPath();
        ctx.moveTo(x - w, by);
        ctx.lineTo(x, ty);
        ctx.lineTo(x + w, by);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#33694b";
        ctx.beginPath();
        ctx.moveTo(x - w, by);
        ctx.lineTo(x, ty);
        ctx.lineTo(x, by);
        ctx.closePath();
        ctx.fill();
        if (snowy) {
            ctx.fillStyle = "rgba(245,250,255,0.9)";
            ctx.beginPath();
            ctx.moveTo(x - w * 0.35, ty + s * 0.3);
            ctx.lineTo(x, ty);
            ctx.lineTo(x + w * 0.35, ty + s * 0.3);
            ctx.closePath();
            ctx.fill();
        }
    }
}

function drawPalm(ctx: Ctx, d: Decoration) {
    const { x, y, s } = d;
    shadow(ctx, x + s * 0.5, y + 1, s * 0.8, s * 0.25);
    const tx = x + s * 0.35;
    const ty = y - s * 1.7;
    ctx.strokeStyle = "#8a6a3a";
    ctx.lineWidth = s * 0.22;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - s * 0.1, y - s * 0.9, tx, ty);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + d.v;
        ctx.fillStyle = i % 2 ? "#3f9a3a" : "#2c7a2c";
        ctx.beginPath();
        ctx.ellipse(tx + Math.cos(a) * s * 0.55, ty + Math.sin(a) * s * 0.3, s * 0.6, s * 0.18, a, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawMountain(ctx: Ctx, d: Decoration, light: string, dark: string, snow: boolean) {
    const { x, y, s } = d;
    const w = s * 2.4;
    const h = s * 2.0;
    shadow(ctx, x + s * 0.4, y + 1, w * 0.55, s * 0.4, 0.3);
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x - s * 0.05, y - h);
    ctx.lineTo(x + s * 0.15, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.05, y - h);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + s * 0.15, y);
    ctx.closePath();
    ctx.fill();
    // ravinas
    ctx.strokeStyle = shade(dark, -0.25);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.05, y - h);
    ctx.lineTo(x - s * 0.35, y - h * 0.45);
    ctx.moveTo(x + s * 0.3, y - h * 0.55);
    ctx.lineTo(x + s * 0.55, y - h * 0.15);
    ctx.stroke();
    if (snow) {
        ctx.fillStyle = "#f4f8fb";
        ctx.beginPath();
        ctx.moveTo(x - w * 0.17, y - h * 0.62);
        ctx.lineTo(x - s * 0.05, y - h);
        ctx.lineTo(x + w * 0.19, y - h * 0.6);
        ctx.lineTo(x + w * 0.05, y - h * 0.68);
        ctx.lineTo(x - w * 0.05, y - h * 0.57);
        ctx.closePath();
        ctx.fill();
    }
    ctx.strokeStyle = "rgba(40,32,24,0.7)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x - s * 0.05, y - h);
    ctx.lineTo(x + w / 2, y);
    ctx.stroke();
}

function drawRock(ctx: Ctx, d: Decoration) {
    const { x, y, s, v } = d;
    shadow(ctx, x + 1, y + 1, s * 1.1, s * 0.4, 0.25);
    const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + v;
        const rr = s * (0.75 + ((i * 37 + Math.floor(v * 100)) % 5) * 0.08);
        return { x: x + Math.cos(a) * rr * 1.2, y: y - s * 0.4 + Math.sin(a) * rr * 0.8 };
    });
    ctx.fillStyle = "#8d8a84";
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#615e58";
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.4);
    ctx.lineTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(40,36,32,0.6)";
    ctx.lineWidth = 0.6;
    ctx.stroke();
}

function drawDecoration(ctx: Ctx, d: Decoration) {
    const biome = REALM_BIOME[d.realm];
    const style = BIOME_STYLE[biome];
    switch (d.kind) {
        case "tree":
            drawTree(ctx, d, biome === "jungle" ? shade(TREE_GREENS[Math.floor(d.v * 4)], -0.25) : TREE_GREENS[Math.floor(d.v * 4)]);
            break;
        case "autumnTree":
            drawTree(ctx, d, AUTUMN[Math.floor(d.v * AUTUMN.length)]);
            break;
        case "pine":
            drawPine(ctx, d, biome === "tundra");
            break;
        case "palm":
            drawPalm(ctx, d);
            break;
        case "mountain":
            drawMountain(ctx, d, "#a39784", "#655b4b", false);
            break;
        case "snowMountain":
            drawMountain(ctx, d, "#aab4bd", "#6d7782", true);
            break;
        case "hill": {
            const { x, y, s } = d;
            ctx.fillStyle = style.groundDark;
            ctx.beginPath();
            ctx.ellipse(x, y, s * 1.5, s * 0.9, 0, Math.PI, 0);
            ctx.fill();
            ctx.fillStyle = style.groundLight;
            ctx.beginPath();
            ctx.ellipse(x - s * 0.35, y - s * 0.45, s * 0.6, s * 0.25, -0.3, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case "rock":
            drawRock(ctx, d);
            break;
        case "cactus": {
            const { x, y, s } = d;
            shadow(ctx, x + 2, y + 1, s * 0.5, s * 0.2);
            ctx.fillStyle = "#4f8f3a";
            ctx.fillRect(x - s * 0.18, y - s * 1.5, s * 0.36, s * 1.5);
            ctx.fillRect(x - s * 0.6, y - s * 1.0, s * 0.42, s * 0.2);
            ctx.fillRect(x - s * 0.6, y - s * 1.35, s * 0.18, s * 0.45);
            ctx.fillRect(x + s * 0.18, y - s * 0.8, s * 0.42, s * 0.2);
            ctx.fillRect(x + s * 0.42, y - s * 1.15, s * 0.18, s * 0.45);
            ctx.fillStyle = "#6fb04f";
            ctx.fillRect(x - s * 0.18, y - s * 1.5, s * 0.1, s * 1.5);
            break;
        }
        case "dune": {
            const { x, y, s } = d;
            ctx.strokeStyle = style.groundLight;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(x, y, s * 1.4, s * 0.5, 0, Math.PI * 1.1, Math.PI * 1.9);
            ctx.stroke();
            ctx.strokeStyle = style.groundDark;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(x + 2, y + 2, s * 1.4, s * 0.5, 0, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
            break;
        }
        case "flower": {
            const cols = ["#f2e14c", "#f07ab0", "#ffffff", "#e55b4b"];
            for (let i = 0; i < 3; i++) blob(ctx, d.x + (i - 1) * 3, d.y - (i % 2) * 2, 1.2, cols[(Math.floor(d.v * 4) + i) % 4]);
            break;
        }
        case "mushroom": {
            const { x, y, s } = d;
            ctx.fillStyle = "#efe6d2";
            ctx.fillRect(x - s * 0.12, y - s * 0.5, s * 0.24, s * 0.5);
            ctx.fillStyle = "#c8352a";
            ctx.beginPath();
            ctx.ellipse(x, y - s * 0.5, s * 0.5, s * 0.35, 0, Math.PI, 0);
            ctx.fill();
            blob(ctx, x - s * 0.18, y - s * 0.65, s * 0.08, "#fff");
            blob(ctx, x + s * 0.15, y - s * 0.7, s * 0.07, "#fff");
            break;
        }
        case "bush": {
            const { x, y, s } = d;
            shadow(ctx, x + 1, y + 1, s * 0.7, s * 0.22);
            blob(ctx, x - s * 0.3, y - s * 0.3, s * 0.4, "#2f6a24");
            blob(ctx, x + s * 0.3, y - s * 0.3, s * 0.4, "#2f6a24");
            blob(ctx, x, y - s * 0.5, s * 0.45, "#3f8a2c");
            break;
        }
    }
}

/** Pinta todo o terreno estático (mar, ilhas, praias, textura, estradas, decorações). */
function renderTerrain(canvas: HTMLCanvasElement, scale: number) {
    const { world, roads, decorations } = generateAdventure();
    canvas.width = WORLD_W * scale;
    canvas.height = WORLD_H * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);

    // Mar
    const sea = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    sea.addColorStop(0, "#1c4a73");
    sea.addColorStop(1, "#235f8a");
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    const r = rng(9001);
    ctx.lineWidth = 1;
    for (let i = 0; i < 1100; i++) {
        const x = r() * WORLD_W;
        const y = r() * WORLD_H;
        ctx.strokeStyle = `rgba(190,225,255,${0.06 + r() * 0.14})`;
        ctx.beginPath();
        ctx.arc(x, y, 4 + r() * 5, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
    }

    for (const isl of world.islands) {
        const style = BIOME_STYLE[REALM_BIOME[isl.realm]];
        const land = new Path2D(isl.path);
        const shore = new Path2D(isl.shore);
        // águas rasas
        ctx.fillStyle = "rgba(70,150,180,0.55)";
        ctx.fill(shore);
        ctx.strokeStyle = "rgba(120,190,210,0.35)";
        ctx.lineWidth = 10;
        ctx.stroke(shore);
        // praia
        ctx.strokeStyle = REALM_BIOME[isl.realm] === "tundra" ? "#c9d3d9" : "#e3c98a";
        ctx.lineWidth = 13;
        ctx.lineJoin = "round";
        ctx.stroke(land);
        // terra
        ctx.fillStyle = style.ground;
        ctx.fill(land);
        // textura
        ctx.save();
        ctx.clip(land);
        const realm = REALM_BY_ID[isl.realm];
        const tr = rng(realm.center.x * 31 + realm.center.y);
        // relevo do chão por fBm: manchas contínuas claras/escuras (procedural-gen)
        const tex = valueNoise(Math.round(realm.center.x * 7 + realm.center.y * 13));
        const R = realm.radius * 1.2;
        for (let gx = realm.center.x - R; gx < realm.center.x + R; gx += 9) {
            for (let gy = realm.center.y - R; gy < realm.center.y + R; gy += 9) {
                const n = fbm(tex, gx / 60, gy / 60, 4);
                if (n > 0.56) {
                    ctx.globalAlpha = Math.min(0.5, (n - 0.56) * 2.4);
                    ctx.fillStyle = style.groundLight;
                } else if (n < 0.44) {
                    ctx.globalAlpha = Math.min(0.5, (0.44 - n) * 2.4);
                    ctx.fillStyle = style.groundDark;
                } else continue;
                ctx.beginPath();
                ctx.arc(gx, gy, 7, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        for (let i = 0; i < 1500; i++) {
            const px = realm.center.x + (tr() * 2 - 1) * realm.radius * 1.15;
            const py = realm.center.y + (tr() * 2 - 1) * realm.radius * 1.15;
            ctx.strokeStyle = tr() > 0.5 ? style.groundDark : style.groundLight;
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + (tr() - 0.5) * 2, py - 2 - tr() * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.strokeStyle = "rgba(60,44,24,0.35)";
        ctx.lineWidth = 1.5;
        ctx.stroke(land);
    }

    // Estradas de terra
    for (const road of roads) {
        const path = new Path2D();
        path.moveTo(road.from.x, road.from.y);
        path.quadraticCurveTo(road.ctrl.x, road.ctrl.y, road.to.x, road.to.y);
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(90,62,30,0.9)";
        ctx.lineWidth = 8;
        ctx.stroke(path);
        ctx.strokeStyle = "#b8925a";
        ctx.lineWidth = 5;
        ctx.stroke(path);
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = "rgba(240,222,182,0.6)";
        ctx.lineWidth = 1.5;
        ctx.stroke(path);
        ctx.setLineDash([]);
    }
    // marcos de pedra ao longo das estradas
    for (const road of roads) {
        const p = quadPoint(road, 0.5);
        blob(ctx, p.x + 6, p.y + 4, 1.6, "#8b8478");
    }

    for (const d of decorations) drawDecoration(ctx, d);
}

/** Névoa preta estrelada, recortada onde já se explorou. */
function renderFog(canvas: HTMLCanvasElement, lifted: string[], discoveredTowns: Territory[]) {
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#05060d";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    const r = rng(777);
    for (let i = 0; i < 900; i++) {
        const big = r() > 0.94;
        ctx.fillStyle = `rgba(${200 + r() * 55},${210 + r() * 45},255,${0.25 + r() * 0.7})`;
        ctx.beginPath();
        ctx.arc(r() * WORLD_W, r() * WORLD_H, big ? 1.4 : 0.7, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalCompositeOperation = "destination-out";
    const hole = (x: number, y: number, R: number) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(0.55, "rgba(0,0,0,1)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - R, y - R, R * 2, R * 2);
    };
    for (const k of lifted) {
        const [c, rr] = k.split(",").map(Number);
        hole(c * FOG_CELL + FOG_CELL / 2, rr * FOG_CELL + FOG_CELL / 2, FOG_CELL * 1.25);
    }
    for (const t of discoveredTowns) hole(t.center.x, t.center.y, t.radius + 75);
    ctx.globalCompositeOperation = "source-over";
}

// ── Objetos dinâmicos ───────────────────────────────────────────────────────

function drawHouse(ctx: Ctx, x: number, y: number, s: number) {
    shadow(ctx, x + 1, y + 1, 6 * s, 2 * s, 0.25);
    ctx.fillStyle = "#e2d2ac";
    ctx.fillRect(x - 5 * s, y - 6 * s, 10 * s, 6 * s);
    ctx.fillStyle = "#a8432c";
    ctx.beginPath();
    ctx.moveTo(x - 6.5 * s, y - 6 * s);
    ctx.lineTo(x, y - 11 * s);
    ctx.lineTo(x + 6.5 * s, y - 6 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#3b2a1a";
    ctx.fillRect(x - 1.2 * s, y - 3.5 * s, 2.4 * s, 3.5 * s);
    ctx.strokeStyle = "rgba(50,36,22,0.7)";
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x - 5 * s, y - 6 * s, 10 * s, 6 * s);
}

function drawCastle(ctx: Ctx, x: number, y: number, s: number, roof: string, flag: string, star: boolean) {
    const W = 34 * s;
    const H = 15 * s;
    shadow(ctx, x + 3 * s, y + 1, W * 0.62, 5 * s, 0.32);
    const stone = "#d3cbb9";
    const stoneDark = "#9f9684";
    const outline = "rgba(55,46,36,0.85)";
    // muralha
    ctx.fillStyle = stone;
    ctx.fillRect(x - W / 2, y - H, W, H);
    ctx.fillStyle = stoneDark;
    ctx.fillRect(x - W / 2, y - 3 * s, W, 3 * s);
    for (let i = 0; i < 7; i++) ctx.fillRect(x - W / 2 + i * (W / 7) + s, y - H - 3 * s, W / 14, 3 * s);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x - W / 2, y - H, W, H);
    // torres laterais
    for (const side of [-1, 1]) {
        const tx = x + side * (W / 2) - 4.5 * s;
        const th = H + 13 * s;
        ctx.fillStyle = stone;
        ctx.fillRect(tx, y - th, 9 * s, th);
        ctx.fillStyle = stoneDark;
        ctx.fillRect(tx + 6 * s, y - th, 3 * s, th);
        ctx.strokeRect(tx, y - th, 9 * s, th);
        ctx.fillStyle = roof;
        ctx.beginPath();
        ctx.moveTo(tx - 1.5 * s, y - th);
        ctx.lineTo(tx + 4.5 * s, y - th - 10 * s);
        ctx.lineTo(tx + 10.5 * s, y - th);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#2b2016";
        ctx.fillRect(tx + 3.5 * s, y - th + 4 * s, 2 * s, 3 * s);
    }
    // torre de menagem
    const kh = H + 20 * s;
    ctx.fillStyle = "#e0d9c9";
    ctx.fillRect(x - 7 * s, y - kh, 14 * s, kh - 2 * s);
    ctx.fillStyle = stoneDark;
    ctx.fillRect(x + 3 * s, y - kh, 4 * s, kh - 2 * s);
    ctx.strokeRect(x - 7 * s, y - kh, 14 * s, kh - 2 * s);
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(x - 9 * s, y - kh);
    ctx.lineTo(x, y - kh - 14 * s);
    ctx.lineTo(x + 9 * s, y - kh);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = shade(roof, 0.25);
    ctx.beginPath();
    ctx.moveTo(x - 9 * s, y - kh);
    ctx.lineTo(x, y - kh - 14 * s);
    ctx.lineTo(x - 2 * s, y - kh);
    ctx.closePath();
    ctx.fill();
    // portão
    ctx.fillStyle = "#3b2a1a";
    ctx.beginPath();
    ctx.moveTo(x - 4 * s, y);
    ctx.lineTo(x - 4 * s, y - 6 * s);
    ctx.arc(x, y - 6 * s, 4 * s, Math.PI, 0);
    ctx.lineTo(x + 4 * s, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#2b2016";
    ctx.fillRect(x - 1 * s, y - kh + 6 * s, 2 * s, 4 * s);
    // estandarte
    const py = y - kh - 14 * s;
    ctx.strokeStyle = "#3a2c1e";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x, py - 12 * s);
    ctx.stroke();
    ctx.fillStyle = flag;
    ctx.beginPath();
    ctx.moveTo(x, py - 12 * s);
    ctx.lineTo(x + 11 * s, py - 9 * s);
    ctx.lineTo(x, py - 6 * s);
    ctx.closePath();
    ctx.fill();
    if (star) blob(ctx, x + 4 * s, py - 9 * s, 1.4 * s, "#ffe27a");
}

function drawRuin(ctx: Ctx, x: number, y: number, s: number, rumor: boolean) {
    ctx.fillStyle = "rgba(120,104,80,0.55)";
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 20 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    const cols = [-11, -3, 6, 13];
    cols.forEach((cx, i) => {
        const h = (i % 2 ? 9 : 15) * s;
        ctx.fillStyle = "#b8b1a2";
        ctx.fillRect(x + cx * s - 2 * s, y - h, 4 * s, h);
        ctx.fillStyle = "#7f786b";
        ctx.fillRect(x + cx * s + 0.8 * s, y - h, 1.2 * s, h);
    });
    ctx.fillStyle = "#9a9384";
    ctx.fillRect(x - 13 * s, y - 16 * s, 12 * s, 2.5 * s);
    ctx.font = `bold ${14 * s}px ui-serif, Georgia, serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText("?", x, y - 20 * s);
    ctx.fillStyle = rumor ? "#c9a6ff" : "#ffd36b";
    ctx.fillText("?", x, y - 20 * s);
}

function drawChest(ctx: Ctx, x: number, y: number) {
    shadow(ctx, x + 1, y + 1, 8, 2.5);
    ctx.fillStyle = "#8a5a2a";
    ctx.fillRect(x - 6, y - 7, 12, 7);
    ctx.fillStyle = "#6b4220";
    ctx.fillRect(x - 6.5, y - 10, 13, 4);
    ctx.fillStyle = "#e7c14a";
    ctx.fillRect(x - 6, y - 6.5, 12, 1.2);
    ctx.fillRect(x - 0.8, y - 9, 1.6, 4);
    ctx.strokeStyle = "rgba(40,24,10,0.8)";
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x - 6, y - 7, 12, 7);
    blob(ctx, x + 5, y - 12, 1.1, "rgba(255,250,200,0.9)");
}

function drawHero(ctx: Ctx, x: number, y: number) {
    shadow(ctx, x + 2, y + 1, 11, 3.5, 0.35);
    // montaria
    ctx.fillStyle = "#7a4e2a";
    ctx.beginPath();
    ctx.ellipse(x, y - 6, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#4a2e16";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const lx of [-6, -3, 3, 6]) {
        ctx.moveTo(x + lx, y - 3);
        ctx.lineTo(x + lx, y + 1);
    }
    ctx.stroke();
    ctx.fillStyle = "#7a4e2a";
    ctx.beginPath();
    ctx.ellipse(x + 9, y - 10, 3, 2.2, -0.6, 0, Math.PI * 2);
    ctx.fill();
    // cavaleiro
    ctx.fillStyle = "#2c5fd6";
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 8);
    ctx.lineTo(x + 3, y - 8);
    ctx.lineTo(x + 1, y - 18);
    ctx.lineTo(x - 3, y - 18);
    ctx.closePath();
    ctx.fill();
    blob(ctx, x - 1, y - 21, 3, "#f0c8a0");
    ctx.fillStyle = "#9aa6b8";
    ctx.beginPath();
    ctx.arc(x - 1, y - 22, 3.2, Math.PI, 0);
    ctx.fill();
    // estandarte
    ctx.strokeStyle = "#3a2c1e";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 8);
    ctx.lineTo(x - 5, y - 34);
    ctx.stroke();
    ctx.fillStyle = "#d8342a";
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 34);
    ctx.lineTo(x + 8, y - 30);
    ctx.lineTo(x - 5, y - 26);
    ctx.closePath();
    ctx.fill();
}

function label(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, italic = false) {
    ctx.font = `${italic ? "italic " : "bold "}${size}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(10,8,6,0.85)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
}

// ───────────────────────────────────────────────────────────────────────────
// Game feel (juice) e câmera — skills `game-feel` e `camera-systems`
// ───────────────────────────────────────────────────────────────────────────

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
/** Overshoot para o "pop" (passa de 1 e assenta). */
const easeOutBack = (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Níveis de importância: feedback proporcional ao evento (nunca o mesmo para tudo). */
const TIER = {
    small: { trauma: 0, dur: 480 }, // chegada do Cartógrafo
    medium: { trauma: 0.3, dur: 800 }, // baú coletado
    large: { trauma: 0.55, dur: 1100 }, // território revelado
} as const;

const HERO_SPEED = 300; // px de mundo por segundo
const CAM_RATE = 6.5; // seguimento exponencial: 1 - exp(-rate·dt), independente de FPS
const DEADZONE = { x: 0.16, y: 0.14 }; // fração da área visível
const LOOK_AHEAD = 55; // px de mundo à frente do movimento
const SHAKE_MAX = { x: 9, y: 6 }; // px de tela
const TRAUMA_DECAY = 1.5; // trauma perdido por segundo
const POP_MS = 520;

interface Fx {
    kind: "dust" | "gold" | "reveal";
    x: number;
    y: number;
    r: number;
    t0: number;
    dur: number;
    seed: number;
}

interface HeroAnim {
    /** Polilinha percorrida (rota pelo terreno) e comprimentos acumulados. */
    path: Pt[];
    cum: number[];
    to: Pt;
    t0: number;
    dur: number;
    onArrive: (() => void)[];
}

/** Ponto e direção a uma distância `s` ao longo da polilinha. */
function alongPath(path: Pt[], cum: number[], s: number): { p: Pt; dir: Pt } {
    let k = 1;
    while (k < path.length - 1 && cum[k] < s) k++;
    const a = path[k - 1], b = path[k] ?? a;
    const seg = cum[k] - cum[k - 1] || 1;
    const t = Math.max(0, Math.min(1, (s - cum[k - 1]) / seg));
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, dir: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } };
}

function drawFx(ctx: Ctx, f: Fx, now: number) {
    const e = Math.min(1, (now - f.t0) / f.dur);
    const r = rng(f.seed);
    if (f.kind === "dust") {
        for (let i = 0; i < 7; i++) {
            const a = r() * Math.PI * 2;
            const d = 4 + 14 * easeOutCubic(e) * (0.6 + r() * 0.6);
            ctx.fillStyle = `rgba(214,190,150,${0.55 * (1 - e)})`;
            ctx.beginPath();
            ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.45, 2.5 + 3 * e, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (f.kind === "gold") {
        for (let i = 0; i < 14; i++) {
            const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.2;
            const v = 18 + r() * 26;
            const x = f.x + Math.cos(a) * v * easeOutCubic(e);
            const y = f.y - 8 + Math.sin(a) * v * easeOutCubic(e) + 22 * e * e;
            ctx.fillStyle = `rgba(255,${200 + Math.floor(r() * 55)},90,${1 - e})`;
            ctx.beginPath();
            ctx.arc(x, y, 1.6 + r() * 1.4, 0, Math.PI * 2);
            ctx.fill();
        }
    } else {
        const rad = f.r * (0.6 + 1.7 * easeOutCubic(e));
        if (e < 0.35) {
            const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 1.6);
            g.addColorStop(0, `rgba(255,240,170,${0.6 * (1 - e / 0.35)})`);
            g.addColorStop(1, "rgba(255,240,170,0)");
            ctx.fillStyle = g;
            ctx.fillRect(f.x - f.r * 1.6, f.y - f.r * 1.6, f.r * 3.2, f.r * 3.2);
        }
        ctx.strokeStyle = `rgba(255,226,122,${1 - e})`;
        ctx.lineWidth = 3 * (1 - e) + 0.5;
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, rad, rad * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
}

interface TownData {
    minutes: number;
    inhabited: boolean;
    verified: boolean;
    lit: boolean;
}

/** Desenha uma cidade revelada; `pop` aplica squash & stretch no castelo. */
function drawTown(ctx: Ctx, t: Territory, d: TownData, pop?: { sx: number; sy: number }) {
    const place = PLACE_BY_ID[t.placeId];
    const realm = REALM_BY_ID[t.realm];
    const s = t.radius / 30;
    ctx.fillStyle = "rgba(176,146,98,0.85)";
    ctx.beginPath();
    ctx.ellipse(t.center.x, t.center.y + 6 * s, t.radius * 0.95, t.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(90,66,36,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    if (d.lit) {
        const g = ctx.createRadialGradient(t.center.x, t.center.y - 8 * s, 0, t.center.x, t.center.y - 8 * s, t.radius * 1.4);
        g.addColorStop(0, "rgba(255,214,110,0.45)");
        g.addColorStop(1, "rgba(255,214,110,0)");
        ctx.fillStyle = g;
        ctx.fillRect(t.center.x - t.radius * 1.5, t.center.y - t.radius * 1.6, t.radius * 3, t.radius * 3);
    }
    const huts = place.population ?? 1;
    for (let i = 0; i < huts; i++) {
        const a = Math.PI * (0.12 + (0.76 * i) / Math.max(1, huts - 1)) + (huts === 1 ? Math.PI * 0.38 : 0);
        drawHouse(ctx, t.center.x + Math.cos(a) * t.radius * 0.82, t.center.y + 6 * s + Math.sin(a) * t.radius * 0.42, s * 0.75);
    }
    const bx = t.center.x;
    const by = t.center.y + 4 * s;
    ctx.save();
    if (pop) {
        ctx.translate(bx, by);
        ctx.scale(pop.sx, pop.sy);
        ctx.translate(-bx, -by);
    }
    drawCastle(ctx, bx, by, s * 0.95, realm.color, d.inhabited ? "#d8342a" : realm.color, d.verified);
    ctx.restore();
}

function usePrefersReducedMotion(): boolean {
    const [rm, setRm] = useState(
        () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
    );
    useEffect(() => {
        const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        if (!mq) return;
        const on = () => setRm(mq.matches); // callback de evento (não síncrono no efeito)
        mq.addEventListener("change", on);
        return () => mq.removeEventListener("change", on);
    }, []);
    return rm;
}

// ───────────────────────────────────────────────────────────────────────────
// Componente
// ───────────────────────────────────────────────────────────────────────────

interface Props {
    state: AtlasState;
    usage: EffectiveUsage[];
    discovered: Set<string>;
    world: Record<string, AtlasWorldStats>;
    rumors: Record<string, string[]>;
    justRevealed: string[];
    selected: string | null;
    expedition?: ExpeditionState;
    leagues: Budget | null;
    onSelect: (placeId: string) => void;
    onExpedition: (placeId: string) => void;
    onMove: (dest: Pt) => MoveResult | null;
}

type Rect = { x0: number; y0: number; x1: number; y1: number };

interface Cam {
    x: number;
    y: number;
    zoom: number;
}

type HoverInfo = { kind: "town" | "ruin"; placeId: string } | { kind: "chest"; markId: string } | null;

const SCENE_SCALE = 2;
const MINI_W = 224;
const MINI_H = 140;

export function AdventureMap(props: Props) {
    const { discovered, rumors, expedition, leagues, onSelect, justRevealed } = props;
    const adv = useMemo(() => generateAdventure(), []);
    const marks = useMemo(() => generateMarks(), []);

    // Terreno estático: pintado uma única vez (componente só roda no cliente).
    const [terrain] = useState<HTMLCanvasElement | null>(() => {
        if (typeof document === "undefined") return null;
        const c = document.createElement("canvas");
        renderTerrain(c, 2);
        return c;
    });

    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const miniRef = useRef<HTMLCanvasElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [hoverInfo, setHoverInfo] = useState<HoverInfo>(null);
    const prefersReduced = usePrefersReducedMotion();
    const [reduceOverride, setReduceOverride] = useState<boolean | null>(() => {
        try {
            const v = window.localStorage.getItem("atlas:reduceMotion");
            return v === null ? null : v === "1";
        } catch {
            return null;
        }
    });
    const reduceMotion = reduceOverride ?? prefersReduced;
    // Som: desligado por padrão (0); o contexto de áudio só nasce num gesto do usuário.
    const [volume, setVolume] = useState<number>(() => {
        try {
            const v = Number(window.localStorage.getItem("atlas:sound"));
            return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
        } catch {
            return 0;
        }
    });
    useEffect(() => {
        mapSfx.setVolume(volume);
    }, [volume]);

    // ── Estado visual em refs (sem re-render do React a cada quadro) ──
    const propsRef = useRef(props);
    const sizeRef = useRef(size);
    const reduceRef = useRef(reduceMotion);
    const camRef = useRef<Cam | null>(null);
    const camGoalRef = useRef<Cam | null>(null);
    const followRef = useRef(false);
    const pointerRef = useRef<Pt | null>(null);
    const heroRef = useRef<Pt | null>(null); // posição DESENHADA do Cartógrafo
    const heroAnimRef = useRef<HeroAnim | null>(null);
    const arrivalQueueRef = useRef<(() => void)[]>([]);
    const pendingPathRef = useRef<Pt[] | null>(null);
    const stepAccRef = useRef(0);
    const fogShownRef = useRef<string[] | null>(null); // névoa exibida (atualiza na chegada)
    const pendingFogRef = useRef<string[] | null>(null);
    const chestsShownRef = useRef<string[] | null>(null);
    const pendingChestsRef = useRef<string[] | null>(null);
    const traumaRef = useRef(0);
    const fxRef = useRef<Fx[]>([]);
    const popRef = useRef<Map<string, number>>(new Map());
    const seenRevealRef = useRef<Set<string>>(new Set());
    const sceneRef = useRef<HTMLCanvasElement | null>(null);
    const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const miniBaseRef = useRef<HTMLCanvasElement | null>(null);
    const sceneDirtyRef = useRef(true);
    const miniVersionRef = useRef(0);
    // Reconstrução incremental: só o retângulo sujo (névoa nova, baú coletado, castelo que assentou)
    const fullDirtyRef = useRef(true);
    const dirtyRectRef = useRef<Rect | null>(null);
    const miniKeyRef = useRef("");
    const rafRef = useRef<number | null>(null);
    const lastTRef = useRef(0);
    const perfRef = useRef<number[] | null>(null);
    const drag = useRef<{ sx: number; sy: number; cx: number; cy: number; moved: boolean } | null>(null);
    const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const pinchRef = useRef<PinchStart | null>(null);
    const gestureRef = useRef(false);

    const discoveredTowns = useMemo(() => adv.world.territories.filter((t) => discovered.has(t.placeId)), [adv, discovered]);

    // ── Câmera ──
    const clampCam = useCallback((c: Cam): Cam => {
        const { w, h } = sizeRef.current;
        if (!w) return c;
        const fit = Math.max(w / WORLD_W, h / WORLD_H);
        const zoom = Math.max(fit, Math.min(3.2, c.zoom));
        const vw = w / zoom;
        const vh = h / zoom;
        return {
            zoom,
            x: Math.max(-120, Math.min(WORLD_W - vw + 120, c.x)),
            y: Math.max(-80, Math.min(WORLD_H - vh + 80, c.y)),
        };
    }, []);

    const camCentered = useCallback(
        (p: Pt, zoom: number): Cam => {
            const { w, h } = sizeRef.current;
            return clampCam({ zoom, x: p.x - w / zoom / 2, y: p.y - h / zoom / 2 });
        },
        [clampCam],
    );

    // ── Visibilidade pela névoa EXIBIDA ──
    const visibleShown = useCallback(
        (p: Pt) => {
            const fog = fogShownRef.current ?? [];
            const key = `${Math.floor(p.x / FOG_CELL)},${Math.floor(p.y / FOG_CELL)}`;
            if (fog.includes(key)) return true;
            const disc = propsRef.current.discovered;
            return adv.world.territories.some(
                (t) => disc.has(t.placeId) && Math.hypot(t.center.x - p.x, t.center.y - p.y) <= t.radius + 60,
            );
        },
        [adv],
    );

    const townData = useCallback((t: Territory): TownData => {
        const p = propsRef.current;
        const min = p.usage.find((u) => u.placeId === t.placeId)?.weeklyMinutes ?? 0;
        return {
            minutes: min,
            inhabited: min > 0 || Boolean(p.state.inhabit[t.placeId]),
            verified: Boolean(p.state.discoveries[t.placeId]?.verified) || min > 0,
            lit: Boolean(p.state.lanterns[t.placeId] || p.world[t.placeId]?.lanterns),
        };
    }, []);

    // ── Camada estática (terreno + rotas + cidades + ruínas + baús + névoa) ──
    const buildScene = useCallback(() => {
        if (!terrain) return;
        const tb = performance.now();
        const p = propsRef.current;
        const fog = fogShownRef.current ?? [];
        const collected = chestsShownRef.current ?? [];
        const fogC = fogCanvasRef.current ?? document.createElement("canvas");
        renderFog(fogC, fog, adv.world.territories.filter((t) => p.discovered.has(t.placeId)));
        fogCanvasRef.current = fogC;
        const scene = sceneRef.current ?? document.createElement("canvas");
        if (scene.width !== WORLD_W * SCENE_SCALE) {
            scene.width = WORLD_W * SCENE_SCALE;
            scene.height = WORLD_H * SCENE_SCALE;
        }
        const ctx = scene.getContext("2d")!;
        ctx.setTransform(SCENE_SCALE, 0, 0, SCENE_SCALE, 0, 0);
        const r = !fullDirtyRef.current && sceneRef.current ? dirtyRectRef.current : null;
        ctx.save();
        if (r) {
            // medido: reconstrução total ≈ 45 ms (tarefa longa na chegada); só a região suja custa uma fração
            ctx.beginPath();
            ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
            ctx.clip();
        }
        ctx.drawImage(terrain, 0, 0, WORLD_W, WORLD_H);
        for (const [from, d] of Object.entries(p.state.decisions)) {
            if (!d.target || !p.discovered.has(from) || !p.discovered.has(d.target)) continue;
            const a = adv.world.territories.find((t) => t.placeId === from);
            const b = adv.world.territories.find((t) => t.placeId === d.target);
            if (!a || !b) continue;
            ctx.setLineDash([3, 6]);
            ctx.strokeStyle = "#e8392f";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(a.center.x, a.center.y);
            ctx.quadraticCurveTo((a.center.x + b.center.x) / 2, Math.min(a.center.y, b.center.y) - 50, b.center.x, b.center.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        const towns = [...adv.world.territories].sort((a, b) => a.center.y - b.center.y);
        for (const t of towns) {
            const s = t.radius / 30;
            if (!p.discovered.has(t.placeId)) {
                if (visibleShown(t.center)) drawRuin(ctx, t.center.x, t.center.y + 6 * s, Math.max(0.7, s), Boolean(p.rumors[t.placeId]));
                continue;
            }
            if (popRef.current.has(t.placeId)) continue; // desenhada no overlay enquanto "pula"
            drawTown(ctx, t, townData(t));
        }
        for (const m of marks) if (!collected.includes(m.id)) drawChest(ctx, m.pos.x, m.pos.y);
        ctx.drawImage(fogC, 0, 0, WORLD_W, WORLD_H);
        ctx.restore();
        sceneRef.current = scene;
        // minimapa base em cache (só hero e retângulo de visão mudam por quadro)
        const mb = miniBaseRef.current ?? document.createElement("canvas");
        mb.width = MINI_W * 2;
        mb.height = MINI_H * 2;
        const mctx = mb.getContext("2d")!;
        mctx.setTransform(2, 0, 0, 2, 0, 0);
        mctx.drawImage(scene, 0, 0, MINI_W, MINI_H);
        const sx = MINI_W / WORLD_W;
        for (const t of adv.world.territories) {
            if (!p.discovered.has(t.placeId)) continue;
            mctx.fillStyle = REALM_BY_ID[t.realm].color;
            mctx.fillRect(t.center.x * sx - 2.5, t.center.y * sx - 2.5, 5, 5);
            mctx.strokeStyle = "#fff";
            mctx.lineWidth = 0.8;
            mctx.strokeRect(t.center.x * sx - 2.5, t.center.y * sx - 2.5, 5, 5);
        }
        miniBaseRef.current = mb;
        miniVersionRef.current++;
        sceneDirtyRef.current = false;
        fullDirtyRef.current = false;
        dirtyRectRef.current = null;
        const bw = window as unknown as { __atlasBuild?: number[] };
        if (perfRef.current) (bw.__atlasBuild ??= []).push(performance.now() - tb);
    }, [terrain, adv, marks, visibleShown, townData]);

    const addFx = useCallback((kind: Fx["kind"], x: number, y: number, r: number, dur: number) => {
        fxRef.current.push({ kind, x, y, r, t0: performance.now(), dur, seed: Math.floor(Math.random() * 1e9) });
    }, []);
    const addTrauma = useCallback((amount: number) => {
        if (reduceRef.current) return; // acessibilidade: sem tremor
        traumaRef.current = Math.min(1, traumaRef.current + amount);
    }, []);

    const markFull = useCallback(() => {
        fullDirtyRef.current = true;
        dirtyRectRef.current = null;
        sceneDirtyRef.current = true;
    }, []);
    const markRect = useCallback((r: Rect) => {
        sceneDirtyRef.current = true;
        if (fullDirtyRef.current) return;
        const d = dirtyRectRef.current;
        dirtyRectRef.current = d
            ? { x0: Math.min(d.x0, r.x0), y0: Math.min(d.y0, r.y0), x1: Math.max(d.x1, r.x1), y1: Math.max(d.y1, r.y1) }
            : r;
    }, []);

    // ── Desenho de um quadro ──
    const draw = useCallback(
        (now: number, shake: { x: number; y: number }) => {
            const canvas = canvasRef.current;
            const cam = camRef.current;
            const { w, h } = sizeRef.current;
            if (!canvas || !cam || !w) return;
            if (sceneDirtyRef.current) buildScene();
            const scene = sceneRef.current;
            if (!scene) return;
            const p = propsRef.current;
            const dpr = window.devicePixelRatio || 1;
            if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
                canvas.width = Math.round(w * dpr);
                canvas.height = Math.round(h * dpr);
            }
            const ctx = canvas.getContext("2d")!;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = "#05060d";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const k = dpr * cam.zoom;
            // tremor como deslocamento SOMADO à câmera (nunca move o Cartógrafo)
            ctx.setTransform(k, 0, 0, k, -cam.x * k + shake.x * dpr, -cam.y * k + shake.y * dpr);
            // LOD de reamostragem: o bilinear ("low") lê 2 texels por eixo, então com redução
            // até 2:1 (ratio ≥ 0,5) nenhum texel é pulado e não há serrilhado; abaixo disso os
            // mipmaps ("high") são necessários. Medido: 3,1 ms/quadro contra 5,1 ms
            // (build de produção; "medium" mediu pior que ambos e foi descartado).
            const ratio = k / SCENE_SCALE;
            ctx.imageSmoothingQuality = ratio >= 0.5 ? "low" : "high";
            ctx.drawImage(scene, 0, 0, WORLD_W, WORLD_H);

            // cidades em "pop" (squash & stretch com overshoot)
            for (const [id, t0] of popRef.current) {
                const t = adv.world.territories.find((x) => x.placeId === id);
                if (!t) continue;
                const e = Math.min(1, (now - t0) / POP_MS);
                const v = easeOutBack(e);
                drawTown(ctx, t, townData(t), { sx: 1.4 - 0.4 * v, sy: 0.6 + 0.4 * v });
            }

            // anel de seleção / foco
            const ring = (id: string, color: string) => {
                const t = adv.world.territories.find((x) => x.placeId === id);
                if (!t) return;
                const s = t.radius / 30;
                ctx.strokeStyle = color;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.ellipse(t.center.x, t.center.y + 6 * s, t.radius * 1.05, t.radius * 0.58, 0, 0, Math.PI * 2);
                ctx.stroke();
            };
            if (p.selected && p.discovered.has(p.selected)) ring(p.selected, "rgba(255,226,122,0.95)");

            for (const f of fxRef.current) drawFx(ctx, f, now);

            // rota sob o cursor (setas verdes = alcança hoje; vermelhas = além)
            const ptr = pointerRef.current;
            const exp = p.expedition;
            const hero = heroRef.current;
            if (exp && hero && ptr && p.leagues && !heroAnimRef.current && !drag.current?.moved) {
                if (Math.hypot(ptr.x - hero.x, ptr.y - hero.y) >= 18) drawRoute();
            }
            function drawRoute() {
                if (!exp || !ptr || !p.leagues || !cam) return;
                // rota pelo terreno (campo de Dijkstra em cache: só refaz o caminho de volta)
                const plan = planRoute(exp, ptr, p.leagues.available, adv.world);
                const reach = plan.reach;
                const pts = plan.points;
                const cum = [0];
                for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
                const total = cum[cum.length - 1];
                for (let d = 16; d < total; d += 16) {
                    const at = alongPath(pts, cum, d);
                    // custo acumulado no ponto (interpolado no trecho)
                    let k = 1;
                    while (k < cum.length - 1 && cum[k] < d) k++;
                    const f = (d - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
                    const costHere = plan.costs[k - 1] + (plan.costs[k] - plan.costs[k - 1]) * f;
                    const ang = Math.atan2(at.dir.y, at.dir.x);
                    ctx.save();
                    ctx.translate(at.p.x, at.p.y);
                    ctx.rotate(ang);
                    ctx.fillStyle = costHere <= p.leagues.available + 1e-6 ? "#46d65a" : "#e24a3b";
                    ctx.strokeStyle = "rgba(0,0,0,0.6)";
                    ctx.lineWidth = 0.8;
                    ctx.beginPath();
                    ctx.moveTo(4, 0);
                    ctx.lineTo(-3, -3.5);
                    ctx.lineTo(-1, 0);
                    ctx.lineTo(-3, 3.5);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                }
                const lsx = (reach.point.x - cam.x) * cam.zoom;
                const lsy = (reach.point.y - cam.y) * cam.zoom;
                ctx.setTransform(dpr, 0, 0, dpr, shake.x * dpr, shake.y * dpr);
                label(
                    ctx,
                    reach.truncated ? `${Math.floor(reach.cost)} de ${Math.ceil(plan.total)} léguas` : `${Math.ceil(reach.cost)} léguas`,
                    lsx,
                    lsy - 14,
                    13,
                    reach.truncated ? "#ffb3a8" : "#c8ffcf",
                );
                ctx.setTransform(k, 0, 0, k, -cam.x * k + shake.x * dpr, -cam.y * k + shake.y * dpr);
            }

            if (hero) drawHero(ctx, hero.x, hero.y);

            // ── Rótulos em espaço de TELA: tamanho legível fixo + sem sobreposição (game-ui-ux) ──
            ctx.setTransform(dpr, 0, 0, dpr, shake.x * dpr, shake.y * dpr);
            const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
            const fits = (x0: number, y0: number, x1: number, y1: number) => {
                if (placed.some((r) => !(x1 < r.x0 || x0 > r.x1 || y1 < r.y0 || y0 > r.y1))) return false;
                placed.push({ x0, y0, x1, y1 });
                return true;
            };
            const prio = (t: Territory) => {
                const d = townData(t);
                return (t.placeId === p.selected ? 1000 : 0) + (d.inhabited ? 100 : 0) + (d.verified ? 10 : 0) + contentVolumeOf(PLACE_BY_ID[t.placeId]);
            };
            const towns = adv.world.territories.filter((t) => p.discovered.has(t.placeId)).sort((a, b) => prio(b) - prio(a));
            ctx.font = "bold 14px Inter, system-ui, sans-serif";
            for (const t of towns) {
                const sx = (t.center.x - cam.x) * cam.zoom;
                const sy = (t.center.y + t.radius * 0.62 - cam.y) * cam.zoom + 16;
                if (sx < -80 || sx > w + 80 || sy < -20 || sy > h + 30) continue;
                const place = PLACE_BY_ID[t.placeId];
                ctx.font = "bold 14px Inter, system-ui, sans-serif";
                const nw = ctx.measureText(place.name).width;
                if (!fits(sx - nw / 2 - 3, sy - 13, sx + nw / 2 + 3, sy + 4)) continue;
                label(ctx, place.name, sx, sy, 14, "#fff8e6");
                // nível de detalhe: epíteto só quando a cidade aparece grande o bastante
                if (t.radius * cam.zoom >= 26) {
                    const ep = epithet(place);
                    ctx.font = "italic 12px Inter, system-ui, sans-serif";
                    const ew = ctx.measureText(ep).width;
                    if (fits(sx - ew / 2 - 3, sy + 3, sx + ew / 2 + 3, sy + 17)) label(ctx, ep, sx, sy + 15, 12, "#ecdcb2", true);
                }
            }

            // ── Minimapa ──
            // redesenha só quando câmera, Cartógrafo ou base mudam (cada canvas invalidado custa raster/composição)
            const mini = miniRef.current;
            const mb = miniBaseRef.current;
            const miniKey = `${cam.x.toFixed(1)},${cam.y.toFixed(1)},${cam.zoom.toFixed(3)},${hero ? `${hero.x.toFixed(1)},${hero.y.toFixed(1)}` : ""},${w}x${h},${miniVersionRef.current}`;
            if (mini && mb && miniKey !== miniKeyRef.current) {
                miniKeyRef.current = miniKey;
                if (mini.width !== MINI_W * 2) {
                    mini.width = MINI_W * 2;
                    mini.height = MINI_H * 2;
                }
                const mctx = mini.getContext("2d")!;
                mctx.setTransform(1, 0, 0, 1, 0, 0);
                mctx.drawImage(mb, 0, 0);
                mctx.setTransform(2, 0, 0, 2, 0, 0);
                const s = MINI_W / WORLD_W;
                if (hero) blob(mctx, hero.x * s, hero.y * s, 2.6, "#ff4b3e");
                mctx.strokeStyle = "#ffe9a8";
                mctx.lineWidth = 1;
                mctx.strokeRect(cam.x * s, cam.y * s, (w / cam.zoom) * s, (h / cam.zoom) * s);
            }
        },
        [adv, buildScene, townData],
    );

    // ── Loop de animação sob demanda (para quando tudo está em repouso) ──
    const frameRef = useRef<(t: number) => void>(() => {});
    const requestRender = useCallback(() => {
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame((t) => frameRef.current(t));
    }, []);

    useEffect(() => {
        frameRef.current = (now: number) => {
            rafRef.current = null;
            const dt = Math.min(0.05, lastTRef.current ? (now - lastTRef.current) / 1000 : 0.016);
            lastTRef.current = now;
            const { w, h } = sizeRef.current;
            let cam = camRef.current;

            // Cartógrafo: interpolação com easing (a lógica já mudou; o desenho alcança)
            const anim = heroAnimRef.current;
            let lead = { x: 0, y: 0 };
            if (anim) {
                const e = anim.dur <= 0 ? 1 : Math.min(1, (now - anim.t0) / anim.dur);
                const v = easeInOutCubic(e);
                const at = alongPath(anim.path, anim.cum, v * anim.cum[anim.cum.length - 1]);
                const prevHero = heroRef.current;
                if (prevHero) stepAccRef.current += Math.hypot(at.p.x - prevHero.x, at.p.y - prevHero.y);
                if (stepAccRef.current >= 30) {
                    stepAccRef.current %= 30;
                    mapSfx.play("step"); // passos proporcionais à distância, não ao tempo
                }
                heroRef.current = at.p;
                const ahead = LOOK_AHEAD * Math.sin(Math.PI * e); // antecipação entra e sai suave
                lead = { x: at.dir.x * ahead, y: at.dir.y * ahead };
                if (e >= 1) {
                    heroAnimRef.current = null;
                    heroRef.current = anim.to;
                    // o mundo se revela na CHEGADA
                    if (pendingFogRef.current) {
                        const before = new Set(fogShownRef.current ?? []);
                        const M = 100; // furo da névoa (~50) + ruína que passa a aparecer
                        for (const key of pendingFogRef.current) {
                            if (before.has(key)) continue;
                            const [cx, cy] = key.split(",").map(Number);
                            markRect({ x0: cx * FOG_CELL - M, y0: cy * FOG_CELL - M, x1: (cx + 1) * FOG_CELL + M, y1: (cy + 1) * FOG_CELL + M });
                        }
                        fogShownRef.current = pendingFogRef.current;
                        pendingFogRef.current = null;
                    }
                    if (pendingChestsRef.current) {
                        const before = new Set(chestsShownRef.current ?? []);
                        for (const id of pendingChestsRef.current) {
                            const m = before.has(id) ? null : marks.find((x) => x.id === id);
                            if (m) markRect({ x0: m.pos.x - 24, y0: m.pos.y - 24, x1: m.pos.x + 24, y1: m.pos.y + 24 });
                        }
                        chestsShownRef.current = pendingChestsRef.current;
                        pendingChestsRef.current = null;
                    }
                    if (!reduceRef.current) addFx("dust", anim.to.x, anim.to.y, 0, TIER.small.dur);
                    for (const fn of anim.onArrive) fn();
                }
            }

            // Câmera: zona morta + antecipação + suavização exponencial (independente de FPS)
            if (cam && w) {
                const t = 1 - Math.exp(-CAM_RATE * dt);
                const goal = camGoalRef.current;
                if (goal) {
                    const z = Math.exp(Math.log(cam.zoom) + (Math.log(goal.zoom) - Math.log(cam.zoom)) * t);
                    cam = clampCam({ zoom: z, x: cam.x + (goal.x - cam.x) * t, y: cam.y + (goal.y - cam.y) * t });
                    if (Math.abs(goal.x - cam.x) < 0.5 && Math.abs(goal.y - cam.y) < 0.5 && Math.abs(goal.zoom - cam.zoom) < 0.002) {
                        cam = goal;
                        camGoalRef.current = null;
                    }
                } else if (followRef.current && heroRef.current) {
                    const vw = w / cam.zoom;
                    const vh = h / cam.zoom;
                    const cx = cam.x + vw / 2;
                    const cy = cam.y + vh / 2;
                    const tx = heroRef.current.x + lead.x;
                    const ty = heroRef.current.y + lead.y;
                    const dzx = vw * DEADZONE.x;
                    const dzy = vh * DEADZONE.y;
                    const ox = tx - cx;
                    const oy = ty - cy;
                    const gx = Math.abs(ox) > dzx ? cx + (ox - Math.sign(ox) * dzx) : cx;
                    const gy = Math.abs(oy) > dzy ? cy + (oy - Math.sign(oy) * dzy) : cy;
                    cam = clampCam({ zoom: cam.zoom, x: cam.x + (gx - cx) * t, y: cam.y + (gy - cy) * t });
                    if (!heroAnimRef.current && Math.abs(gx - cx) < 0.5 && Math.abs(gy - cy) < 0.5) followRef.current = false;
                }
                camRef.current = cam;
            }

            // Tremor por trauma² com ruído senoidal suave e decaimento
            traumaRef.current = Math.max(0, traumaRef.current - TRAUMA_DECAY * dt);
            const sh = traumaRef.current * traumaRef.current;
            const shake = sh > 0 ? { x: SHAKE_MAX.x * sh * Math.sin(now / 1000 * 31), y: SHAKE_MAX.y * sh * Math.sin(now / 1000 * 43 + 1.3) } : { x: 0, y: 0 };

            // efeitos e pops expirados
            fxRef.current = fxRef.current.filter((f) => now - f.t0 < f.dur);
            for (const [id, t0] of popRef.current) {
                if (now - t0 >= POP_MS) {
                    popRef.current.delete(id);
                    const t = adv.world.territories.find((x) => x.placeId === id);
                    if (t) markRect({ x0: t.center.x - t.radius * 1.7, y0: t.center.y - t.radius * 1.9, x1: t.center.x + t.radius * 1.7, y1: t.center.y + t.radius * 1.4 });
                    else markFull();
                }
            }

            const t0 = performance.now();
            draw(now, shake);
            if (perfRef.current) {
                perfRef.current.push(performance.now() - t0);
                if (perfRef.current.length > 600) perfRef.current.shift();
            }

            const animating =
                heroAnimRef.current || followRef.current || camGoalRef.current || traumaRef.current > 0 || fxRef.current.length || popRef.current.size;
            if (animating) requestRender();
            else lastTRef.current = 0;
        };
    });

    // ── Sincronização com os dados ──
    useEffect(() => {
        propsRef.current = props;
        requestRender();
    });
    useEffect(() => {
        sizeRef.current = size;
        reduceRef.current = reduceMotion;
        requestRender();
    }, [size, reduceMotion, requestRender]);

    // Medidor opcional de custo por quadro (localStorage "atlas:perf" = "1").
    useEffect(() => {
        try {
            if (window.localStorage.getItem("atlas:perf") === "1") {
                perfRef.current = [];
                (window as unknown as { __atlasPerf?: number[] }).__atlasPerf = perfRef.current;
            }
        } catch {
            /* storage indisponível */
        }
    }, []);

    // Só os campos que mudam a camada estática (mover o Cartógrafo NÃO reconstrói tudo)
    const { decisions, inhabit, discoveries, lanterns } = props.state;
    // `discovered`/`usage` são recriados a cada mudança de estado (inclusive um passo do
    // Cartógrafo): a dependência é o CONTEÚDO, para não reconstruir a cena à toa (medido: 45 ms).
    const discoveredKey = useMemo(() => [...discovered].sort().join(","), [discovered]);
    const usageKey = useMemo(() => props.usage.map((u) => `${u.placeId}:${u.weeklyMinutes}`).join(","), [props.usage]);
    useEffect(() => {
        markFull();
        requestRender();
    }, [decisions, inhabit, discoveries, lanterns, discoveredKey, usageKey, props.world, rumors, markFull, requestRender]);

    // Cartógrafo: anima até a nova posição lógica; névoa/baús se revelam na chegada
    useEffect(() => {
        if (!expedition) return;
        const to = expedition.cartographer;
        if (!heroRef.current) {
            heroRef.current = to;
            fogShownRef.current = expedition.fog;
            chestsShownRef.current = expedition.marksCollected;
        } else if (heroRef.current.x !== to.x || heroRef.current.y !== to.y) {
            const from = heroRef.current;
            // segue a rota calculada pelo terreno (se ela termina aqui); senão, reta
            const planned = pendingPathRef.current;
            pendingPathRef.current = null;
            const last = planned?.[planned.length - 1];
            const path = planned && last && Math.hypot(last.x - to.x, last.y - to.y) < 0.5 ? [from, ...planned.slice(1, -1), to] : [from, to];
            const cum = [0];
            for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
            const dist = cum[cum.length - 1];
            const dur = reduceRef.current ? 0 : Math.max(220, Math.min(1800, (dist / HERO_SPEED) * 1000));
            heroAnimRef.current = { path, cum, to, t0: performance.now(), dur, onArrive: arrivalQueueRef.current };
            arrivalQueueRef.current = [];
            followRef.current = true;
            camGoalRef.current = null;
            pendingFogRef.current = expedition.fog;
            pendingChestsRef.current = expedition.marksCollected;
            requestRender(); // a cena só muda na chegada
            return;
        } else {
            // sem movimento (ex.: carregou do servidor): aplica direto
            fogShownRef.current = expedition.fog;
            chestsShownRef.current = expedition.marksCollected;
        }
        markFull();
        requestRender();
    }, [expedition, markFull, requestRender]);

    // Câmera inicial centrada no Cartógrafo (ref, sem setState)
    useEffect(() => {
        if (!size.w || camRef.current || !expedition) return;
        const fit = Math.max(size.w / WORLD_W, size.h / WORLD_H);
        camRef.current = camCentered(heroRef.current ?? expedition.cartographer, fit * 2.1);
        requestRender();
    }, [size, expedition, camCentered, requestRender]);

    // Revelação: o maior feedback (pop do castelo + anel de luz + tremor + foco)
    useEffect(() => {
        const fresh = justRevealed.filter((id) => !seenRevealRef.current.has(id));
        if (!fresh.length) return;
        const now = performance.now();
        for (const id of fresh) {
            seenRevealRef.current.add(id);
            const t = adv.world.territories.find((x) => x.placeId === id);
            if (!t) continue;
            if (!reduceRef.current) popRef.current.set(id, now);
            addFx("reveal", t.center.x, t.center.y + 4, t.radius, TIER.large.dur);
            addTrauma(TIER.large.trauma);
            mapSfx.play("reveal");
            const cam = camRef.current;
            if (cam) camGoalRef.current = camCentered(t.center, Math.max(cam.zoom, 1.6));
        }
        markFull();
        requestRender();
    }, [justRevealed, adv, addFx, addTrauma, camCentered, markFull, requestRender]);

    // Tamanho do canvas acompanha o contêiner (notificação inicial inclusa).
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Limpeza do loop ao desmontar
    useEffect(
        () => () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        },
        [],
    );

    // ── Interação ──
    const toWorld = (sx: number, sy: number): Pt => {
        const c = camRef.current ?? { x: 0, y: 0, zoom: 1 };
        return { x: c.x + sx / c.zoom, y: c.y + sy / c.zoom };
    };

    const hitTest = (pt: Pt): HoverInfo => {
        const p = propsRef.current;
        for (const t of adv.world.territories) {
            if (Math.hypot(t.center.x - pt.x, t.center.y - pt.y) > t.radius) continue;
            if (p.discovered.has(t.placeId)) return { kind: "town", placeId: t.placeId };
            if (visibleShown(t.center)) return { kind: "ruin", placeId: t.placeId };
        }
        const collected = chestsShownRef.current ?? [];
        for (const m of marks) {
            if (collected.includes(m.id)) continue;
            if (Math.hypot(m.pos.x - pt.x, m.pos.y - pt.y) < 14 && visibleShown(m.pos)) return { kind: "chest", markId: m.id };
        }
        return null;
    };

    const sameHover = (a: HoverInfo, b: HoverInfo) =>
        a === b ||
        (!!a && !!b && a.kind === b.kind && ("placeId" in a ? a.placeId : a.markId) === ("placeId" in b ? b.placeId : b.markId));

    // Toque com dois dedos = pinça (zoom); um gesto nunca vira "toque" que move o Cartógrafo.
    const pinchMetrics = (rect: DOMRect) => {
        const [a, b] = [...pointersRef.current.values()];
        return {
            dist: Math.hypot(a.x - b.x, a.y - b.y),
            mid: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top },
        };
    };
    const onPointerDown = (e: React.PointerEvent) => {
        const cam = camRef.current;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!cam || !rect) return;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        mapSfx.unlock();
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointersRef.current.size === 2) {
            const { dist, mid } = pinchMetrics(rect);
            pinchRef.current = { dist0: dist, zoom0: cam.zoom, anchor: toWorld(mid.x, mid.y) };
            gestureRef.current = true;
            drag.current = null;
            followRef.current = false;
            camGoalRef.current = null;
            return;
        }
        if (pointersRef.current.size === 1) gestureRef.current = false;
        drag.current = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    };
    const endPointer = (e: React.PointerEvent) => {
        pointersRef.current.delete(e.pointerId);
        if (pointersRef.current.size < 2) pinchRef.current = null;
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        const cam = camRef.current;
        if (!rect || !cam) return;
        if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinchRef.current && pointersRef.current.size >= 2) {
            const { dist, mid } = pinchMetrics(rect);
            camRef.current = clampCam(pinchCamera(pinchRef.current, dist, mid));
            requestRender();
            return;
        }
        if (gestureRef.current) return; // dedo restante de uma pinça: não arrasta nem pré-visualiza
        const d = drag.current;
        if (d) {
            const dx = e.clientX - d.sx;
            const dy = e.clientY - d.sy;
            if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
            if (d.moved) {
                followRef.current = false;
                camGoalRef.current = null;
                camRef.current = clampCam({ zoom: cam.zoom, x: d.cx - dx / cam.zoom, y: d.cy - dy / cam.zoom });
                requestRender();
            }
            return;
        }
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        pointerRef.current = toWorld(sx, sy);
        const hit = hitTest(pointerRef.current);
        setHoverInfo((prev) => (sameHover(prev, hit) ? prev : hit)); // re-render só quando o alvo muda
        const tip = tooltipRef.current;
        if (tip) tip.style.transform = `translate(${Math.min(sx + 14, sizeRef.current.w - 250)}px, ${Math.max(8, sy - 10)}px)`;
        requestRender();
    };
    const onPointerUp = (e: React.PointerEvent) => {
        endPointer(e);
        const d = drag.current;
        drag.current = null;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (gestureRef.current) {
            if (pointersRef.current.size === 0) gestureRef.current = false;
            return; // fim de pinça não é toque
        }
        if (!d || d.moved || !rect) return;
        const pt = toWorld(e.clientX - rect.left, e.clientY - rect.top);
        const hit = hitTest(pt);
        const p = propsRef.current;
        if (hit?.kind === "town") {
            mapSfx.play("select");
            p.onSelect(hit.placeId);
            return;
        }
        // eventos de chegada (disparados quando o Cartógrafo realmente chega)
        const queue: (() => void)[] = [];
        const res = p.onMove(pt);
        if (!res?.moved) return;
        pendingPathRef.current = res.path;
        for (const y of res.collected) {
            const m = marks.find((x) => x.id === y.markId);
            if (m)
                queue.push(() => {
                    addFx("gold", m.pos.x, m.pos.y, 0, TIER.medium.dur);
                    addTrauma(TIER.medium.trauma);
                    mapSfx.play("chest");
                });
        }
        if (!res.truncated && hit?.kind === "ruin") {
            const id = hit.placeId;
            queue.push(() => p.onExpedition(id));
        }
        arrivalQueueRef.current = queue;
    };
    const onWheel = (e: React.WheelEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        const cam = camRef.current;
        if (!rect || !cam) return;
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const before = toWorld(sx, sy);
        const zoom = cam.zoom * (e.deltaY > 0 ? 1 / 1.15 : 1.15);
        followRef.current = false;
        camGoalRef.current = null;
        camRef.current = clampCam({ zoom, x: before.x - sx / zoom, y: before.y - sy / zoom });
        requestRender();
    };
    const zoomBy = (f: number) => {
        const cam = camGoalRef.current ?? camRef.current;
        if (!cam) return;
        const { w, h } = sizeRef.current;
        const cx = cam.x + w / cam.zoom / 2;
        const cy = cam.y + h / cam.zoom / 2;
        camGoalRef.current = camCentered({ x: cx, y: cy }, cam.zoom * f);
        followRef.current = false;
        requestRender();
    };
    const easeTo = (pt: Pt, zoom?: number) => {
        const cam = camRef.current;
        if (!cam) return;
        camGoalRef.current = camCentered(pt, zoom ?? cam.zoom);
        followRef.current = false;
        requestRender();
    };
    const fitAll = () => {
        const { w, h } = sizeRef.current;
        camGoalRef.current = clampCam({ zoom: Math.max(w / WORLD_W, h / WORLD_H), x: 0, y: 0 });
        followRef.current = false;
        requestRender();
    };
    const onMiniClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        easeTo({ x: ((e.clientX - r.left) / r.width) * WORLD_W, y: ((e.clientY - r.top) / r.height) * WORLD_H });
    };
    // Teclado: setas/WASD movem a visão, +/− aproximam, C centraliza no Cartógrafo
    const onKeyDown = (e: React.KeyboardEvent) => {
        const cam = camGoalRef.current ?? camRef.current;
        if (!cam) return;
        const { w, h } = sizeRef.current;
        const stepX = (w / cam.zoom) * 0.18;
        const stepY = (h / cam.zoom) * 0.18;
        const pan = (dx: number, dy: number) => {
            camGoalRef.current = clampCam({ ...cam, x: cam.x + dx, y: cam.y + dy });
            followRef.current = false;
            requestRender();
        };
        // ações a partir da tecla FÍSICA (layout-independente); Ctrl/⌘/Alt ficam com o navegador
        switch (actionForKey(e)) {
            case "panLeft":
                pan(-stepX, 0);
                break;
            case "panRight":
                pan(stepX, 0);
                break;
            case "panUp":
                pan(0, -stepY);
                break;
            case "panDown":
                pan(0, stepY);
                break;
            case "zoomIn":
                zoomBy(1.25);
                break;
            case "zoomOut":
                zoomBy(1 / 1.25);
                break;
            case "centerHero":
                if (heroRef.current) easeTo(heroRef.current);
                break;
            default:
                return;
        }
        e.preventDefault();
    };
    const toggleReduce = () => {
        const next = !reduceMotion;
        setReduceOverride(next);
        try {
            window.localStorage.setItem("atlas:reduceMotion", next ? "1" : "0");
        } catch {
            /* storage indisponível */
        }
    };

    const remainingChests = marks.filter((m) => !expedition?.marksCollected.includes(m.id)).length;
    const domains = discoveredTowns.map((t) => ({ t, place: PLACE_BY_ID[t.placeId] }));
    const hoverPlace = hoverInfo && hoverInfo.kind !== "chest" ? PLACE_BY_ID[hoverInfo.placeId] : null;

    return (
        <div className="flex flex-col gap-3 lg:flex-row">
            {/* Moldura do mapa */}
            <div className="relative flex-1 rounded-xl border-[3px] border-[#6b5232] bg-[#05060d] p-1 shadow-[inset_0_0_0_1px_#c9a45c,0_8px_30px_rgba(0,0,0,0.45)] focus-within:ring-2 focus-within:ring-[#ffd36b] focus-within:ring-offset-2 focus-within:ring-offset-[#05060d]">
                <div ref={wrapRef} className="relative h-[62vh] min-h-[380px] w-full overflow-hidden rounded-md">
                    <canvas
                        ref={canvasRef}
                        tabIndex={0}
                        className="absolute inset-0 h-full w-full touch-none outline-none"
                        style={{ cursor: hoverInfo?.kind === "town" ? "pointer" : "crosshair" }}
                        aria-label="Mapa de aventura do multiverso digital"
                        aria-describedby="atlas-map-help"
                        role="application"
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={(e) => {
                            endPointer(e);
                            drag.current = null;
                            if (pointersRef.current.size === 0) gestureRef.current = false;
                        }}
                        onPointerLeave={() => {
                            pointerRef.current = null;
                            setHoverInfo(null);
                            requestRender();
                        }}
                        onWheel={onWheel}
                        onKeyDown={onKeyDown}
                    />
                    <p id="atlas-map-help" className="sr-only">
                        Setas ou WASD movem a visão, + e − aproximam, C centraliza no Cartógrafo. Clique para mover o Cartógrafo.
                    </p>
                    {!terrain && (
                        <div className="absolute inset-0 flex items-center justify-center text-sm text-[#eadcbc]">Desenhando o mundo…</div>
                    )}
                    <div
                        ref={tooltipRef}
                        className={`pointer-events-none absolute left-0 top-0 z-10 max-w-[240px] rounded-md border border-[#c9a45c] bg-[#1e1a14]/95 px-3 py-2 text-[13px] leading-snug text-[#eadcbc] shadow-lg ${hoverInfo ? "" : "hidden"}`}
                    >
                        {hoverInfo?.kind === "town" && hoverPlace && (() => {
                            const s = scoresFor(hoverPlace.id);
                            const min = props.usage.find((u) => u.placeId === hoverPlace.id)?.weeklyMinutes ?? 0;
                            return (
                                <>
                                    <div className="font-semibold text-[#fff3d0]">{hoverPlace.name}</div>
                                    <div className="italic text-[#d9c79a]">{epithet(hoverPlace)}</div>
                                    <div className="mt-1">{TERRAIN_INFO[s.terrain].label} · saúde {s.health}</div>
                                    <div>Conteúdo: {CONTENT_VOLUME_LABELS[contentVolumeOf(hoverPlace)]} · População: {hoverPlace.population ? POPULATION_LABELS[hoverPlace.population] : "incerta"}</div>
                                    {min > 0 && <div>Você: {formatMinutes(min)}/semana</div>}
                                    <div className="mt-1 text-[#bfae86]">Clique para abrir</div>
                                </>
                            );
                        })()}
                        {hoverInfo?.kind === "ruin" && hoverPlace && (
                            <>
                                <div className="font-semibold text-[#fff3d0]">Ruína misteriosa</div>
                                <div>Ninguém sabe o que há aqui. Leve o Cartógrafo até lá para revelar.</div>
                                {rumors[hoverPlace.id] && <div className="mt-1 text-[#c9a6ff]">Rumor: {epithet(hoverPlace)}</div>}
                            </>
                        )}
                        {hoverInfo?.kind === "chest" && (
                            <>
                                <div className="font-semibold text-[#fff3d0]">Baú de marco</div>
                                <div>Alcance-o para ganhar um rumor sobre um setor próximo.</div>
                            </>
                        )}
                    </div>
                    <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-md border border-[#c9a45c] bg-[#1e1a14]/90 text-[#eadcbc]">
                        <button onClick={() => zoomBy(1.25)} className="p-2 hover:bg-[#3a3024] focus-visible:bg-[#3a3024]" aria-label="Aproximar"><Plus className="h-4 w-4" /></button>
                        <button onClick={() => zoomBy(1 / 1.25)} className="p-2 hover:bg-[#3a3024] focus-visible:bg-[#3a3024]" aria-label="Afastar"><Minus className="h-4 w-4" /></button>
                        <button onClick={() => heroRef.current && easeTo(heroRef.current)} className="p-2 hover:bg-[#3a3024] focus-visible:bg-[#3a3024]" aria-label="Centralizar no Cartógrafo"><Crosshair className="h-4 w-4" /></button>
                        <button onClick={fitAll} className="p-2 hover:bg-[#3a3024] focus-visible:bg-[#3a3024]" aria-label="Ver mundo inteiro"><Maximize2 className="h-4 w-4" /></button>
                    </div>
                </div>
            </div>

            {/* Painel lateral */}
            <aside className="flex w-full flex-col gap-3 rounded-xl border-[3px] border-[#6b5232] bg-[#1e1a14] p-3 text-[#eadcbc] shadow-[inset_0_0_0_1px_#c9a45c] lg:w-64">
                <canvas
                    ref={miniRef}
                    onClick={onMiniClick}
                    className="aspect-[1.6] w-full cursor-pointer rounded border border-[#c9a45c] bg-black"
                    aria-label="Minimapa: clique para levar a visão até o ponto"
                />
                <div className="rounded-md border border-[#5a4628] bg-[#15120d] p-2.5">
                    <div className="flex items-center justify-between text-sm font-semibold text-[#fff3d0]">
                        <span>Cartógrafo</span>
                        <span className="tabular-nums text-xs text-[#d9c79a]">
                            {leagues ? `${Math.floor(leagues.available)}/${leagues.total}` : "—"} léguas
                        </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#3a3024]">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-[#3fae4a] to-[#8fdc5a] transition-[width] duration-500 ease-out"
                            style={{ width: `${leagues ? Math.round((leagues.available / Math.max(1, leagues.total)) * 100) : 0}%` }}
                        />
                    </div>
                    {leagues && (
                        <div className="mt-1 text-[11px] text-[#a8976f]">
                            base {leagues.base} · fontes +{leagues.fontes} · bônus +{leagues.bonus} · renova à meia-noite
                        </div>
                    )}
                </div>
                <div className="rounded-md border border-[#5a4628] bg-[#15120d] p-2.5">
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[#c9a45c]">Domínios ({domains.length})</div>
                    {domains.length === 0 ? (
                        <p className="text-xs text-[#a8976f]">Nenhum ainda. Leve o Cartógrafo até uma ruína.</p>
                    ) : (
                        <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
                            {domains.map(({ t, place }) => (
                                <li key={t.placeId}>
                                    <button
                                        onClick={() => {
                                            easeTo(t.center);
                                            onSelect(t.placeId);
                                        }}
                                        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[13px] hover:bg-[#2a2319] focus-visible:bg-[#2a2319] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#ffd36b]"
                                    >
                                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: REALM_BY_ID[t.realm].color }} />
                                        <span className="truncate text-[#fff3d0]">{place.name}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
                    <div className="rounded-md border border-[#5a4628] bg-[#15120d] p-2">
                        <div className="text-base font-semibold text-[#fff3d0]">{PLACES.length - discovered.size}</div>
                        <div className="text-[#a8976f]">setores por revelar</div>
                    </div>
                    <div className="rounded-md border border-[#5a4628] bg-[#15120d] p-2">
                        <div className="text-base font-semibold text-[#fff3d0]">{remainingChests}</div>
                        <div className="text-[#a8976f]">baús restantes</div>
                    </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-[#d9c79a]">
                    <span className="w-10 shrink-0">Som</span>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={volume}
                        onChange={(e) => {
                            const v = Number(e.target.value);
                            setVolume(v);
                            mapSfx.setVolume(v);
                            mapSfx.unlock(); // o próprio gesto libera o áudio
                            try {
                                window.localStorage.setItem("atlas:sound", String(v));
                            } catch {
                                /* storage indisponível */
                            }
                        }}
                        className="h-1 flex-1 accent-[#c9a45c]"
                        aria-label="Volume dos efeitos sonoros"
                        aria-valuetext={volume === 0 ? "desligado" : `${Math.round(volume * 100)}%`}
                    />
                    <span className="w-14 text-right tabular-nums">{volume === 0 ? "desligado" : `${Math.round(volume * 100)}%`}</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-[#d9c79a]">
                    <input type="checkbox" checked={reduceMotion} onChange={toggleReduce} className="accent-[#c9a45c]" />
                    Reduzir movimento (sem tremor nem animações)
                </label>
                <ul className="space-y-1 text-[12px] text-[#bfae86]">
                    <li>🏰 Castelo = território revelado (tamanho = conteúdo; casas = população)</li>
                    <li>🏛️ Ruína “?” = setor avistado, ainda sem nome</li>
                    <li>🚩 Bandeira vermelha = você habita · brilho dourado = lanternas</li>
                    <li>➤ Setas verdes = alcança hoje · vermelhas = além das léguas</li>
                    <li>⌨️ Setas/WASD movem a visão · +/− zoom · C centraliza · 👆 pinça para zoom no toque</li>
                </ul>
                <div className="text-[11px] text-[#8a7a58]">
                    Biomas: {REALMS.map((r) => BIOME_STYLE[REALM_BIOME[r.id as CategoryId]].label).slice(0, 4).join(", ")}…
                </div>
            </aside>
        </div>
    );
}
