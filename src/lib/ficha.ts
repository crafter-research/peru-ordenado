import { type Metric, type Shape, value } from "@/lib/shapes";

/** One thread of a place's quipu: what it measures, the figure, and how long it hangs (0–1). */
export type FichaRow = {
  key: Metric;
  label: string;
  text: string;
  /** Share of same-level places that sit below this one; null when there is no data. */
  frac: number | null;
};

const count = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

const ROWS: [Metric, string, (v: number) => string][] = [
  ["quipu", "Gasto", (v) => `${Math.round(v * 100)} %`],
  ["cobertura", "Señal 4G", (v) => `${Math.round(v * 100)} %`],
  ["emergencias", "Emergencias", count],
  ["zonas", "Zonas críticas", count],
  ["digital", "Presencia digital", (v) => String(Math.round(v))],
];

/** Every layer we have for a place, each compared with the places of its own level. */
export function fichaRows(shape: Shape, peers: Shape[]): FichaRow[] {
  return ROWS.map(([key, label, fmt]) => {
    const v = value(shape, key);
    if (v === undefined) return { key, label, text: "sin dato", frac: null };
    const all = peers.flatMap((p) => {
      const x = value(p, key);
      return x === undefined ? [] : [x];
    });
    const below = all.filter((x) => x < v).length;
    return {
      key,
      label,
      text: fmt(v),
      frac: all.length > 1 ? below / (all.length - 1) : 0.5,
    };
  });
}

/** How each criterion reads in a sentence: [when it ranks high, when it ranks low]. */
const SAYS: Partial<Record<Metric, [string, string]>> = {
  quipu: ["ha gastado más de su presupuesto para obras", "ha gastado menos de su presupuesto para obras"],
  cobertura: ["tiene más pueblos con señal 4G", "tiene menos pueblos con señal 4G"],
  emergencias: ["ha vivido más emergencias", "ha vivido menos emergencias"],
  zonas: ["tiene más zonas de derrumbes y huaicos", "tiene menos zonas de derrumbes y huaicos"],
  digital: ["tiene más presencia digital", "tiene menos presencia digital"],
  poblacion: ["tiene más habitantes", "tiene menos habitantes"],
  densidad: ["está más poblado por kilómetro cuadrado", "está menos poblado por kilómetro cuadrado"],
};

/**
 * The one thing that sets a place apart, in a sentence: the criterion where it sits furthest from the
 * middle of its peers, with the share of them it beats or trails. Null when there is nothing to compare.
 */
export function conclusion(shape: Shape, peers: Shape[], plural: string): string | null {
  let best: { metric: Metric; share: number; high: boolean } | null = null;
  for (const metric of Object.keys(SAYS) as Metric[]) {
    const v = value(shape, metric);
    if (v === undefined) continue;
    const all = peers.flatMap((p) => {
      const x = value(p, metric);
      return x === undefined ? [] : [x];
    });
    if (all.length < 20) continue;
    // Strictly below and strictly above: places that tie with this one are not "beaten" by it.
    const below = all.filter((x) => x < v).length / (all.length - 1);
    const above = all.filter((x) => x > v).length / (all.length - 1);
    const high = below >= above;
    const share = high ? below : above;
    if (!best || share > best.share) best = { metric, share, high };
  }
  const says = best && SAYS[best.metric];
  if (!best || !says || best.share < 0.5) return null;
  const n = Math.min(99, Math.max(1, Math.round(best.share * 100)));
  return `${best.high ? says[0] : says[1]} que ${n} de cada 100 ${plural} del país`;
}
