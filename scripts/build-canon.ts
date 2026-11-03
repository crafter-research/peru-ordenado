// Canon minero y regalía minera (MEF, transferencias 2025) a public/data/shapes.json. Entrada: data/canon-2025.json,
// generado por scripts/canon.py. `canon` = soles acreditados a la municipalidad (en provincias y departamentos, la suma
// de sus distritos). Sin fila = 0. Idempotente.
import type { Dataset, Shape } from "../src/lib/shapes";

const data: Dataset = await Bun.file("public/data/shapes.json").json();
const { canon }: { canon: Record<string, number> } = await Bun.file("data/canon-2025.json").json();

const code = (s: Shape) => (s.id.length === 2 ? `${s.id}0000` : s.id.length === 4 ? `${s.id}00` : s.id);
let n = 0;
for (const level of ["dep", "prov", "dist"] as const) {
  for (const s of data[level] as Shape[]) {
    s.canon = canon[code(s)] ?? 0;
    if (level === "dist" && s.canon > 0) n++;
  }
}
await Bun.write("public/data/shapes.json", JSON.stringify(data));
console.log(`canon: ${n} distritos de ${data.dist.length} con canon o regalía minera`);
