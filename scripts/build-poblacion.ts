// Población proyectada (INEI, 30 de junio) a public/data/shapes.json. Entrada: data/poblacion-2025.json,
// generado por scripts/censo.py (Censo 2025). Distritos, provincias y departamentos traen su propia cifra oficial.
// Idempotente: se puede correr sin rehacer `data:build`.
import type { Dataset, Shape } from "../src/lib/shapes";

const data: Dataset = await Bun.file("public/data/shapes.json").json();
const { año, pob, omit }: { año: number; pob: Record<string, number>; omit: Record<string, number> } = await Bun.file(
  "data/poblacion-2025.json",
).json();

const code = (s: Shape) => (s.id.length === 2 ? `${s.id}0000` : s.id.length === 4 ? `${s.id}00` : s.id);
let n = 0;
for (const level of ["dep", "prov", "dist"] as const) {
  for (const s of data[level] as Shape[]) {
    const v = pob[code(s)];
    if (v === undefined) {
      delete s.pob;
      delete s.omit;
    } else {
      s.pob = v;
      s.omit = omit[code(s)];
      if (level === "dist") n++;
    }
  }
}
data.sources.pob = `INEI, Censos Nacionales ${año}: población total (censada y omitida)`;
await Bun.write("public/data/shapes.json", JSON.stringify(data));
const total = data.dep.reduce((t, d) => t + (d.pob ?? 0), 0);
console.log(`población ${año}: ${n} distritos de ${data.dist.length} · ${total.toLocaleString("es-PE")} habitantes`);
