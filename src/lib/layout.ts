import type { Shape } from "@/lib/shapes";

/** Where a shape is drawn: its bbox center lands on (x, y), scaled by s from map units. */
export type Place = { x: number; y: number; s: number; label: boolean };
export type Box = { w: number; h: number; pad: number };

const center = (b: Shape["bbox"]) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

/** Geographic view: every shape at its real position, the whole set fit into the box. */
export function mapLayout(shapes: Shape[], box: Box): Map<string, Place> {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { bbox } of shapes) {
    x0 = Math.min(x0, bbox[0]);
    y0 = Math.min(y0, bbox[1]);
    x1 = Math.max(x1, bbox[2]);
    y1 = Math.max(y1, bbox[3]);
  }
  const s = Math.min(
    (box.w - 2 * box.pad) / (x1 - x0),
    (box.h - 2 * box.pad) / (y1 - y0),
  );
  const ox = (box.w - (x1 - x0) * s) / 2 - x0 * s;
  const oy = (box.h - (y1 - y0) * s) / 2 - y0 * s;
  const out = new Map<string, Place>();
  for (const sh of shapes) {
    const [cx, cy] = center(sh.bbox);
    out.set(sh.id, { x: ox + cx * s, y: oy + cy * s, s, label: false });
  }
  return out;
}

export const LABEL_H = 22;
const LABEL_MIN_W = 44;
const LABEL_MAX_W = 112;

/** Ancho que necesita el nombre en mayúsculas (9.5px, peso 500) para no cortarse; la etiqueta ocupa su celda. */
export const labelWidth = (name: string) =>
  Math.min(LABEL_MAX_W, Math.max(LABEL_MIN_W, Math.ceil(name.length * 6.4)));

type Row = { items: Shape[]; w: number; h: number; labeled: boolean };

function pack(order: Shape[], s: number, width: number, gap: number): Row[] {
  const rows: Row[] = [];
  let row: Row = { items: [], w: 0, h: 0, labeled: false };
  for (const sh of order) {
    const w = Math.max((sh.bbox[2] - sh.bbox[0]) * s, 1);
    const h = Math.max((sh.bbox[3] - sh.bbox[1]) * s, 1);
    const cell = Math.max(w, w >= LABEL_MIN_W ? labelWidth(sh.name) : 0);
    if (row.items.length && row.w + gap + cell > width) {
      rows.push(row);
      row = { items: [], w: 0, h: 0, labeled: false };
    }
    row.w += (row.items.length ? gap : 0) + cell;
    row.h = Math.max(row.h, h);
    row.labeled ||= w >= LABEL_MIN_W;
    row.items.push(sh);
  }
  if (row.items.length) rows.push(row);
  return rows;
}

const height = (rows: Row[], gap: number) =>
  rows.reduce((t, r) => t + r.h + (r.labeled ? LABEL_H : 0), 0) +
  gap * (rows.length - 1);

/**
 * Sorted view: shapes keep their true relative size (one scale for all) and flow into rows in the
 * given order, largest scale that still fits the box.
 */
export function gridLayout(order: Shape[], box: Box): Map<string, Place> {
  const width = box.w - 2 * box.pad;
  const gapFor = (s: number) => Math.max(4, Math.min(18, s * 6));
  let lo = 0.01;
  let hi = 20;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (
      height(pack(order, mid, width, gapFor(mid)), gapFor(mid)) <=
      box.h - 2 * box.pad
    )
      lo = mid;
    else hi = mid;
  }
  const s = lo;
  const gap = gapFor(s);
  const rows = pack(order, s, width, gap);
  const out = new Map<string, Place>();
  let y = box.pad + (box.h - 2 * box.pad - height(rows, gap)) / 2;
  for (const row of rows) {
    let x = box.pad + (width - row.w) / 2;
    for (const sh of row.items) {
      const w = (sh.bbox[2] - sh.bbox[0]) * s;
      const h = (sh.bbox[3] - sh.bbox[1]) * s;
      const label = w >= LABEL_MIN_W;
      const cell = Math.max(w, label ? labelWidth(sh.name) : 0);
      out.set(sh.id, { x: x + cell / 2, y: y + row.h - h / 2, s, label });
      x += cell + gap;
    }
    y += row.h + (row.labeled ? LABEL_H : 0) + gap;
  }
  return out;
}
