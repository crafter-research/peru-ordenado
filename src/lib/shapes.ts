export type Shape = {
  id: string;
  name: string;
  dep: string;
  area: number;
  bbox: [number, number, number, number];
  d: string;
  /** Local-government investment (genérica 2.6), soles. Absent when MEF reports no budget. */
  inv?: { pim: number; dev: number };
  /** Gentilicio (huancavelicano, tambopatino); ausente si la fuente no lo trae. */
  gentilicio?: string;
  /**
   * quipu: avance del año en curso, inversión municipal (genérica 2.6). `dev` es el devengado
   * acumulado hasta el mes cerrado `hasta`; `devPrev`/`pimPrev` son lo mismo del año anterior.
   */
  avance?: {
    pim: number;
    dev: number;
    pimPrev: number;
    devPrev: number;
    hasta: number;
  };
  /**
   * Territorio (OSIPTEL, PCM, INGEMMET): centros poblados con y sin 4G, declaratorias de emergencia
   * 2017-2024 y zonas críticas inventariadas. `emerg`/`zonas` son sumas sobre `emergN`/`zonasN` distritos,
   * para poder promediar en provincias y departamentos.
   */
  terr?: {
    cp: number;
    cp4g: number;
    emerg: number;
    emergN: number;
    zonas: number;
    zonasN: number;
  };
  /** Habitantes según el Censo 2025 del INEI (censada más omitida). */
  pob?: number;
  /** Parte de `pob` que el INEI estima que quedó sin censar (omitida). */
  omit?: number;
  /** Personas de 3 y más años que usaron internet en los últimos 3 meses (Censo 2025) y la base censada. */
  net?: number;
  netBase?: number;
  /** muniscan digital-surface index 0–100 (provinces and departments: mean of their districts). */
  digital?: number;
  /**
   * Investment PIM by Jev category, soles. `unsure` is the PIM whose top category came with
   * probability below the confidence threshold.
   */
  mix?: { ornato: number; deporte: number; local: number; unsure: number };
};

export type Level = "dep" | "prov" | "dist";

export type Dataset = {
  width: number;
  height: number;
  sources: { geo: string; spend: string; quipu?: string; pob?: string };
} & Record<Level, Shape[]>;

export type Metric =
  | "area"
  | "poblacion"
  | "densidad"
  | "porHabitante"
  | "omision"
  | "internet"
  | "inversion"
  | "ejecucion"
  | "quipu"
  | "ornato"
  | "digital"
  | "cobertura"
  | "emergencias"
  | "zonas";

export const LEVELS: Record<Level, { label: string; plural: string }> = {
  dep: { label: "Departamento", plural: "departamentos" },
  prov: { label: "Provincia", plural: "provincias" },
  dist: { label: "Distrito", plural: "distritos" },
};

export const METRICS: Record<Metric, { label: string; title: string }> = {
  area: { label: "¿Qué tan grande es?", title: "ordenados por área (km²)" },
  poblacion: {
    label: "¿Cuánta gente vive ahí?",
    title: "ordenados por población (Censo 2025)",
  },
  densidad: {
    label: "¿Qué tan poblado está?",
    title: "ordenados por habitantes por km² (Censo 2025)",
  },
  porHabitante: {
    label: "¿Cuánto presupuesto para obras hay por habitante?",
    title: "ordenados por presupuesto de inversión de este año por habitante",
  },
  internet: {
    label: "¿Cuánta gente usa internet?",
    title: "ordenados por % de personas que usaron internet (Censo 2025)",
  },
  omision: {
    label: "¿Cuánta gente no fue censada?",
    title: "ordenados por % de población que quedó sin censar (Censo 2025)",
  },
  inversion: {
    label: "¿Cuánto presupuesto tiene para obras?",
    title: "ordenados por presupuesto de inversión municipal 2024",
  },
  ejecucion: {
    label: "¿Cuánto gastó de ese presupuesto? (2024)",
    title: "ordenados por % de inversión municipal ejecutada en 2024",
  },
  quipu: {
    label: "¿Cuánto lleva gastado este año?",
    title:
      "ordenados por cuánto de su presupuesto para obras ya gastaron en 2026",
  },
  ornato: {
    label: "¿Cuánto fue a plazas y parques?",
    title:
      "ordenados por % de la inversión municipal 2024 en plazas, parques y arcos",
  },
  digital: {
    label: "¿Qué tan digital es su municipalidad?",
    title: "ordenados por índice de superficie digital municipal (muniscan)",
  },
  cobertura: {
    label: "¿Llega la señal 4G?",
    title: "ordenados por % de centros poblados con señal 4G",
  },
  emergencias: {
    label: "¿Cuántas emergencias tuvo?",
    title:
      "ordenados por decretos de emergencia 2017-2024 (promedio por distrito)",
  },
  zonas: {
    label: "¿Hay zonas de derrumbes y huaicos?",
    title:
      "ordenados por zonas críticas por peligros geológicos (promedio por distrito inventariado)",
  },
};

/** Cómo leer cada vista, en palabras de todos los días. `{lugar}` = departamento, provincia o distrito. */
const GUIDE: Record<Metric, string> = {
  area:
    "Cada forma es un {lugar} del Perú dibujado a su tamaño real. Van de más grande a más chico. Los colores solo sirven para distinguir una región de otra.",
  poblacion:
    "Cada forma es un {lugar}. Cuántas personas viven ahí según el Censo 2025 del INEI. Más oscuro: más gente.",
  densidad:
    "Cada forma es un {lugar}. Cuántas personas viven por cada kilómetro cuadrado (Censo 2025 entre el área). Más oscuro: más apretado. Un distrito enorme y casi vacío sale claro aunque tenga mucha gente.",
  porHabitante:
    "Cada forma es un {lugar}. Cuántos soles de presupuesto para obras tiene este año por cada persona que vive ahí (Censo 2025). Más oscuro: más soles por persona. Un distrito pequeño con un proyecto grande sale oscuro sin que eso diga cómo está su gente.",
  internet:
    "Cada forma es un {lugar}. De cada 100 personas de 3 años o más que viven ahí, cuántas usaron internet en los últimos 3 meses según el Censo 2025. Más oscuro: más gente conectada. Es lo que la gente hace, no lo que hace su municipalidad.",
  omision:
    "Cada forma es un {lugar}. De cada 100 personas que viven ahí, cuántas el censo no logró contar y el INEI estimó aparte. Más oscuro: más gente sin censar, así que su cifra de población es menos segura.",
  inversion:
    "Cada forma es un {lugar}. Cuanto más oscuro el color, más presupuesto tiene la municipalidad para hacer obras (puentes, colegios, caminos, plazas) en 2024. Es el presupuesto del año, no de toda la vida.",
  ejecucion:
    "Cada forma es un {lugar}. Más oscuro: gastó casi todo el presupuesto que tenía para obras en 2024. Más claro: dejó mucho sin usar. Gastar poco no siempre es culpa de la municipalidad: hay obras que se retrasan por trámites.",
  quipu:
    "Cada forma es un {lugar}. Mide cuánto del presupuesto del año para obras ya se gastó hasta el último mes completo. Más oscuro: va avanzado. Más claro: va lento. Como el año aún no termina, compara con el mismo punto del año pasado.",
  ornato:
    "Cada forma es un {lugar}. De cada 100 soles que invirtió en 2024, cuántos fueron a plazas, parques, arcos y monumentos. Un programa automático lo calculó leyendo el nombre de cada obra: es una pista, no una auditoría.",
  digital:
    "Cada forma es un {lugar}. Mide qué tanta presencia digital declara su municipalidad en gob.pe, de 0 a 100 (índice muniscan). Más oscuro: más.",
  cobertura:
    "Cada forma es un {lugar}. De los pueblos y caseríos que tiene (centros poblados), qué parte recibe señal 4G de celular. Más oscuro: llega a más. Cuenta lugares, no personas.",
  emergencias:
    "Cada forma es un {lugar}. Cuántas veces el Gobierno declaró estado de emergencia por lluvias o sequía entre 2017 y 2024 (cada prórroga cuenta). Más oscuro: más emergencias.",
  zonas:
    "Cada forma es un {lugar}. Zonas que el INGEMMET marcó como peligrosas por derrumbes, huaicos o deslizamientos. Solo se han revisado unos 1,000 distritos; los demás aparecen en gris porque no hay dato, no porque estén libres de peligro.",
};

export const guide = (metric: Metric, level: Level) =>
  GUIDE[metric].replace(
    "{lugar}",
    ({ dep: "departamento", prov: "provincia", dist: "distrito" } as const)[
      level
    ],
  );

export const SOURCE: Record<Metric, string> = {
  area: "IGN",
  poblacion: "INEI",
  densidad: "INEI · IGN",
  porHabitante: "MEF 2026 · INEI",
  omision: "INEI",
  internet: "INEI",
  inversion: "MEF 2024",
  ejecucion: "MEF 2024",
  quipu: "MEF 2026 · quipu",
  ornato: "MEF + Jev",
  digital: "muniscan",
  cobertura: "OSIPTEL",
  emergencias: "PCM",
  zonas: "INGEMMET",
};

/** The parent id one level up: districts belong to provinces, provinces to departments. */
export function parentId(level: Level, id: string): string | undefined {
  if (level === "dist") return id.slice(0, 4);
  if (level === "prov") return id.slice(0, 2);
  return undefined;
}

/** Share of investment PIM Jev placed in a category with confidence; 1 when no Jev data applies. */
export function certainty(shape: Shape): number {
  if (!shape.mix || !shape.inv?.pim) return 1;
  return 1 - shape.mix.unsure / shape.inv.pim;
}

export function value(shape: Shape, metric: Metric): number | undefined {
  if (metric === "area") return shape.area;
  if (metric === "digital") return shape.digital;
  if (metric === "poblacion") return shape.pob;
  if (metric === "densidad")
    return shape.pob !== undefined && shape.area > 0 ? shape.pob / shape.area : undefined;
  if (metric === "porHabitante")
    return shape.pob && shape.avance?.pim ? shape.avance.pim / shape.pob : undefined;
  if (metric === "internet")
    return shape.netBase && shape.net !== undefined ? shape.net / shape.netBase : undefined;
  if (metric === "omision")
    return shape.pob && shape.omit !== undefined ? shape.omit / shape.pob : undefined;
  if (metric === "quipu")
    return shape.avance?.pim ? shape.avance.dev / shape.avance.pim : undefined;
  if (metric === "cobertura")
    return shape.terr?.cp ? shape.terr.cp4g / shape.terr.cp : undefined;
  if (metric === "emergencias")
    return shape.terr?.emergN ? shape.terr.emerg / shape.terr.emergN : undefined;
  if (metric === "zonas")
    return shape.terr?.zonasN ? shape.terr.zonas / shape.terr.zonasN : undefined;
  if (metric === "ornato")
    return shape.mix && shape.inv?.pim
      ? shape.mix.ornato / shape.inv.pim
      : undefined;
  if (!shape.inv) return undefined;
  if (metric === "inversion") return shape.inv.pim;
  return shape.inv.dev / shape.inv.pim;
}
