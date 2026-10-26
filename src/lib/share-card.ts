import type { FichaRow } from "@/lib/ficha";
import type { Shape } from "@/lib/shapes";

export type CardInput = {
  shape: Shape;
  /** "Provincia, Departamento" under the name. */
  where: string;
  /** The place's quipu: one thread per layer. */
  rows: FichaRow[];
  /** One plain sentence with the comparison against the country, if any. */
  line: string;
  question: string;
  fill: string;
  url: string;
};

const W = 1080;
const H = 1920;

function family(cls: string, fallback: string): string {
  const el = document.createElement("span");
  el.className = cls;
  document.body.appendChild(el);
  const f = getComputedStyle(el).fontFamily || fallback;
  el.remove();
  return f;
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** A 1080×1920 story card (Instagram / Facebook / WhatsApp status): the shape, one number, one sentence. */
export async function renderCard(c: CardInput): Promise<Blob> {
  await document.fonts?.ready;
  const display = family("font-display", "Georgia, serif");
  const sans = family("font-sans", "system-ui, sans-serif");
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("canvas");

  ctx.fillStyle = "#f6eddf";
  ctx.fillRect(0, 0, W, H);

  // The quipu: a main cord with hanging knotted strings, as a quiet frame.
  ctx.strokeStyle = "#b5522b";
  ctx.fillStyle = "#b5522b";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(60, 120);
  ctx.lineTo(W - 60, 120);
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const x = 120 + i * 80;
    const len = 40 + ((i * 37) % 70);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, 120);
    ctx.lineTo(x, 120 + len);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, 120 + len, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#3a2a1c";
  ctx.textAlign = "left";
  ctx.font = `600 34px ${sans}`;
  ctx.fillText("QUIPU", 80, 300);
  ctx.fillStyle = "#7a6552";
  ctx.font = `500 30px ${sans}`;
  ctx.fillText(c.question, 80, 348);

  // The shape, at its real proportions.
  const [x0, y0, x1, y1] = c.shape.bbox;
  const box = 520;
  const k = Math.min(box / (x1 - x0), box / (y1 - y0));
  ctx.save();
  ctx.translate(W / 2 - ((x0 + x1) / 2) * k, 650 - ((y0 + y1) / 2) * k);
  ctx.scale(k, k);
  ctx.fillStyle = c.fill;
  ctx.fill(new Path2D(c.shape.d));
  ctx.lineWidth = 2 / k;
  ctx.strokeStyle = "#f6eddf";
  ctx.stroke(new Path2D(c.shape.d));
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "#3a2a1c";
  ctx.font = `500 92px ${display}`;
  ctx.fillText(c.shape.name, W / 2, 1040);
  ctx.fillStyle = "#7a6552";
  ctx.font = `400 32px ${sans}`;
  ctx.fillText(c.where, W / 2, 1090);

  // The place as a quipu: a cord, and one thread per layer; the longer the thread, the higher it ranks.
  const top = 1160;
  ctx.strokeStyle = "#3a2a1c";
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(70, top);
  ctx.lineTo(W - 70, top);
  ctx.stroke();
  ctx.globalAlpha = 1;
  c.rows.forEach((r, i) => {
    const x = 150 + i * 195;
    const len = r.frac === null ? 36 : 60 + r.frac * 280;
    ctx.strokeStyle = "#3a2a1c";
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + len);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = r.frac === null ? "#c9b8a3" : "#b5522b";
    ctx.beginPath();
    ctx.arc(x, top + len, r.frac === null ? 9 : 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a2a1c";
    ctx.font = `500 ${r.text === "sin dato" ? 30 : 58}px ${display}`;
    ctx.fillText(r.text, x, 1580);
    ctx.fillStyle = "#7a6552";
    ctx.font = `400 25px ${sans}`;
    r.label.split(" ").forEach((w, k) => ctx.fillText(w, x, 1625 + k * 28));
  });

  // How to read the threads: the length is the rank among the districts, the number is the real figure.
  ctx.fillStyle = "#7a6552";
  ctx.font = `400 25px ${sans}`;
  ctx.fillText("Hilo largo = mejor puesto entre los distritos del país. El número es el dato real.", W / 2, 1700);

  ctx.fillStyle = "#5a4636";
  ctx.font = `400 34px ${sans}`;
  wrap(ctx, c.line, 880)
    .slice(0, 2)
    .forEach((l, i) => ctx.fillText(l, W / 2, 1755 + i * 44));

  ctx.fillStyle = "#3a2a1c";
  ctx.font = `600 36px ${sans}`;
  ctx.fillText(c.url.replace(/^https?:\/\//, ""), W / 2, 1850);
  ctx.fillStyle = "#7a6552";
  ctx.font = `400 28px ${sans}`;
  ctx.fillText("Busca el tuyo · datos abiertos del Estado", W / 2, 1886);

  return new Promise((res, rej) =>
    cv.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"),
  );
}
