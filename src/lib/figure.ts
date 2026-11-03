import { type Metric, type Shape, value } from "@/lib/shapes";

const de100 = (r: number) => Math.round(r * 100);

const UNITS: Partial<Record<Metric, string>> = {
  quipu: "de cada 100 soles de obras ya gastados este año",
  ejecucion: "de cada 100 soles de obras gastados en 2024",
  ornato: "de cada 100 soles de obras, en plazas y monumentos",
  cobertura: "de cada 100 pueblos tienen señal 4G",
  emergencias: "decretos de emergencia entre 2017 y 2024",
  zonas: "zonas críticas por peligros geológicos",
  digital: "puntos de 100 en presencia digital",
  poblacion: "habitantes (Censo 2025)",
  densidad: "habitantes por km² (Censo 2025)",
  porHabitante: "soles de presupuesto para obras por habitante este año",
  omision: "de cada 100 personas no fueron censadas",
  internet: "de cada 100 personas usaron internet",
};

/** The one big number for a place and criterion, with what it counts. Falls back to the size. */
export function figure(shape: Shape, metric: Metric): { big: string; unit: string } {
  const v = value(shape, metric);
  const unit = UNITS[metric];
  if (v !== undefined && unit) {
    const pctLike = ["quipu", "ejecucion", "ornato", "cobertura", "internet"].includes(metric);
    const big = pctLike
      ? String(de100(v))
      : metric === "poblacion" || (metric === "densidad" && v >= 10)
        ? Math.round(v).toLocaleString("es-PE")
        : metric === "porHabitante"
          ? Math.round(v).toLocaleString("es-PE")
          : metric === "omision"
            ? (v * 100).toFixed(1)
            : v.toFixed(metric === "digital" ? 0 : 1);
    return { big, unit };
  }
  if (metric === "inversion" && shape.inv?.pim)
    return {
      big: (shape.inv.pim / 1e6).toFixed(1),
      unit: "millones de soles para obras en 2024",
    };
  return {
    big: Math.round(shape.area).toLocaleString("es-PE"),
    unit: "km² de territorio",
  };
}
