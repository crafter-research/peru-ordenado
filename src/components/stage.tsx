"use client";

import { useEffect, useRef } from "react";
import { colorFor, mixOklch, type Oklch, parseOklch, rangeFor } from "@/lib/color";
import { count, habitantes, km2, pct, soles } from "@/lib/format";
import {
  type Box,
  gridLayout,
  LABEL_H,
  labelWidth,
  mapLayout,
  type Place,
} from "@/lib/layout";
import type { View } from "@/lib/selection";
import {
  certainty,
  type Dataset,
  type Level,
  type Metric,
  parentId,
  type Shape,
  value,
} from "@/lib/shapes";

export type { View };

type Frame = Place & { a: number };
type Item = {
  key: string;
  level: Level;
  shape: Shape;
  path: Path2D;
  cx: number;
  cy: number;
  from: Frame;
  to: Frame;
  cur: Frame;
  start: number;
  dur: number;
  /** Fill and Jev-certainty opacity blend from the previous metric to the new one with the motion. */
  color: { from: Oklch; to: Oklch };
  sure: { from: number; to: number };
};

const ease = (t: number) => 1 - (1 - t) ** 4;
const DUR = 800;
const STAGGER = 350;

/** Shapes ordered for the sorted view: highest value first, shapes without data last. */
export function sortShapes(shapes: Shape[], metric: Metric): Shape[] {
  return [...shapes].sort(
    (a, b) => (value(b, metric) ?? -1) - (value(a, metric) ?? -1),
  );
}

export function valueLabel(shape: Shape, metric: Metric): string {
  if (metric === "area") return km2(shape.area);
  if (metric === "poblacion")
    return shape.pob === undefined ? "sin datos" : habitantes(shape.pob);
  if (metric === "densidad") {
    const d = value(shape, metric);
    return d === undefined ? "sin datos" : `${d < 10 ? d.toFixed(1) : count(d)} hab/km²`;
  }
  if (metric === "porHabitante" || metric === "canon") {
    const v = value(shape, metric);
    return v === undefined ? "sin datos" : `S/ ${count(Math.round(v))}`;
  }
  if (metric === "omision") {
    const v = value(shape, metric);
    return v === undefined ? "sin datos" : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
  }
  if (metric === "digital")
    return shape.digital === undefined ? "sin datos" : `${shape.digital}/100`;
  if (metric === "ornato" || metric === "quipu" || metric === "cobertura" || metric === "internet") {
    const v = value(shape, metric);
    return v === undefined ? "sin datos" : pct(v);
  }
  if (metric === "emergencias" || metric === "zonas") {
    const v = value(shape, metric);
    return v === undefined ? "sin datos" : `${v.toFixed(1)}`;
  }
  if (!shape.inv) return "sin datos";
  return metric === "inversion"
    ? soles(shape.inv.pim)
    : pct(shape.inv.dev / shape.inv.pim);
}

export function Stage({
  data,
  level,
  view,
  metric,
  label,
  highlight,
  zoom = false,
  lift = 0,
  allNames = false,
  onHover,
}: {
  data: Dataset;
  level: Level;
  view: View;
  metric: Metric;
  label: string;
  /** Ids at the current level to ring and call out, used by the story. */
  highlight?: string[];
  /** Fly in on the highlighted place and let the rest step back (a looked-up place, not the story). */
  zoom?: boolean;
  /** Fraction of the height the focus is raised by, to leave room for a sheet over the bottom of the map. */
  lift?: number;
  /** Name every shape in the sorted view, shrinking them until the names fit. */
  allNames?: boolean;
  onHover: (
    hit: { shape: Shape; level: Level; x: number; y: number } | null,
  ) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const items = useRef(new Map<string, Item>());
  const hovered = useRef<string | null>(null);
  const size = useRef<Box>({ w: 0, h: 0, pad: 0 });
  const state = useRef({ level, view, metric });
  const raf = useRef(0);
  const settledAt = useRef(0);
  const redraw = useRef<() => void>(() => {});
  const highlighted = useRef(new Set<string>());
  const retargetTo = useRef<(next: typeof state.current) => void>(() => {});
  const zoomOn = useRef(zoom);
  const liftRef = useRef(lift);
  const aim = useRef<() => void>(() => {});
  // Camera: the focus point (in layout space) glides to the middle of the canvas while k grows.
  const cam = useRef({
    from: { k: 1, fx: 0, fy: 0 },
    to: { k: 1, fx: 0, fy: 0 },
    start: 0,
  });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const targets = (lvl: Level, vw: View, m: Metric) => {
      const shapes = data[lvl];
      return vw === "mapa"
        ? mapLayout(shapes, size.current)
        : gridLayout(sortShapes(shapes, m), size.current, allNames || lvl === "dep");
    };

    const retarget = (
      prev: typeof state.current,
      next: typeof state.current,
    ) => {
      const now = performance.now();
      const places = targets(next.level, next.view, next.metric);
      const order = new Map(
        sortShapes(data[next.level], next.metric).map((s, i) => [s.id, i]),
      );
      const n = data[next.level].length;
      const rng = rangeFor(data[next.level], next.metric);
      const delay = (id: string) =>
        reduced ? 0 : ((order.get(id) ?? 0) / n) * STAGGER;

      const first = items.current.size === 0;
      if (prev.level !== next.level || first) {
        const down =
          (prev.level === "dep" && next.level !== "dep") ||
          (prev.level === "prov" && next.level === "dist");
        // Outgoing level: fade, or fold into the parent's new place when going up.
        for (const it of items.current.values()) {
          if (it.level === next.level) continue;
          let to: Frame = { ...it.cur, a: 0 };
          if (!down) {
            const pid = parentAt(it.level, it.shape.id, next.level);
            const p = pid ? places.get(pid) : undefined;
            const parent = pid
              ? data[next.level].find((s) => s.id === pid)
              : undefined;
            if (p && parent) to = { ...nest(it, parent, p), a: 0 };
          }
          Object.assign(it, {
            from: it.cur,
            to,
            start: now,
            dur: reduced ? 1 : down ? 450 : DUR,
          });
        }
        const parentItems = new Map(
          [...items.current.values()]
            .filter((i) => i.level === prev.level)
            .map((i) => [i.shape.id, i]),
        );
        for (const shape of data[next.level]) {
          const to = places.get(shape.id);
          if (!to) continue;
          const [cx, cy] = [
            (shape.bbox[0] + shape.bbox[2]) / 2,
            (shape.bbox[1] + shape.bbox[3]) / 2,
          ];
          const pid = parentAt(next.level, shape.id, prev.level);
          const parent = pid ? parentItems.get(pid) : undefined;
          // Going down, children start exactly where their parent sits and fly out of it.
          const from: Frame =
            down && parent
              ? {
                  ...nest({ cx, cy }, parent.shape, parent.cur),
                  label: false,
                  a: 1,
                }
              : { ...to, label: false, a: 0 };
          const key = `${next.level}:${shape.id}`;
          items.current.set(key, {
            key,
            level: next.level,
            shape,
            path: new Path2D(shape.d),
            cx,
            cy,
            from,
            to: { ...to, a: 1 },
            cur: from,
            start: now + (down || first ? delay(shape.id) : DUR * 0.55),
            dur: reduced ? 1 : DUR,
            color: {
              from: parseOklch(
                colorFor(shape, next.metric, next.level !== "dep", rng),
              ),
              to: parseOklch(
                colorFor(shape, next.metric, next.level !== "dep", rng),
              ),
            },
            sure: {
              from: sureFor(shape, next.metric),
              to: sureFor(shape, next.metric),
            },
          });
        }
      } else {
        for (const it of items.current.values()) {
          if (it.level !== next.level) continue;
          const to = places.get(it.shape.id);
          if (!to) continue;
          const moved = prev.view !== next.view || prev.metric !== next.metric;
          Object.assign(it, {
            from: it.cur,
            to: { ...to, a: 1 },
            start: now + (moved ? delay(it.shape.id) : 0),
            dur: moved && !reduced ? DUR : 1,
            color: {
              from: parseOklch(
                mixOklch(it.color.from, it.color.to, progress(it, now)),
              ),
              to: parseOklch(
                colorFor(it.shape, next.metric, next.level !== "dep", rng),
              ),
            },
            sure: {
              from:
                it.sure.from + (it.sure.to - it.sure.from) * progress(it, now),
              to: sureFor(it.shape, next.metric),
            },
          });
        }
      }
      settledAt.current = now + DUR + STAGGER + 100;
      state.current = next;
      loop();
      aim.current();
    };

    const draw = (now: number) => {
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      const styles = getComputedStyle(el);
      const font = styles.getPropertyValue("--font-inter") || "sans-serif";
      const ink = styles.getPropertyValue("--label-strong");
      const muted = styles.getPropertyValue("--label");
      const paper = styles.getPropertyValue("--background");
      const labels: Item[] = [];
      const callouts: Item[] = [];
      const ck = ease(Math.min(1, Math.max(0, (now - cam.current.start) / 800)));
      const { from: cf, to: ct } = cam.current;
      const camK = cf.k + (ct.k - cf.k) * ck;
      const camX = cf.fx + (ct.fx - cf.fx) * ck;
      const camY = cf.fy + (ct.fy - cf.fy) * ck;
      // 0 when the camera rests, 1 once it has flown in: how much the other shapes step back.
      const back = Math.min(1, Math.max(0, (camK - 1) / 1.2));
      for (const it of items.current.values()) {
        const t = ease(Math.min(1, Math.max(0, (now - it.start) / it.dur)));
        const f = it.from;
        const g = it.to;
        it.cur = {
          x: f.x + (g.x - f.x) * t,
          y: f.y + (g.y - f.y) * t,
          s: f.s + (g.s - f.s) * t,
          a: f.a + (g.a - f.a) * t,
          label: g.label,
        };
        if (camK !== 1) {
          it.cur = {
            ...it.cur,
            x: (it.cur.x - camX) * camK + size.current.w / 2,
            y: (it.cur.y - camY) * camK + size.current.h * (0.5 - liftRef.current),
            s: it.cur.s * camK,
          };
        }
        if (it.cur.a <= 0.01) {
          if (g.a === 0 && t >= 1) items.current.delete(it.key);
          continue;
        }
        const { x, y, s, a } = it.cur;
        ctx.setTransform(
          dpr * s,
          0,
          0,
          dpr * s,
          dpr * (x - it.cx * s),
          dpr * (y - it.cy * s),
        );
        const stepBack =
          back > 0 && it.level === state.current.level && !highlighted.current.has(it.shape.id)
            ? 1 - 0.78 * back
            : 1;
        ctx.globalAlpha = a * stepBack * (it.sure.from + (it.sure.to - it.sure.from) * t);
        ctx.fillStyle = mixOklch(it.color.from, it.color.to, t);
        ctx.fill(it.path);
        if (it.level !== "dist") {
          ctx.lineWidth = 0.7 / s;
          ctx.strokeStyle = paper;
          ctx.stroke(it.path);
        }
        const hl =
          it.level === state.current.level &&
          highlighted.current.has(it.shape.id);
        if (hl && t > 0.6) {
          ctx.globalAlpha = Math.min(1, (t - 0.6) / 0.3) * a;
          ctx.save();
          ctx.shadowColor = "rgba(60, 40, 20, 0.35)";
          ctx.shadowBlur = 18 * dpr;
          ctx.shadowOffsetY = 5 * dpr;
          ctx.fillStyle = mixOklch(it.color.from, it.color.to, t);
          ctx.fill(it.path);
          ctx.restore();
          ctx.lineWidth = 2.6 / s;
          ctx.strokeStyle = styles.getPropertyValue("--accent");
          ctx.stroke(it.path);
          callouts.push(it);
        }
        if (hovered.current === it.key) {
          ctx.save();
          ctx.shadowColor = "rgba(60, 40, 20, 0.35)";
          ctx.shadowBlur = 16 * dpr;
          ctx.shadowOffsetY = 4 * dpr;
          ctx.fillStyle = mixOklch(it.color.from, it.color.to, t);
          ctx.fill(it.path);
          ctx.restore();
          ctx.lineWidth = 1.2 / s;
          ctx.strokeStyle = ink;
          ctx.stroke(it.path);
        }
        if (g.label && t > 0.9 && !hl) labels.push(it);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = "center";
      const m = state.current.metric;
      const serif = styles.getPropertyValue("--font-fraunces") || "Georgia, serif";
      // Where each callout will be drawn, so the small labels around it can step aside instead of colliding.
      const boxes = callouts.flatMap((it) => {
        const { x, y, s } = it.cur;
        const top = y - ((it.shape.bbox[3] - it.shape.bbox[1]) * s) / 2;
        ctx.font = `400 17px ${serif}, Georgia, serif`;
        const w = Math.max(ctx.measureText(it.shape.name).width, 60);
        const px = Math.min(Math.max(x, w / 2 + 8), size.current.w - w / 2 - 8);
        const py = Math.max(top - 38, 20);
        return [
          { l: px - w / 2 - 8, r: px + w / 2 + 8, t: py - 20, b: py + 22 },
          { l: x - 6, r: x + 6, t: py + 18, b: top + 4 },
        ];
      });
      for (const it of labels) {
        const { x, y, s, a } = it.cur;
        const bottom = y + ((it.shape.bbox[3] - it.shape.bbox[1]) * s) / 2;
        const w = Math.max(
          (it.shape.bbox[2] - it.shape.bbox[0]) * s,
          labelWidth(it.shape.name),
        );
        if (
          boxes.some(
            (b) => x - w / 2 < b.r && x + w / 2 > b.l && bottom < b.b && bottom + LABEL_H > b.t,
          )
        )
          continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = ink;
        ctx.font = `500 9.5px ${font}`;
        ctx.fillText(
          fit(ctx, it.shape.name.toUpperCase(), w),
          x,
          bottom + 10,
          w,
        );
        ctx.fillStyle = muted;
        ctx.font = `400 9px ${font}`;
        ctx.fillText(valueLabel(it.shape, m), x, bottom + LABEL_H - 3, w);
      }
      // Callouts: no box. A hairline leader ends in a dot on the shape; the name in the serif,
      // the figure in the accent, both haloed with the page color so they read over any fill.
      const surface = styles.getPropertyValue("--surface");
      const accent = styles.getPropertyValue("--accent");
      ctx.lineJoin = "round";
      for (const it of callouts) {
        const { x, y, s, a } = it.cur;
        const top = y - ((it.shape.bbox[3] - it.shape.bbox[1]) * s) / 2;
        const name = it.shape.name;
        const figure = valueLabel(it.shape, m);
        ctx.font = `400 17px ${serif}, Georgia, serif`;
        const w = Math.max(ctx.measureText(name).width, 60);
        const px = Math.min(Math.max(x, w / 2 + 8), size.current.w - w / 2 - 8);
        const py = Math.max(top - 38, 20);
        ctx.globalAlpha = a;
        ctx.strokeStyle = ink;
        ctx.fillStyle = ink;
        ctx.lineWidth = 1;
        ctx.globalAlpha = a * 0.55;
        ctx.beginPath();
        ctx.moveTo(x, py + 18);
        ctx.lineTo(x, top + 3);
        ctx.stroke();
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(x, top + 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = surface;
        ctx.strokeText(name, px, py);
        ctx.fillStyle = ink;
        ctx.fillText(name, px, py);
        ctx.font = `500 11px ${font}`;
        ctx.strokeText(figure, px, py + 15);
        ctx.fillStyle = accent;
        ctx.fillText(figure, px, py + 15);
      }
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      cancelAnimationFrame(raf.current);
      const tick = (now: number) => {
        draw(now);
        if (now < settledAt.current) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    };

    const resize = () => {
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.round(r.width * dpr);
      el.height = Math.round(r.height * dpr);
      const pad = r.width < 640 ? 12 : 28;
      const firstRun = size.current.w === 0;
      // The observer also fires once on attach; only a real size change re-lays out.
      if (
        !firstRun &&
        r.width === size.current.w &&
        r.height === size.current.h
      ) {
        // A remount (dev StrictMode) cancelled the previous frame loop; resume any motion in flight.
        loop();
        return;
      }
      size.current = { w: r.width, h: r.height, pad };
      if (firstRun) retarget({ ...state.current, view: "mapa" }, state.current);
      else {
        const places = targets(
          state.current.level,
          state.current.view,
          state.current.metric,
        );
        for (const it of items.current.values()) {
          const to = places.get(it.shape.id);
          if (it.level !== state.current.level || !to) continue;
          it.from = it.to = it.cur = { ...to, a: 1 };
        }
        draw(performance.now());
        aim.current();
      }
    };

    redraw.current = () => {
      if (performance.now() >= settledAt.current) draw(performance.now());
    };

    // Zoom so the place fills about 40% of the canvas: a tiny district needs a lot more than a big one.
    const fitK = (it: Item) => {
      const [x0, y0, x1, y1] = it.shape.bbox;
      const extent = Math.max(x1 - x0, y1 - y0) * it.to.s;
      const room = 0.4 * Math.min(size.current.w, size.current.h);
      return extent > 0 ? Math.max(1.5, Math.min(30, room / extent)) : 3.4;
    };
    aim.current = () => {
      const now = performance.now();
      const { from, to, start } = cam.current;
      const k = ease(Math.min(1, Math.max(0, (now - start) / 800)));
      const here = {
        k: from.k + (to.k - from.k) * k,
        fx: from.fx + (to.fx - from.fx) * k,
        fy: from.fy + (to.fy - from.fy) * k,
      };
      const lvl = state.current.level;
      const target = [...items.current.values()].find(
        (i) => i.level === lvl && highlighted.current.has(i.shape.id),
      );
      const flyIn = zoomOn.current && highlighted.current.size === 1 && target;
      const next = flyIn
        ? { k: fitK(target), fx: target.to.x, fy: target.to.y }
        : { k: 1, fx: size.current.w / 2, fy: size.current.h / 2 };
      if (here.k === 1 && next.k === 1) return;
      cam.current = { from: here, to: next, start: now };
      settledAt.current = Math.max(settledAt.current, now + 900);
      loop();
    };

    retargetTo.current = (next) => {
      if (size.current.w > 0) retarget(state.current, next);
      else state.current = next;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, [data]);

  useEffect(() => {
    highlighted.current = new Set(highlight ?? []);
    zoomOn.current = zoom;
    liftRef.current = lift;
    redraw.current();
  }, [highlight, zoom, lift]);

  useEffect(() => {
    const cur = state.current;
    if (cur.level === level && cur.view === view && cur.metric === metric)
      return;
    retargetTo.current({ level, view, metric });
  }, [level, view, metric]);

  // After the layout has a place for the target, point the camera at it (or back out).
  useEffect(() => {
    aim.current();
  }, [highlight, zoom, lift, level, view, metric]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const hit = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const ctx = el.getContext("2d");
      let found: Item | null = null;
      if (ctx) {
        for (const it of [...items.current.values()].reverse()) {
          if (it.level !== state.current.level || it.cur.a < 0.5) continue;
          const { x, y, s } = it.cur;
          const mx = (px - x) / s + it.cx;
          const my = (py - y) / s + it.cy;
          const b = it.shape.bbox;
          if (mx < b[0] || mx > b[2] || my < b[1] || my > b[3]) continue;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          if (ctx.isPointInPath(it.path, mx, my)) {
            found = it;
            break;
          }
        }
      }
      const key = found?.key ?? null;
      if (key !== hovered.current) {
        hovered.current = key;
        redraw.current();
      }
      onHover(
        found ? { shape: found.shape, level: found.level, x: px, y: py } : null,
      );
    };
    const leave = () => {
      hovered.current = null;
      onHover(null);
      redraw.current();
    };
    el.addEventListener("pointermove", hit);
    el.addEventListener("pointerdown", hit);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", hit);
      el.removeEventListener("pointerdown", hit);
      el.removeEventListener("pointerleave", leave);
    };
  }, [onHover]);

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      className="absolute inset-0 size-full touch-manipulation"
    />
  );
}

const progress = (it: Item, now: number) =>
  ease(Math.min(1, Math.max(0, (now - it.start) / it.dur)));

const sureFor = (shape: Shape, metric: Metric) =>
  metric === "ornato" ? 0.25 + 0.75 * certainty(shape) : 1;

function parentAt(level: Level, id: string, target: Level): string | undefined {
  let lvl: Level = level;
  let cur: string | undefined = id;
  while (cur && lvl !== target) {
    cur = parentId(lvl, cur);
    lvl = lvl === "dist" ? "prov" : "dep";
  }
  return cur;
}

/** Place of a child drawn inside its parent's place, so both share one transform. */
function nest(
  child: { cx: number; cy: number },
  parent: Shape,
  p: Place,
): Place {
  const pcx = (parent.bbox[0] + parent.bbox[2]) / 2;
  const pcy = (parent.bbox[1] + parent.bbox[3]) / 2;
  return {
    x: p.x + (child.cx - pcx) * p.s,
    y: p.y + (child.cy - pcy) * p.s,
    s: p.s,
    label: false,
  };
}

function fit(ctx: CanvasRenderingContext2D, text: string, w: number): string {
  if (ctx.measureText(text).width <= w) return text;
  let t = text;
  while (t.length > 3 && ctx.measureText(`${t}…`).width > w) t = t.slice(0, -1);
  return `${t}…`;
}
