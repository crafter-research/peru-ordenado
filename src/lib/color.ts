import { type Metric, type Shape, value } from "@/lib/shapes";

/** The one ramp: pale sand → deep terracotta. Every sequential scale in Quipu is this ramp. */
export function terracotta(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  return `oklch(${(0.84 - 0.32 * x).toFixed(3)} ${(0.05 + 0.11 * x).toFixed(3)} ${(75 - 40 * x).toFixed(1)})`;
}

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
};

/** Size view: no data to encode, so warm paper tones that only tell neighbours apart. */
export function departmentColor(shape: Shape, jitter: boolean): string {
  const n = Number.parseInt(shape.dep, 10) || 0;
  // Atlas colors: one clear hue per department, a touch lighter or darker for each province or district.
  const h = (n * 137.5) % 360;
  const l = 0.74 + ((n * 37) % 5) * 0.015;
  const dl = jitter ? (hash(shape.id) - 0.5) * 0.14 : 0;
  return `oklch(${(l + dl).toFixed(3)} 0.1 ${h.toFixed(1)})`;
}

export const NO_DATA = "oklch(0.6 0.005 60 / 0.35)";

/** Execution ratio 0..1. */
export const executionColor = (r: number) => terracotta(r);

/** Budget in soles on a log scale. */
export function budgetColor(pim: number, min: number, max: number): string {
  return terracotta(Math.log(pim / min) / Math.log(max / min));
}

/** Ornament share; 30% and above saturates. */
export const ornatoColor = (r: number) => terracotta(r / 0.3);

/** Cobertura 4G: 50% or more of the populated centers saturates. */
export const coverageColor = (r: number) => terracotta(r / 0.5);

/** Counts: `full` or more saturates. */
export const countColor = (v: number, full: number) => terracotta(v / full);

/** muniscan index over 20–70, where nearly every score falls. */
export const digitalColor = (v: number) => terracotta((v - 20) / 50);

/**
 * Avance of the year on a pale → deep terracotta ramp, stretched between the 5th and 95th percentile
 * of the shapes on screen: municipal spending clusters in a narrow band, so a fixed 0–100 scale
 * paints the whole country one color.
 */
export function quipuColor(r: number, [lo, hi]: [number, number]): string {
  const t = Math.max(0, Math.min(1, hi > lo ? (r - lo) / (hi - lo) : 0.5));
  return terracotta(t);
}

/** Color range for a metric over a set of shapes: percentiles of the ratio for quipu, PIM min/max otherwise. */
export function rangeFor(shapes: Shape[], metric: Metric): [number, number] {
  if (metric === "poblacion" || metric === "densidad" || metric === "porHabitante") {
    const v = shapes
      .flatMap((s) => {
        const x = value(s, metric);
        return x !== undefined && x > 0 ? [x] : [];
      })
      .sort((a, b) => a - b);
    if (v.length === 0) return [1, 10];
    const at = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    return [at(0.05), Math.max(at(0.95), at(0.05) * 2)];
  }
  if (metric === "quipu" || metric === "digital" || metric === "omision") {
    const v = shapes
      .flatMap((s) =>
        metric === "digital"
          ? s.digital === undefined ? [] : [s.digital]
          : metric === "omision"
            ? value(s, "omision") === undefined ? [] : [value(s, "omision") as number]
            : s.avance?.pim ? [s.avance.dev / s.avance.pim] : [],
      )
      .sort((a, b) => a - b);
    if (v.length === 0) return [0, 1];
    const at = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    return [at(0.05), at(0.95)];
  }
  const v = shapes.flatMap((s) => (s.inv ? [s.inv.pim] : []));
  return [Math.max(1, Math.min(...v)), Math.max(2, ...v)];
}

export function colorFor(
  shape: Shape,
  metric: Metric,
  jitter: boolean,
  range: [number, number],
): string {
  if (metric === "area") return departmentColor(shape, jitter);
  if (metric === "digital") {
    if (shape.digital === undefined) return NO_DATA;
    const [lo, hi] = range;
    // stretch the 5th–95th percentile over the ramp's 20–70 span
    const t = hi > lo ? Math.max(0, Math.min(1, (shape.digital - lo) / (hi - lo))) : 0.5;
    return digitalColor(20 + t * 50);
  }
  if (metric === "omision") {
    const v = value(shape, metric);
    return v === undefined ? NO_DATA : quipuColor(v, range);
  }
  if (metric === "poblacion" || metric === "densidad" || metric === "porHabitante") {
    const v = value(shape, metric);
    if (v === undefined) return NO_DATA;
    // People and density span orders of magnitude: a log scale between the 5th and 95th percentile.
    return terracotta(Math.log(Math.max(v, range[0]) / range[0]) / Math.log(range[1] / range[0]));
  }
  if (metric === "quipu")
    return shape.avance?.pim
      ? quipuColor(shape.avance.dev / shape.avance.pim, range)
      : NO_DATA;
  if (metric === "cobertura" || metric === "emergencias" || metric === "zonas") {
    const v = value(shape, metric);
    if (v === undefined) return NO_DATA;
    return metric === "cobertura"
      ? coverageColor(v)
      : countColor(v, metric === "emergencias" ? 9 : 6);
  }
  if (metric === "ornato")
    return shape.mix && shape.inv?.pim
      ? ornatoColor(shape.mix.ornato / shape.inv.pim)
      : NO_DATA;
  if (!shape.inv) return NO_DATA;
  if (metric === "ejecucion")
    return executionColor(shape.inv.dev / shape.inv.pim);
  return budgetColor(shape.inv.pim, range[0], range[1]);
}

/** `oklch(l c h[ / a])` → `rgb(...)`, for renderers without oklch support (satori). */
export function toRgb(color: string): string {
  const m = color.match(
    /oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/,
  );
  if (!m) return color;
  const [l, c, h] = [
    Number(m[1]),
    Number(m[2]),
    (Number(m[3]) * Math.PI) / 180,
  ];
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const [r, g, bl] = lin.map((x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, v)) * 255);
  });
  return m[4] ? `rgba(${r},${g},${bl},${m[4]})` : `rgb(${r},${g},${bl})`;
}

export type Oklch = [l: number, c: number, h: number, a: number];

export function parseOklch(color: string): Oklch {
  const m = color.match(
    /oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/,
  );
  return m
    ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : 1]
    : [0.6, 0, 0, 1];
}

/** Interpolates in OKLCH along the shorter hue arc, so a palette change reads as a blend. */
export function mixOklch(a: Oklch, b: Oklch, t: number): string {
  let dh = b[2] - a[2];
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const l = a[0] + (b[0] - a[0]) * t;
  const c = a[1] + (b[1] - a[1]) * t;
  const h = (a[2] + dh * t + 360) % 360;
  const al = a[3] + (b[3] - a[3]) * t;
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)} / ${al.toFixed(3)})`;
}
