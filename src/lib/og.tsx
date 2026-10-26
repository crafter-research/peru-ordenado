import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { colorFor, rangeFor, toRgb } from "@/lib/color";
import { gridLayout, mapLayout } from "@/lib/layout";
import { type Selection, selectionTitle } from "@/lib/selection";
import { fichaRows } from "@/lib/ficha";
import { type Dataset, METRICS, type Metric, value } from "@/lib/shapes";

export const ogSize = { width: 1200, height: 630 };
const asset = (f: string) =>
  readFile(path.join(process.cwd(), "src", "assets", f));

let dataset: Promise<Dataset> | undefined;
const loadData = () => {
  dataset ??= readFile(
    path.join(process.cwd(), "public", "data", "shapes.json"),
  ).then((b) => JSON.parse(b.toString()));
  return dataset;
};

const STAGE = { w: 640, h: 590 };

/** 1200×630 card: wordmark and title on the left, the selected view drawn on the right. */
export async function ogImage(sel: Selection) {
  const [data, serif, serifItalic, sans, sansMedium] = await Promise.all([
    loadData(),
    asset("fraunces-latin-400-normal.ttf"),
    asset("fraunces-latin-300-italic.ttf"),
    asset("inter-latin-400-normal.ttf"),
    asset("inter-latin-500-normal.ttf"),
  ]);
  const shapes = data[sel.level];
  const box = { ...STAGE, pad: 16 };
  const places =
    sel.view === "mapa"
      ? mapLayout(shapes, box)
      : gridLayout(
          [...shapes].sort(
            (a, b) =>
              (value(b, sel.metric) ?? -1) - (value(a, sel.metric) ?? -1),
          ),
          box,
        );
  const range = rangeFor(shapes, sel.metric);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#f7f3ea",
        color: "#2a2520",
        fontFamily: "Inter",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 540,
          padding: "56px 0 52px 60px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 22,
            fontWeight: 500,
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="1" y="1" width="22" height="22" rx="7" fill="#e6e0d2" />
            <path
              d="M7 6h4v5H7zM13 6h4v3h-4zM13 11h4v7h-4zM7 13h4v5H7z"
              fill="#2f7a4a"
            />
          </svg>
          quipu
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Fraunces",
              fontSize: 66,
              lineHeight: 1,
            }}
          >
            Qui
            <span style={{ fontStyle: "italic", fontWeight: 300 }}>
              pu
            </span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              lineHeight: 1.35,
              color: "#5c544a",
              textTransform: "uppercase",
              letterSpacing: 1.5,
              maxWidth: 440,
            }}
          >
            {selectionTitle(sel, shapes.length)}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 17, color: "#857b6e" }}>
          Crafter Research · datos IGN, MEF y muniscan
        </div>
      </div>
      <svg
        width={STAGE.w}
        height={STAGE.h}
        viewBox={`0 0 ${STAGE.w} ${STAGE.h}`}
        style={{ marginTop: 20 }}
        aria-hidden="true"
      >
        {shapes.map((s) => {
          const p = places.get(s.id);
          if (!p) return null;
          const cx = (s.bbox[0] + s.bbox[2]) / 2;
          const cy = (s.bbox[1] + s.bbox[3]) / 2;
          return (
            <path
              key={s.id}
              d={s.d}
              fill={toRgb(colorFor(s, sel.metric, sel.level !== "dep", range))}
              transform={`translate(${(p.x - cx * p.s).toFixed(1)} ${(p.y - cy * p.s).toFixed(1)}) scale(${p.s.toFixed(4)})`}
            />
          );
        })}
      </svg>
    </div>,
    {
      ...ogSize,
      fonts: [
        { name: "Fraunces", data: serif, weight: 400, style: "normal" },
        { name: "Fraunces", data: serifItalic, weight: 300, style: "italic" },
        { name: "Inter", data: sans, weight: 400, style: "normal" },
        { name: "Inter", data: sansMedium, weight: 500, style: "normal" },
      ],
    },
  );
}

/** 1200×630 card for one place: its name, the one number that matters, and its shape. */
export async function ogPlace(id: string, metric: Metric) {
  const data = await loadData();
  const shape = [...data.dist, ...data.prov, ...data.dep].find((s) => s.id === id);
  if (!shape) return ogImage({ level: "dep", view: "mapa", metric: "area" });
  const [serif, sans, sansMedium] = await Promise.all([
    asset("fraunces-latin-400-normal.ttf"),
    asset("inter-latin-400-normal.ttf"),
    asset("inter-latin-500-normal.ttf"),
  ]);
  const name = (i: string) => data.dep.concat(data.prov).find((s) => s.id === i)?.name;
  const where = [
    shape.id.length === 6 ? name(shape.id.slice(0, 4)) : undefined,
    shape.id.length > 2 ? name(shape.dep) : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  const m = metric === "area" || value(shape, metric) !== undefined ? metric : "area";
  const [x0, y0, x1, y1] = shape.bbox;
  const k = Math.min(500 / (x1 - x0), 500 / (y1 - y0));
  const level = shape.id.length === 2 ? "dep" : shape.id.length === 4 ? "prov" : "dist";
  const rows = fichaRows(shape, data[level]);
  const fill = toRgb(colorFor(shape, m, false, rangeFor(data[level], m)));
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#f6eddf",
        color: "#3a2a1c",
        fontFamily: "Inter",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 650,
          padding: "52px 0 48px 64px",
        }}
      >
        <div style={{ display: "flex", fontSize: 22, fontWeight: 500, color: "#b5522b" }}>
          QUIPU · {METRICS[m].label}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: "Fraunces", fontSize: 74, lineHeight: 1 }}>
            {shape.name}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#7a6552", marginTop: 8 }}>
            {where}
          </div>
          <div style={{ display: "flex", gap: 30, marginTop: 34 }}>
            {rows.map((r) => (
              <div key={r.key} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontFamily: "Fraunces", fontSize: r.text === "sin dato" ? 22 : 46, lineHeight: 1.1, color: r.frac === null ? "#b7a48f" : "#b5522b" }}>
                  {r.text}
                </div>
                <div style={{ display: "flex", fontSize: 17, color: "#7a6552", marginTop: 4 }}>{r.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 18, color: "#857b6e" }}>
          Busca el tuyo · Crafter Research · datos abiertos del Estado
        </div>
      </div>
      <svg width="550" height="630" viewBox="0 0 550 630" aria-hidden="true">
        <path
          d={shape.d}
          fill={fill}
          stroke="#f6eddf"
          strokeWidth={2 / k}
          transform={`translate(${(275 - ((x0 + x1) / 2) * k).toFixed(1)} ${(315 - ((y0 + y1) / 2) * k).toFixed(1)}) scale(${k.toFixed(4)})`}
        />
      </svg>
    </div>,
    {
      ...ogSize,
      fonts: [
        { name: "Fraunces", data: serif, weight: 400, style: "normal" },
        { name: "Inter", data: sans, weight: 400, style: "normal" },
        { name: "Inter", data: sansMedium, weight: 500, style: "normal" },
      ],
    },
  );
}
