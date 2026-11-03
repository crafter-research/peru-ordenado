const int = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("es-PE", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export const km2 = (n: number) => `${int.format(n)} km²`;
export const soles = (n: number) => `S/ ${compact.format(n)}`;
export const pct = (r: number) => `${Math.round(r * 100)}%`;
export const count = (n: number) => int.format(n);
export const habitantes = (n: number) => `${int.format(n)} hab.`;
/** Parte sin censar: un decimal si es menos de 10 %. */
export const sinCensar = (r: number) => `${r < 0.1 ? (r * 100).toFixed(1) : Math.round(r * 100)} %`;
/** Habitantes por km²: un decimal si es menor de 10, entero si no. */
export const densidad = (n: number) => `${n < 10 ? n.toFixed(1) : int.format(n)} hab/km²`;
