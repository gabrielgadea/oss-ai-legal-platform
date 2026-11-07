"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Maximize2, Minus, Plus } from "lucide-react";
import type { AtlasWorldStats } from "@/app/lib/mikeApi";
import { CONTENT_VOLUME_LABELS, PLACES, PLACE_BY_ID, POPULATION_LABELS } from "@/app/lib/atlas/catalog";
import { formatMinutes } from "@/app/lib/atlas/metrics";
import { scoresFor, TERRAIN_INFO } from "@/app/lib/atlas/scoring";
import { FOG_CELL, generateMarks, reachTowards, type Budget, type MoveResult } from "@/app/lib/atlas/expedition";
import {
    BIOME_STYLE,
    REALM_BIOME,
    generateAdventure,
    quadPoint,
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
        for (let i = 0; i < 46; i++) {
            const px = realm.center.x + (tr() * 2 - 1) * realm.radius * 1.1;
            const py = realm.center.y + (tr() * 2 - 1) * realm.radius * 1.1;
            const rad = 18 + tr() * 46;
            const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
            const c = tr() > 0.5 ? style.groundDark : style.groundLight;
            g.addColorStop(0, c);
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = g;
            ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
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

interface Cam {
    x: number;
    y: number;
    zoom: number;
}

type Hover =
    | { kind: "town"; t: Territory; x: number; y: number }
    | { kind: "ruin"; t: Territory; x: number; y: number }
    | { kind: "chest"; x: number; y: number }
    | null;

export function AdventureMap(props: Props) {
    const { state, usage, discovered, world, rumors, justRevealed, selected, expedition, leagues, onSelect, onExpedition, onMove } = props;
    const adv = useMemo(() => generateAdventure(), []);
    const marks = useMemo(() => generateMarks(), []);
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const miniRef = useRef<HTMLCanvasElement>(null);
    // Terreno estático: pintado uma única vez (componente só roda no cliente).
    const [terrain] = useState<HTMLCanvasElement | null>(() => {
        if (typeof document === "undefined") return null;
        const c = document.createElement("canvas");
        renderTerrain(c, 2);
        return c;
    });
    const terrainRef = useRef<HTMLCanvasElement | null>(terrain);
    const terrainReady = Boolean(terrain);
    const fogRef = useRef<HTMLCanvasElement | null>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [cam, setCam] = useState<Cam | null>(null);
    const [pointer, setPointer] = useState<Pt | null>(null);
    const [screenPt, setScreenPt] = useState<{ x: number; y: number } | null>(null);
    const drag = useRef<{ sx: number; sy: number; cx: number; cy: number; moved: boolean } | null>(null);

    const minutes = useMemo(() => new Map(usage.map((u) => [u.placeId, u.weeklyMinutes])), [usage]);
    const lifted = useMemo(() => new Set(expedition?.fog ?? []), [expedition?.fog]);
    const discoveredTowns = useMemo(() => adv.world.territories.filter((t) => discovered.has(t.placeId)), [adv, discovered]);
    const isVisible = useCallback(
        (p: Pt) =>
            lifted.has(`${Math.floor(p.x / FOG_CELL)},${Math.floor(p.y / FOG_CELL)}`) ||
            discoveredTowns.some((t) => Math.hypot(t.center.x - p.x, t.center.y - p.y) <= t.radius + 60),
        [lifted, discoveredTowns],
    );

    // Névoa: recalculada quando a exploração muda.
    useEffect(() => {
        const c = fogRef.current ?? document.createElement("canvas");
        renderFog(c, expedition?.fog ?? [], discoveredTowns);
        fogRef.current = c;
    }, [expedition?.fog, discoveredTowns]);

    // Tamanho do canvas acompanha o contêiner.
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        // O ResizeObserver já notifica o tamanho inicial ao começar a observar.
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const fitZoom = size.w ? Math.max(size.w / WORLD_W, size.h / WORLD_H) : 1;
    const clampCam = useCallback(
        (c: Cam): Cam => {
            const zoom = Math.max(fitZoom, Math.min(3.2, c.zoom));
            const vw = size.w / zoom;
            const vh = size.h / zoom;
            return {
                zoom,
                x: Math.max(-120, Math.min(WORLD_W - vw + 120, c.x)),
                y: Math.max(-80, Math.min(WORLD_H - vh + 80, c.y)),
            };
        },
        [fitZoom, size],
    );

    const centerOn = useCallback(
        (p: Pt, zoom?: number) => {
            setCam((c) => {
                const z = zoom ?? c?.zoom ?? fitZoom * 2;
                return clampCam({ zoom: z, x: p.x - size.w / z / 2, y: p.y - size.h / z / 2 });
            });
        },
        [clampCam, fitZoom, size],
    );

    // Câmera inicial: aproximada, centrada no Cartógrafo.
    useEffect(() => {
        // Espera o Cartógrafo existir para começar centrado nele.
        if (!size.w || cam || !expedition) return;
        const hero = expedition.cartographer;
        const id = requestAnimationFrame(() => centerOn(hero, fitZoom * 2.1));
        return () => cancelAnimationFrame(id);
    }, [size, cam, expedition, centerOn, fitZoom]);

    const toWorld = useCallback(
        (sx: number, sy: number): Pt => {
            const c = cam ?? { x: 0, y: 0, zoom: 1 };
            return { x: c.x + sx / c.zoom, y: c.y + sy / c.zoom };
        },
        [cam],
    );

    const hitTest = useCallback(
        (p: Pt): Hover => {
            for (const t of adv.world.territories) {
                if (Math.hypot(t.center.x - p.x, t.center.y - p.y) > t.radius) continue;
                if (discovered.has(t.placeId)) return { kind: "town", t, x: p.x, y: p.y };
                if (isVisible(t.center)) return { kind: "ruin", t, x: p.x, y: p.y };
            }
            for (const m of marks) {
                if (expedition?.marksCollected.includes(m.id)) continue;
                if (Math.hypot(m.pos.x - p.x, m.pos.y - p.y) < 14 && isVisible(m.pos)) return { kind: "chest", x: p.x, y: p.y };
            }
            return null;
        },
        [adv, discovered, isVisible, marks, expedition],
    );

    const hover = useMemo(() => (pointer ? hitTest(pointer) : null), [pointer, hitTest]);
    const reach = useMemo(() => {
        if (!expedition || !leagues || !pointer || hover?.kind === "town") return null;
        return reachTowards(expedition.cartographer, pointer, leagues.available, adv.world, discovered);
    }, [expedition, leagues, pointer, hover, adv, discovered]);

    // ── Renderização ──
    useEffect(() => {
        const canvas = canvasRef.current;
        const terrain = terrainRef.current;
        if (!canvas || !terrain || !cam || !size.w) return;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== size.w * dpr || canvas.height !== size.h * dpr) {
            canvas.width = size.w * dpr;
            canvas.height = size.h * dpr;
        }
        const ctx = canvas.getContext("2d")!;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#05060d";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const k = dpr * cam.zoom;
        ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(terrain, 0, 0, WORLD_W, WORLD_H);

        // rotas de migração planejadas
        for (const [from, d] of Object.entries(state.decisions)) {
            if (!d.target || !discovered.has(from) || !discovered.has(d.target)) continue;
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

        // cidades e ruínas (ordem por y)
        const towns = [...adv.world.territories].sort((a, b) => a.center.y - b.center.y);
        for (const t of towns) {
            const place = PLACE_BY_ID[t.placeId];
            const realm = REALM_BY_ID[t.realm];
            const s = t.radius / 30;
            if (!discovered.has(t.placeId)) {
                if (isVisible(t.center)) drawRuin(ctx, t.center.x, t.center.y + 6 * s, Math.max(0.7, s), Boolean(rumors[t.placeId]));
                continue;
            }
            const min = minutes.get(t.placeId) ?? 0;
            const inhabited = min > 0 || Boolean(state.inhabit[t.placeId]);
            const verified = Boolean(state.discoveries[t.placeId]?.verified) || min > 0;
            const isSel = selected === t.placeId || (hover?.kind === "town" && hover.t.placeId === t.placeId);
            // praça
            ctx.fillStyle = "rgba(176,146,98,0.85)";
            ctx.beginPath();
            ctx.ellipse(t.center.x, t.center.y + 6 * s, t.radius * 0.95, t.radius * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(90,66,36,0.5)";
            ctx.lineWidth = 1;
            ctx.stroke();
            if (state.lanterns[t.placeId] || world[t.placeId]?.lanterns) {
                const g = ctx.createRadialGradient(t.center.x, t.center.y - 8 * s, 0, t.center.x, t.center.y - 8 * s, t.radius * 1.4);
                g.addColorStop(0, "rgba(255,214,110,0.45)");
                g.addColorStop(1, "rgba(255,214,110,0)");
                ctx.fillStyle = g;
                ctx.fillRect(t.center.x - t.radius * 1.5, t.center.y - t.radius * 1.6, t.radius * 3, t.radius * 3);
            }
            if (justRevealed.includes(t.placeId) || isSel) {
                ctx.strokeStyle = justRevealed.includes(t.placeId) ? "rgba(255,240,150,0.95)" : "rgba(255,226,122,0.9)";
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.ellipse(t.center.x, t.center.y + 6 * s, t.radius * 1.05, t.radius * 0.58, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            // casas: uma por ordem de grandeza de população
            const huts = place.population ?? 1;
            for (let i = 0; i < huts; i++) {
                const a = Math.PI * (0.12 + (0.76 * i) / Math.max(1, huts - 1)) + (huts === 1 ? Math.PI * 0.38 : 0);
                drawHouse(ctx, t.center.x + Math.cos(a) * t.radius * 0.82, t.center.y + 6 * s + Math.sin(a) * t.radius * 0.42, s * 0.75);
            }
            drawCastle(ctx, t.center.x, t.center.y + 4 * s, s * 0.95, realm.color, inhabited ? "#d8342a" : realm.color, verified);
            label(ctx, place.name, t.center.x, t.center.y + t.radius * 0.62 + 14, 11, "#fff8e6");
            label(ctx, epithet(place), t.center.x, t.center.y + t.radius * 0.62 + 26, 9, "#e8d9b0", true);
        }

        // baús (marcos)
        for (const m of marks) {
            if (expedition?.marksCollected.includes(m.id)) continue;
            drawChest(ctx, m.pos.x, m.pos.y);
        }

        // névoa preta estrelada
        if (fogRef.current) ctx.drawImage(fogRef.current, 0, 0, WORLD_W, WORLD_H);

        // rota sob o cursor (setas verdes = alcança hoje; vermelhas = além)
        if (expedition && reach && pointer) {
            const from = expedition.cartographer;
            const total = Math.hypot(pointer.x - from.x, pointer.y - from.y);
            const reachLen = Math.hypot(reach.point.x - from.x, reach.point.y - from.y);
            const ang = Math.atan2(pointer.y - from.y, pointer.x - from.x);
            for (let d = 16; d < total; d += 16) {
                const px = from.x + Math.cos(ang) * d;
                const py = from.y + Math.sin(ang) * d;
                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(ang);
                ctx.fillStyle = d <= reachLen ? "#46d65a" : "#e24a3b";
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
            label(ctx, `${Math.ceil(reach.cost)} léguas`, reach.point.x, reach.point.y - 12, 11, reach.truncated ? "#ffb3a8" : "#c8ffcf");
        }

        if (expedition) drawHero(ctx, expedition.cartographer.x, expedition.cartographer.y);
    }, [cam, size, terrainReady, adv, marks, state, discovered, minutes, rumors, world, justRevealed, selected, hover, expedition, reach, pointer, isVisible, lifted]);

    // ── Minimapa ──
    useEffect(() => {
        const mini = miniRef.current;
        const terrain = terrainRef.current;
        if (!mini || !terrain || !cam) return;
        const W = 224;
        const H = 140;
        mini.width = W * 2;
        mini.height = H * 2;
        const ctx = mini.getContext("2d")!;
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        ctx.drawImage(terrain, 0, 0, W, H);
        if (fogRef.current) ctx.drawImage(fogRef.current, 0, 0, W, H);
        const sx = W / WORLD_W;
        for (const t of discoveredTowns) {
            ctx.fillStyle = REALM_BY_ID[t.realm].color;
            ctx.fillRect(t.center.x * sx - 2.5, t.center.y * sx - 2.5, 5, 5);
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 0.8;
            ctx.strokeRect(t.center.x * sx - 2.5, t.center.y * sx - 2.5, 5, 5);
        }
        if (expedition) blob(ctx, expedition.cartographer.x * sx, expedition.cartographer.y * sx, 2.6, "#ff4b3e");
        ctx.strokeStyle = "#ffe9a8";
        ctx.lineWidth = 1;
        ctx.strokeRect(cam.x * sx, cam.y * sx, (size.w / cam.zoom) * sx, (size.h / cam.zoom) * sx);
    }, [cam, size, terrainReady, discoveredTowns, expedition, lifted]);

    // ── Interação ──
    const onPointerDown = (e: React.PointerEvent) => {
        if (!cam) return;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        drag.current = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect || !cam) return;
        const d = drag.current;
        if (d) {
            const dx = e.clientX - d.sx;
            const dy = e.clientY - d.sy;
            if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
            if (d.moved) setCam(clampCam({ zoom: cam.zoom, x: d.cx - dx / cam.zoom, y: d.cy - dy / cam.zoom }));
            return;
        }
        setScreenPt({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        setPointer(toWorld(e.clientX - rect.left, e.clientY - rect.top));
    };
    const onPointerUp = (e: React.PointerEvent) => {
        const d = drag.current;
        drag.current = null;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!d || d.moved || !rect) return;
        const p = toWorld(e.clientX - rect.left, e.clientY - rect.top);
        const hit = hitTest(p);
        if (hit?.kind === "town") {
            onSelect(hit.t.placeId);
            return;
        }
        const res = onMove(p);
        if (res?.moved && !res.truncated && hit?.kind === "ruin") onExpedition(hit.t.placeId);
        if (res?.moved && cam) {
            const hp = res.exp.cartographer;
            const vw = size.w / cam.zoom;
            const vh = size.h / cam.zoom;
            if (hp.x < cam.x + vw * 0.15 || hp.x > cam.x + vw * 0.85 || hp.y < cam.y + vh * 0.15 || hp.y > cam.y + vh * 0.85) centerOn(hp);
        }
    };
    const onWheel = (e: React.WheelEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect || !cam) return;
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const before = toWorld(sx, sy);
        const zoom = cam.zoom * (e.deltaY > 0 ? 1 / 1.15 : 1.15);
        setCam(clampCam({ zoom, x: before.x - sx / zoom, y: before.y - sy / zoom }));
    };
    const zoomBy = (f: number) => {
        if (!cam) return;
        const cx = cam.x + size.w / cam.zoom / 2;
        const cy = cam.y + size.h / cam.zoom / 2;
        const zoom = cam.zoom * f;
        setCam(clampCam({ zoom, x: cx - size.w / zoom / 2, y: cy - size.h / zoom / 2 }));
    };
    const onMiniClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        centerOn({ x: ((e.clientX - r.left) / r.width) * WORLD_W, y: ((e.clientY - r.top) / r.height) * WORLD_H });
    };

    const remainingChests = marks.filter((m) => !expedition?.marksCollected.includes(m.id)).length;
    const domains = discoveredTowns.map((t) => ({ t, place: PLACE_BY_ID[t.placeId] }));

    return (
        <div className="flex flex-col gap-3 lg:flex-row">
            {/* Moldura do mapa */}
            <div className="relative flex-1 rounded-xl border-[3px] border-[#6b5232] bg-[#05060d] p-1 shadow-[inset_0_0_0_1px_#c9a45c,0_8px_30px_rgba(0,0,0,0.45)]">
                <div ref={wrapRef} className="relative h-[62vh] min-h-[380px] w-full overflow-hidden rounded-md">
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 h-full w-full touch-none"
                        style={{ cursor: hover?.kind === "town" ? "pointer" : "crosshair" }}
                        aria-label="Mapa de aventura do multiverso digital"
                        role="img"
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerLeave={() => {
                            setPointer(null);
                            setScreenPt(null);
                        }}
                        onWheel={onWheel}
                    />
                    {!terrainReady && (
                        <div className="absolute inset-0 flex items-center justify-center text-sm text-[#eadcbc]">Desenhando o mundo…</div>
                    )}
                    {hover && screenPt && (
                        <div
                            className="pointer-events-none absolute z-10 max-w-[240px] rounded-md border border-[#c9a45c] bg-[#1e1a14]/95 px-3 py-2 text-xs text-[#eadcbc] shadow-lg"
                            style={{ left: Math.min(screenPt.x + 14, size.w - 250), top: Math.max(8, screenPt.y - 10) }}
                        >
                            {hover.kind === "town" && (() => {
                                const place = PLACE_BY_ID[hover.t.placeId];
                                const s = scoresFor(place.id);
                                const min = minutes.get(place.id) ?? 0;
                                return (
                                    <>
                                        <div className="font-semibold text-[#fff3d0]">{place.name}</div>
                                        <div className="italic text-[#d9c79a]">{epithet(place)}</div>
                                        <div className="mt-1">{TERRAIN_INFO[s.terrain].label} · saúde {s.health}</div>
                                        <div>Conteúdo: {CONTENT_VOLUME_LABELS[contentVolumeOf(place)]} · População: {place.population ? POPULATION_LABELS[place.population] : "incerta"}</div>
                                        {min > 0 && <div>Você: {formatMinutes(min)}/semana</div>}
                                        <div className="mt-1 text-[#bfae86]">Clique para abrir</div>
                                    </>
                                );
                            })()}
                            {hover.kind === "ruin" && (
                                <>
                                    <div className="font-semibold text-[#fff3d0]">Ruína misteriosa</div>
                                    <div>Ninguém sabe o que há aqui. Leve o Cartógrafo até lá para revelar.</div>
                                    {rumors[hover.t.placeId] && <div className="mt-1 text-[#c9a6ff]">Rumor: {epithet(PLACE_BY_ID[hover.t.placeId])}</div>}
                                </>
                            )}
                            {hover.kind === "chest" && (
                                <>
                                    <div className="font-semibold text-[#fff3d0]">Baú de marco</div>
                                    <div>Alcance-o para ganhar um rumor sobre um setor próximo.</div>
                                </>
                            )}
                        </div>
                    )}
                    <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-md border border-[#c9a45c] bg-[#1e1a14]/90 text-[#eadcbc]">
                        <button onClick={() => zoomBy(1.25)} className="p-2 hover:bg-[#3a3024]" aria-label="Aproximar"><Plus className="h-4 w-4" /></button>
                        <button onClick={() => zoomBy(1 / 1.25)} className="p-2 hover:bg-[#3a3024]" aria-label="Afastar"><Minus className="h-4 w-4" /></button>
                        <button onClick={() => expedition && centerOn(expedition.cartographer)} className="p-2 hover:bg-[#3a3024]" aria-label="Centralizar no Cartógrafo"><Crosshair className="h-4 w-4" /></button>
                        <button onClick={() => setCam(clampCam({ zoom: fitZoom, x: 0, y: 0 }))} className="p-2 hover:bg-[#3a3024]" aria-label="Ver mundo inteiro"><Maximize2 className="h-4 w-4" /></button>
                    </div>
                </div>
            </div>

            {/* Painel lateral */}
            <aside className="flex w-full flex-col gap-3 rounded-xl border-[3px] border-[#6b5232] bg-[#1e1a14] p-3 text-[#eadcbc] shadow-[inset_0_0_0_1px_#c9a45c] lg:w-64">
                <canvas
                    ref={miniRef}
                    onClick={onMiniClick}
                    className="aspect-[1.6] w-full cursor-pointer rounded border border-[#c9a45c] bg-black"
                    aria-label="Minimapa"
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
                            className="h-full rounded-full bg-gradient-to-r from-[#3fae4a] to-[#8fdc5a]"
                            style={{ width: `${leagues ? Math.round((leagues.available / Math.max(1, leagues.total)) * 100) : 0}%` }}
                        />
                    </div>
                    {leagues && (
                        <div className="mt-1 text-[10px] text-[#a8976f]">
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
                                            centerOn(t.center);
                                            onSelect(t.placeId);
                                        }}
                                        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-[#2a2319]"
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
                <ul className="space-y-1 text-[11px] text-[#bfae86]">
                    <li>🏰 Castelo = território revelado (tamanho = conteúdo; casas = população)</li>
                    <li>🏛️ Ruína “?” = setor avistado, ainda sem nome</li>
                    <li>🚩 Bandeira vermelha = você habita · brilho dourado = lanternas</li>
                    <li>➤ Setas verdes = alcança hoje · vermelhas = além das léguas</li>
                </ul>
                <div className="text-[10px] text-[#8a7a58]">
                    Biomas: {REALMS.map((r) => BIOME_STYLE[REALM_BIOME[r.id as CategoryId]].label).slice(0, 4).join(", ")}…
                </div>
            </aside>
        </div>
    );
}
