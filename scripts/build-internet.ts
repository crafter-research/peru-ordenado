// Uso de internet (Censo 2025) a public/data/shapes.json. Entrada: data/internet-2025.json, generado por
// scripts/censo-internet.py. `net` = personas de 3 y más años que usaron internet en los últimos 3 meses;
// `netBase` = personas de 3 y más años censadas. Idempotente.
import type { Dataset, Shape } from "../src/lib/shapes";

const data: Dataset = await Bun.file("public/data/shapes.json").json();
const { net }: { net: Record<string, [number, number]> } = await Bun.file("data/internet-2025.json").json();

const code = (s: Shape) => (s.id.length === 2 ? `${s.id}0000` : s.id.length === 4 ? `${s.id}00` : s.id);
let n = 0;
for (const level of ["dep", "prov", "dist"] as const) {
  for (const s of data[level] as Shape[]) {
    const v = net[code(s)];
    if (v === undefined) {
      delete s.net;
      delete s.netBase;
    } else {
      [s.netBase, s.net] = v;
      if (level === "dist") n++;
    }
  }
}
await Bun.write("public/data/shapes.json", JSON.stringify(data));
console.log(`internet: ${n} distritos de ${data.dist.length}`);
