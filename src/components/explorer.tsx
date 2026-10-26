"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AboutDialog } from "@/components/about-dialog";
import { FichaQuipu } from "@/components/ficha-quipu";
import { PlaceFinder } from "@/components/place-finder";
import { ShareMenu } from "@/components/share-menu";
import { SiteHeader } from "@/components/site-header";
import { Stage, sortShapes, valueLabel } from "@/components/stage";
import {
  budgetColor,
  colorFor,
  rangeFor,
  countColor,
  coverageColor,
  digitalColor,
  executionColor,
  NO_DATA,
  ornatoColor,
  quipuColor,
  terracotta,
} from "@/lib/color";
import { count, densidad, habitantes, km2, pct, soles } from "@/lib/format";
import {
  parseSelection,
  type Selection,
  selectionTitle,
} from "@/lib/selection";
import {
  certainty,
  type Dataset,
  guide,
  LEVELS,
  type Level,
  METRICS,
  type Metric,
  type Shape,
  SOURCE,
  value,
} from "@/lib/shapes";
import { conclusion, fichaRows } from "@/lib/ficha";
import { figure } from "@/lib/figure";
import { buildStory, type Step } from "@/lib/story";

type Hit = { shape: Shape; level: Level; x: number; y: number };

export function Explorer() {
  const [data, setData] = useState<Dataset | null>(null);
  const [sel, setSel] = useState<Selection>({
    level: "dep",
    view: "mapa",
    metric: "quipu",
  });
  const [pick, setPick] = useState<string | null>(null);
  const [vs, setVs] = useState<string | null>(null);
  const [allNames, setAllNames] = useState(false);
  const [hit, setHit] = useState<Hit | null>(null);
  const [video, setVideo] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [touched, setTouched] = useState(false);
  // Under 1024px the place card is a sheet over the bottom of the map.
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 1023px)");
    const on = () => setPhone(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const rest = parseSelection(q);
    const v = q.has("video");
    setAllNames(q.get("nombres") === "todos");
    const lugar = q.get("lugar");
    if (lugar && /^\d{2}(\d{2}(\d{2})?)?$/.test(lugar)) {
      setPick(lugar);
      const other = q.get("vs");
      if (other && /^\d{2}(\d{2}(\d{2})?)?$/.test(other)) setVs(other);
      rest.dep = lugar.slice(0, 2);
      rest.level = lugar.length === 2 ? "dep" : lugar.length === 4 ? "prov" : "dist";
      rest.view = "ordenado";
      setTouched(true);
    }
    setSel((s) => ({
      ...s,
      ...Object.fromEntries(Object.entries(rest).filter(([, x]) => x)),
    }));
    setVideo(Boolean(v));
    setReady(true);
    fetch("/data/shapes.json")
      .then((r) => r.json())
      .then(setData);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams(window.location.search);
    q.set("nivel", sel.level);
    q.set("vista", sel.view);
    q.set("orden", sel.metric);
    if (sel.dep) q.set("dep", sel.dep);
    else q.delete("dep");
    if (allNames) q.set("nombres", "todos");
    else q.delete("nombres");
    if (pick) q.set("lugar", pick);
    else q.delete("lugar");
    if (pick && vs) q.set("vs", vs);
    else q.delete("vs");
    window.history.replaceState(null, "", `?${q}`);
  }, [sel, ready, allNames, pick, vs]);

  const story = useMemo(() => (data ? buildStory(data) : []), [data]);

  const goTo = useCallback(
    (i: number | null) => {
      setStep(i);
      setPaused(false);
      setTouched(true);
      if (i !== null && story[i]) setSel(story[i].sel);
    },
    [story],
  );

  // Video mode loops the story with its captions, ready to screen-record.
  useEffect(() => {
    if (video && story.length) goTo(0);
  }, [video, story, goTo]);

  const next = () => {
    if (step === null) return;
    if (step + 1 < story.length) goTo(step + 1);
    else if (video) goTo(0);
    else setPaused(true);
  };

  const choose = (n: Partial<Selection>) => {
    setPick(null);
    setVs(null);
    setStep(null);
    setTouched(true);
    setSel((s) => ({ ...s, ...n }));
  };

  // A single department, when one is chosen: provinces and districts are those inside it.
  const scope = useMemo(
    () => (data && sel.dep ? inDepartment(data, sel.dep) : data),
    [data, sel.dep],
  );
  const shapes = scope?.[sel.level] ?? [];
  const title = selectionTitle(sel, shapes.length);

  const ranked = useMemo(
    () =>
      sortShapes(shapes, sel.metric).filter(
        (s) => value(s, sel.metric) !== undefined,
      ),
    [shapes, sel.metric],
  );
  const withData = sel.metric === "area" ? shapes.length : ranked.length;

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of ["dep", "prov"] as const)
      for (const s of data?.[l] ?? []) m.set(s.id, s.name);
    return m;
  }, [data]);

  const depName = sel.dep ? names.get(sel.dep) : undefined;

  // "Mi lugar": a district, province or department the visitor looked up or arrived at by link.
  const pickShape = useMemo(() => {
    if (!data || !pick) return undefined;
    return [...data.dist, ...data.prov, ...data.dep].find((s) => s.id === pick);
  }, [data, pick]);
  // On a phone the card is a sheet over the lower half: bring the map to the top so the place stays in view.
  const pickId = pickShape?.id;
  useEffect(() => {
    if (!phone || !pickId) return;
    document.querySelector("main section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [phone, pickId]);
  const vsShape = useMemo(() => {
    if (!data || !vs) return undefined;
    return [...data.dist, ...data.prov, ...data.dep].find((s) => s.id === vs);
  }, [data, vs]);
  const highlight = useMemo(
    () =>
      step !== null
        ? story[step]?.highlight
        : pickShape
          ? [pickShape.id, ...(vsShape ? [vsShape.id] : [])]
          : undefined,
    [step, story, pickShape, vsShape],
  );
  const goToPlace = (s: Shape) => {
    setStep(null);
    setTouched(true);
    setPick(s.id);
    setVs(null);
    setSel((x) => ({
      ...x,
      dep: s.dep,
      level: s.id.length === 2 ? "dep" : s.id.length === 4 ? "prov" : "dist",
      view: "ordenado",
    }));
  };
  const headline = useMemo(() => {
    if (!data) return undefined;
    const here = countryText(scope ?? data, "quipu");
    if (!here) return undefined;
    const all = countryText(data, "quipu");
    return { here, all };
  }, [data, scope]);
  // Naming every district of the country cannot fit; one department (or provinces, departments) can.
  const canNameAll = sel.view === "ordenado" && (sel.level !== "dist" || !!sel.dep);
  const namesAll = allNames && canNameAll;

  const stage = (
    <section
      className={
        video
          ? "relative mx-auto aspect-[4/5] h-[min(100dvh,125vw)] overflow-hidden bg-background"
          : `glass glass-border relative order-1 overflow-hidden rounded-3xl transition-[min-height] duration-700 sm:min-h-[80vh] lg:order-none lg:min-h-0 ${step !== null ? "min-h-[175vw]" : "min-h-[125vw]"}`
      }
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 px-4 pt-4 text-center sm:pt-5">
        <p className="text-[13px] font-semibold tracking-[0.18em] text-foreground">
          {depName ? depName.toUpperCase() : "PERÚ"}
        </p>
        <p
          key={title}
          className="text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
        >
          {title}
        </p>
      </div>
      <div
        className={`absolute inset-x-0 top-20 transition-[bottom] duration-700 ease-smooth sm:top-16 ${
          step !== null
            ? "bottom-60 sm:bottom-44"
            : !touched
              ? "bottom-28"
              : "bottom-10"
        }`}
      >
        {scope ? (
          <Stage
            key={`${sel.dep ?? "peru"}-${namesAll}`}
            allNames={namesAll}
            data={scope}
            level={sel.level}
            view={sel.view}
            metric={sel.metric}
            label={`Mapa del Perú: ${title}`}
            highlight={highlight}
            zoom={step === null && !!pickShape && !vsShape}
            lift={phone && pickShape ? 0.04 : 0}
            onHover={setHit}
          />
        ) : (
          <div className="grid size-full place-items-center text-[12px] text-muted-foreground">
            Cargando {count(1873)} distritos del mapa…
          </div>
        )}
        {hit && (
          <Tooltip
            hit={hit}
            metric={sel.metric}
            names={names}
            rank={ranked.findIndex((s) => s.id === hit.shape.id) + 1}
            total={ranked.length}
            country={data ? countryText(data, sel.metric) : undefined}
          />
        )}
      </div>
      {step === null && (
        <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center">
          <Scrubber level={sel.level} onChange={(level) => choose({ level })} />
        </div>
      )}
      {step !== null && story[step] && (
        <StoryCard
          key={step}
          index={step}
          steps={story}
          paused={paused}
          video={video}
          onPause={() => setPaused((p) => !p)}
          onGo={goTo}
          onDone={next}
        />
      )}
      {step === null && !touched && data && (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex justify-center px-4 sm:justify-start sm:px-6">
          <div className="glass glass-border animate-in pointer-events-auto flex max-w-[26rem] flex-col gap-3 rounded-3xl p-3 sm:p-4">
            <p className="hidden text-[13.5px] leading-snug text-foreground sm:block">
              <strong className="font-medium">Cada pieza es un lugar real.</strong>{" "}
              Un distrito, una provincia o un departamento, dibujado a su
              tamaño. Escribe dónde vives y mira cuánto gastó tu municipalidad,
              si ahí llega el 4G y cuántas emergencias vivieron.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => goTo(0)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-foreground px-3 py-2 text-[13px] font-medium text-background transition hover:opacity-90"
              >
                <PlayIcon /> Recorrido de 1 min
              </button>
              <button
                type="button"
                onClick={() => {
                  setTouched(true);
                  document.getElementById("lugar")?.focus();
                }}
                className="flex-1 rounded-xl border border-border px-3 py-2 text-[13px] transition hover:border-foreground/30"
              >
                Buscar mi distrito
              </button>
            </div>
          </div>
        </div>
      )}
      {step === null && touched && !hit && (
        <p className="pointer-events-none absolute bottom-4 left-5 z-10 hidden text-[11px] text-muted-foreground sm:block">
          Pasa el cursor sobre una forma para ver sus datos
        </p>
      )}
    </section>
  );

  if (video)
    return (
      <main className="grid min-h-dvh place-items-center bg-background">
        {stage}
      </main>
    );

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader about={<AboutDialog sources={data?.sources} />} />
      <main className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-4 lg:min-h-0 lg:flex-none px-3 pb-3 sm:px-5 lg:h-[calc(100dvh-3.75rem)] lg:grid-cols-[minmax(20rem,23rem)_1fr] lg:grid-rows-[minmax(0,1fr)]">
        <aside className="contents lg:flex lg:min-h-0 lg:flex-col lg:gap-5 lg:overflow-y-auto lg:pt-8 lg:pr-1">
          <div className="relative z-40 order-first pt-3 lg:pt-0">
            <h1 className="font-display text-5xl leading-[0.95] tracking-[-0.02em] sm:text-6xl">
              Qui<em className="font-light">pu</em>
            </h1>
            {!pickShape && (
              <p className="mt-3 hidden max-w-sm text-[14px] leading-relaxed text-muted-foreground sm:block">
                ¿De qué distrito eres? Mira cuánto gastó en obras, su cobertura
                4G y sus emergencias.
              </p>
            )}
            {headline && !pickShape && (
              <div className="mt-5 max-w-sm">
                <p className="flex items-baseline gap-2.5">
                  <span className="font-display text-[64px] leading-none tracking-[-0.03em] text-accent">
                    {headline.here.match(/^\d+/)?.[0]}
                  </span>
                  <span className="text-[15px] text-foreground">
                    de cada 100 soles
                  </span>
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  es lo que han gastado los municipios de{" "}
                  {depName ?? "todo el Perú"} de su presupuesto para obras este año.
                  {depName && headline.all
                    ? ` El país va en ${headline.all.replace(" de cada 100", "")}.`
                    : ""}{" "}
                  ¿Y el tuyo?
                </p>
              </div>
            )}
            <div className="mt-4 max-w-sm">
              <PlaceFinder data={data} names={names} onPick={goToPlace} />
            </div>
            <div className="-mx-3 mt-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:mt-4 sm:max-w-sm sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">
              {CHIPS.map(([m, label]) => (
                <Chip
                  key={m}
                  on={sel.metric === m}
                  onClick={() => choose({ metric: m, view: "ordenado" })}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </div>
          {pickShape && (
            <PlaceCard
              shape={pickShape}
              metric={sel.metric}
              names={names}
              country={data ? countryText(data, sel.metric) : undefined}
              range={rangeFor(
                data?.[pickShape.id.length === 2 ? "dep" : pickShape.id.length === 4 ? "prov" : "dist"] ?? [],
                sel.metric,
              )}
              peers={data?.[levelOf(pickShape.id)] ?? []}
              other={vsShape}
              otherPeers={vsShape ? (data?.[levelOf(vsShape.id)] ?? []) : []}
              data={data}
              onCompare={(s) => setVs(s.id)}
              onClearCompare={() => setVs(null)}
              onClose={() => {
                setPick(null);
                setVs(null);
              }}
            />
          )}

          <div className="glass glass-border order-2 flex flex-col gap-4 rounded-3xl p-4 lg:order-none">
            <Field label="Nivel">
              <Segmented
                value={sel.level}
                options={[
                  ["dep", "Departamentos"],
                  ["prov", "Provincias"],
                  ["dist", "Distritos"],
                ]}
                onChange={(level) => choose({ level })}
              />
            </Field>
            <Legend metric={sel.metric} shapes={shapes} />
            <details className="group -mt-1">
              <summary className="cursor-pointer list-none text-[12px] text-muted-foreground transition hover:text-foreground">
                ¿Cómo se lee? <span className="inline-block transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {guide(sel.metric, sel.level)}{" "}
                <span className="text-[11px]">Fuente: {SOURCE[sel.metric]}.</span>
              </p>
            </details>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => (step === null ? goTo(0) : goTo(null))}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-foreground px-3 py-2.5 text-[13px] font-medium text-background transition hover:opacity-90"
              >
                {step === null ? (
                  <>
                    <PlayIcon /> Recorrido de 1 min
                  </>
                ) : (
                  "Salir del recorrido"
                )}
              </button>
              <ShareButton title={title} />
            </div>
            <details className="group border-t border-border pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[12px] text-muted-foreground transition hover:text-foreground">
                Más opciones
                <span className="transition group-open:rotate-45">+</span>
              </summary>
              <div className="mt-3 flex flex-col gap-4">
                <Field label="Vista">
                  <Segmented
                    value={sel.view}
                    options={[
                      ["mapa", "Mapa"],
                      ["ordenado", "Ordenado"],
                    ]}
                    onChange={(view) => choose({ view })}
                  />
                </Field>
                <Field label="Departamento">
                  <select
                    value={sel.dep ?? ""}
                    onChange={(e) =>
                      choose({ dep: e.target.value || undefined })
                    }
                    className="rounded-xl border border-border bg-foreground/[0.03] px-3 py-2 text-[13px] text-foreground"
                  >
                    <option value="">Todo el Perú</option>
                    {[...(data?.dep ?? [])]
                      .sort((a, b) => a.name.localeCompare(b.name, "es"))
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Nombres">
                  <Segmented
                    value={namesAll ? "todos" : "algunos"}
                    options={[
                      ["algunos", "Los grandes"],
                      ["todos", "Todos"],
                    ]}
                    onChange={(v) => {
                      if (v === "todos" && !canNameAll) {
                        choose({
                          view: "ordenado",
                          level:
                            sel.level === "dist" && !sel.dep
                              ? "prov"
                              : sel.level,
                        });
                      }
                      setAllNames(v === "todos");
                    }}
                  />
                </Field>
                <Field label="Otros criterios">
                  <div className="flex flex-wrap gap-1.5">
                    {MORE_CHIPS.map(([m, label]) => (
                      <Chip
                        key={m}
                        on={sel.metric === m}
                        onClick={() => choose({ metric: m, view: "ordenado" })}
                      >
                        {label}
                      </Chip>
                    ))}
                  </div>
                </Field>
              </div>
            </details>
          </div>

          {data && ranked.length > 0 && (
            <div className="order-3 grid grid-cols-2 gap-3 text-[12.5px] lg:order-none">
              <Extremes
                title="Arriba"
                shapes={ranked.slice(0, 5)}
                metric={sel.metric}
              />
              <Extremes
                title="Abajo"
                shapes={ranked.slice(-5).reverse()}
                metric={sel.metric}
              />
              {sel.metric !== "area" && (
                <p className="col-span-2 text-[11px] leading-relaxed text-muted-foreground">
                  {count(withData)} de {count(shapes.length)}{" "}
                  {LEVELS[sel.level].plural} con datos para este criterio.
                </p>
              )}
            </div>
          )}
        </aside>
        {stage}
      </main>
    </div>
  );
}

/** Card for the looked-up place: plain sentence, and the ways to share it. */
function PlaceCard({
  shape,
  metric,
  names,
  country,
  range,
  peers,
  other,
  otherPeers,
  data,
  onCompare,
  onClearCompare,
  onClose,
}: {
  shape: Shape;
  metric: Metric;
  names: Map<string, string>;
  country?: string;
  range: [number, number];
  peers: Shape[];
  other?: Shape;
  otherPeers: Shape[];
  data: Dataset | null;
  onCompare: (s: Shape) => void;
  onClearCompare: () => void;
  onClose: () => void;
}) {
  const rows = useMemo(() => fichaRows(shape, peers), [shape, peers]);
  const otherRows = useMemo(
    () => (other ? fichaRows(other, otherPeers) : []),
    [other, otherPeers],
  );
  const fig = figure(shape, metric);
  const said = useMemo(
    () => conclusion(shape, peers, LEVELS[levelOf(shape.id)].plural),
    [shape, peers],
  );
  const has = value(shape, metric) !== undefined || metric === "area";
  const m = has ? metric : "area";
  // "provincia de Huancavelica, Huancavelica" never reads as a repeated name.
  const where = [
    shape.id.length === 6 && names.get(shape.id.slice(0, 4))
      ? `provincia de ${names.get(shape.id.slice(0, 4))}`
      : undefined,
    shape.id.length > 2 ? names.get(shape.dep) : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  const main = sentence(shape, m);
  const line = [main, country && has ? `El país en conjunto: ${country}.` : ""]
    .filter(Boolean)
    .join(" ");
  const url = `${window.location.origin}/?lugar=${shape.id}&orden=${m}${other ? `&vs=${other.id}` : ""}`;
  const text = other
    ? `${shape.name} frente a ${other.name}: mira cómo les va en gasto, 4G y emergencias en Quipu:`
    : `${shape.name}${shape.gentilicio ? ` (${shape.gentilicio})` : ""}: ${fig.big} ${fig.unit}. Mira el tuyo en Quipu:`;
  const level = shape.id.length === 2 ? "dep" : shape.id.length === 4 ? "prov" : "dist";
  // "Puesto 1,540 de 1,873 distritos en gasto": where this place sits among its level, for the chosen question.
  const rankText = useMemo(() => {
    const mine = value(shape, m);
    if (mine === undefined || m === "area") return "";
    const all = peers.flatMap((p) => {
      const v = value(p, m);
      return v === undefined ? [] : [v];
    });
    const puesto = all.filter((v) => v > mine).length + 1;
    const nombre = CHIPS.find(([k]) => k === m)?.[1].toLowerCase() ?? "";
    const pais = `Puesto ${count(puesto)} de ${count(all.length)} ${LEVELS[level].plural} del país${nombre ? ` en ${nombre}` : ""}`;
    if (level === "dep") return pais;
    const own = peers.filter((p) => p.dep === shape.dep);
    const vals = own.flatMap((p) => {
      const v = value(p, m);
      return v === undefined ? [] : [v];
    });
    const aqui = vals.filter((v) => v > mine).length + 1;
    return `${pais}. En ${names.get(shape.dep) ?? "su departamento"}: puesto ${count(aqui)} de ${count(vals.length)}`;
  }, [shape, m, peers, level, names]);
  return (
    <div className="glass glass-border animate-in order-2 flex flex-col gap-3 rounded-3xl p-4 max-lg:glass-solid max-lg:fixed max-lg:inset-x-2 max-lg:bottom-2 max-lg:z-50 max-lg:max-h-[42dvh] max-lg:overflow-y-auto max-lg:shadow-2xl max-lg:[&>*]:shrink-0 lg:order-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase">
            {LEVELS[level].label}
          </p>
          <p className="font-display text-[26px] leading-tight">{shape.name}</p>
          {where && (
            <p className="text-[12px] text-muted-foreground">{where}</p>
          )}
          {shape.gentilicio && (
            <p className="text-[12px] text-muted-foreground italic">
              {shape.gentilicio}
            </p>
          )}
          {shape.pob !== undefined && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              {habitantes(shape.pob)} · {densidad(shape.pob / shape.area)}
              <span className="text-muted-foreground/70"> (INEI, 2025)</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="rounded-lg px-2 py-1 text-muted-foreground transition hover:bg-foreground/5"
        >
          ×
        </button>
      </div>
      {said && (
        <p className="font-display text-[17px] leading-snug">
          <span className="text-muted-foreground">Su quipu cuenta: </span>
          {said}.
        </p>
      )}
      <FichaQuipu rows={rows} />
      <p className="-mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
        {rankText ? `${rankText}. ` : ""}El largo del hilo no es el número: es
        el puesto entre los {LEVELS[level].plural} (más largo, mejor puesto). El
        número de abajo es el dato real.
      </p>
      <details className="group -mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
        <summary className="cursor-pointer list-none transition hover:text-foreground">
          ¿Qué mide cada hilo? <span className="inline-block transition group-open:rotate-45">+</span>
        </summary>
        <ul className="mt-1.5 flex flex-col gap-1">
          <li><b className="font-medium text-foreground/80">Gasto:</b> cuánto del presupuesto para obras de este año ya se gastó.</li>
          <li><b className="font-medium text-foreground/80">Señal 4G:</b> de sus pueblos y caseríos, cuántos tienen señal 4G de celular. Cuenta lugares, no personas.</li>
          <li><b className="font-medium text-foreground/80">Emergencias:</b> veces que el Gobierno declaró estado de emergencia entre 2017 y 2024.</li>
          <li><b className="font-medium text-foreground/80">Zonas críticas:</b> zonas con peligro de derrumbes, huaicos o deslizamientos (INGEMMET).</li>
          <li><b className="font-medium text-foreground/80">Presencia digital:</b> puntos de 0 a 100 de <a href="https://muniscan.crafter.ing" target="_blank" rel="noreferrer" className="underline underline-offset-4">muniscan</a> (Crafter Research): qué tanto usa su municipalidad las plataformas del Estado y qué sistemas propios tiene. 100 es la mejor del país, no un puntaje perfecto.</li>
        </ul>
      </details>
      {other ? (
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <p className="font-display text-[22px] leading-tight">
              {other.name}
            </p>
            <button
              type="button"
              onClick={onClearCompare}
              aria-label="Quitar comparación"
              className="rounded-lg px-2 py-1 text-muted-foreground transition hover:bg-foreground/5"
            >
              ×
            </button>
          </div>
          <FichaQuipu rows={otherRows} />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <p className="text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase">
            Compáralo con otro
          </p>
          <PlaceFinder
            id="comparar"
            data={data}
            names={names}
            onPick={onCompare}
            placeholder="Escribe otro distrito"
          />
        </div>
      )}
      {line && !other && (
        <p className="text-[12.5px] leading-relaxed text-foreground/80">
          {line}
        </p>
      )}
      {!other && (
        <img
          src={`/og?lugar=${shape.id}&orden=${m}`}
          alt={`Imagen para compartir: ${shape.name}`}
          width={1200}
          height={630}
          loading="lazy"
          className="w-full rounded-xl border border-border"
        />
      )}
      <ShareMenu
        card={{
          shape,
          where: where || LEVELS[level].label,
          rows,
          line,
          question: METRICS[m].label,
          fill: colorFor(shape, m, false, range),
        }}
        text={text}
        url={url}
      />
    </div>
  );
}

const CHIPS: [Metric, string][] = [
  ["quipu", "Gasto"],
  ["cobertura", "Señal 4G"],
  ["emergencias", "Emergencias"],
  ["zonas", "Zonas críticas"],
  ["digital", "Digital"],
  ["poblacion", "Población"],
  ["densidad", "Densidad"],
  ["area", "Tamaño"],
];
const MORE_CHIPS: [Metric, string][] = [
  ["inversion", "Presupuesto 2024"],
  ["ejecucion", "Gasto 2024"],
  ["ornato", "Plazas y monumentos"],
];

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="rounded-full border border-border px-3 py-1.5 text-[12.5px] transition hover:border-foreground/30 aria-pressed:border-transparent aria-pressed:bg-foreground aria-pressed:text-background"
    >
      {children}
    </button>
  );
}

const levelOf = (id: string): Level =>
  id.length === 2 ? "dep" : id.length === 4 ? "prov" : "dist";

function PlayIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" />
    </svg>
  );
}

/** One story step: caption, segmented progress that advances on its own, and transport controls. */
function StoryCard({
  index,
  steps,
  paused,
  video,
  onPause,
  onGo,
  onDone,
}: {
  index: number;
  steps: Step[];
  paused: boolean;
  video: boolean;
  onPause: () => void;
  onGo: (i: number | null) => void;
  onDone: () => void;
}) {
  const s = steps[index];
  // Motion takes ~1 s; then just enough time to read the caption.
  const ms = 1800 + (s.title.length + s.body.length) * 18;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") onGo(Math.min(index + 1, steps.length - 1));
      if (e.key === "ArrowLeft") onGo(Math.max(index - 1, 0));
      if (e.key === " ") {
        e.preventDefault();
        onPause();
      }
      if (e.key === "Escape") onGo(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, steps.length, onGo, onPause]);
  return (
    <div className="absolute inset-x-3 bottom-3 z-20 sm:inset-x-5 sm:bottom-5">
      <div className="glass glass-solid glass-border animate-in rounded-3xl p-4 sm:p-5">
        <div className="flex gap-1" aria-hidden="true">
          {steps.map((x, i) => (
            <span
              key={x.title}
              className="h-[3px] flex-1 overflow-hidden rounded-full bg-foreground/12"
            >
              {i < index && (
                <span className="block h-full w-full bg-foreground" />
              )}
              {i === index && (
                <span
                  className="story-fill block h-full bg-foreground"
                  style={{
                    ["--story-ms" as string]: `${ms}ms`,
                    animationDuration: `${ms}ms`,
                    animationPlayState: paused ? "paused" : "running",
                  }}
                  onAnimationEnd={onDone}
                />
              )}
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium tracking-[0.08em] text-accent uppercase">
              {index + 1}/{steps.length} · {s.kicker}
            </p>
            <h2 className="mt-1 font-display text-[22px] leading-tight sm:text-2xl">
              {s.title}
            </h2>
            <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-foreground/80">
              {s.body}
            </p>
          </div>
          {!video && (
            <div className="flex shrink-0 items-center gap-1.5">
              <TransportButton
                label="Paso anterior"
                disabled={index === 0}
                onClick={() => onGo(index - 1)}
              >
                <path d="M15 6 9 12l6 6" />
              </TransportButton>
              <TransportButton
                label={paused ? "Continuar" : "Pausar"}
                onClick={onPause}
              >
                {paused ? (
                  <path d="M8 5v14l11-7Z" />
                ) : (
                  <path d="M9 5v14M15 5v14" />
                )}
              </TransportButton>
              <TransportButton
                label="Paso siguiente"
                disabled={index === steps.length - 1}
                onClick={() => onGo(index + 1)}
              >
                <path d="m9 6 6 6-6 6" />
              </TransportButton>
              <button
                type="button"
                onClick={() => onGo(null)}
                className="ml-auto rounded-lg px-2.5 sm:ml-2 py-1.5 text-[12.5px] text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
              >
                {index === steps.length - 1 ? "Explorar" : "Saltar"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TransportButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg border border-border text-foreground/85 transition hover:border-foreground/20 disabled:opacity-35"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const url = window.location.href;
        if (navigator.share) {
          await navigator
            .share({ title: "Quipu", text: title, url })
            .catch(() => {});
          return;
        }
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="rounded-xl border border-border px-3 py-2.5 text-[13px] transition hover:border-foreground/20"
    >
      {copied ? "Copiado" : "Compartir"}
    </button>
  );
}

function inDepartment(data: Dataset, dep: string): Dataset {
  return {
    ...data,
    dep: data.dep.filter((s) => s.id === dep),
    prov: data.prov.filter((s) => s.dep === dep),
    dist: data.dist.filter((s) => s.dep === dep),
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl border border-border bg-foreground/[0.03] p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className="flex-1 rounded-[0.6rem] px-2 py-1.5 text-[12.5px] text-muted-foreground transition hover:text-foreground aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-sm"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Scrubber({
  level,
  onChange,
}: {
  level: Level;
  onChange: (l: Level) => void;
}) {
  const steps: Level[] = ["dep", "prov", "dist"];
  return (
    <div className="glass flex items-center gap-1 rounded-full px-1.5 py-1 text-[10.5px]">
      {steps.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={level === l}
          className="rounded-full px-2.5 py-1 text-muted-foreground transition hover:text-foreground aria-pressed:bg-foreground aria-pressed:text-background"
        >
          {LEVELS[l].label}s
        </button>
      ))}
    </div>
  );
}

/** What the colors of each scale count, one line above the bar. */
const UNIT: Partial<Record<Metric, string>> = {
  quipu: "Cuánto del presupuesto para obras ya se gastó",
  ejecucion: "Cuánto del presupuesto para obras se gastó en 2024",
  inversion: "Presupuesto para obras en 2024",
  ornato: "Parte de las obras que fue a plazas y monumentos",
  cobertura: "Parte de los pueblos y caseríos con señal 4G",
  emergencias: "Estados de emergencia declarados, 2017-2024",
  zonas: "Zonas críticas por derrumbes y huaicos",
  digital: "Presencia digital, de 0 a 100 puntos",
  poblacion: "Habitantes (proyección INEI 2025)",
  densidad: "Habitantes por kilómetro cuadrado (proyección 2025)",
};

function Legend({ metric, shapes }: { metric: Metric; shapes: Shape[] }) {
  if (metric === "area") {
    return (
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        Color por departamento, agrupados por macrorregión: norte, centro, sur,
        oriente y Lima.
      </p>
    );
  }
  const stops = Array.from({ length: 9 }, (_, i) => i / 8);
  const pims = shapes.flatMap((s) => (s.inv ? [s.inv.pim] : []));
  const [min, max] = [Math.max(1, Math.min(...pims)), Math.max(2, ...pims)];
  const scale = {
    ejecucion: {
      colors: stops.map((t) => executionColor(t)),
      lo: "0%",
      hi: "100%",
    },
    quipu: (() => {
      const r = rangeFor(shapes, "quipu");
      return {
        colors: stops.map((t) => quipuColor(r[0] + (r[1] - r[0]) * t, r)),
        lo: `${Math.round(r[0] * 100)} % o menos`,
        hi: `${Math.round(r[1] * 100)} % o más`,
      };
    })(),
    inversion: {
      colors: stops.map((t) => budgetColor(min * (max / min) ** t, min, max)),
      lo: soles(min),
      hi: soles(max),
    },
    ornato: {
      colors: stops.map((t) => ornatoColor(t * 0.3)),
      lo: "0%",
      hi: "30%+",
    },
    cobertura: {
      colors: stops.map((t) => coverageColor(t * 0.5)),
      lo: "0 % con 4G",
      hi: "50 % o más",
    },
    emergencias: {
      colors: stops.map((t) => countColor(t * 9, 9)),
      lo: "0 emergencias",
      hi: "9 o más",
    },
    zonas: {
      colors: stops.map((t) => countColor(t * 6, 6)),
      lo: "0 zonas",
      hi: "6 o más",
    },
    poblacion: (() => {
      const r = rangeFor(shapes, "poblacion");
      return {
        colors: stops.map((t) => terracotta(t)),
        lo: `${count(Math.round(r[0]))} o menos`,
        hi: `${count(Math.round(r[1]))} o más`,
      };
    })(),
    densidad: (() => {
      const r = rangeFor(shapes, "densidad");
      return {
        colors: stops.map((t) => terracotta(t)),
        lo: `${densidad(r[0])} o menos`,
        hi: `${densidad(r[1])} o más`,
      };
    })(),
    digital: (() => {
      const r = rangeFor(shapes, "digital");
      return {
        colors: stops.map((t) => digitalColor(20 + t * 50)),
        lo: `${Math.round(r[0])} o menos`,
        hi: `${Math.round(r[1])} o más`,
      };
    })(),
  }[metric];
  return (
    <div className="flex flex-col gap-1.5">
      {UNIT[metric] && (
        <p className="text-[11.5px] font-medium text-foreground/80">
          {UNIT[metric]}
        </p>
      )}
      <div
        className="h-2 rounded-full"
        style={{
          background: `linear-gradient(90deg, ${scale.colors.join(",")})`,
        }}
      />
      <div className="flex justify-between text-[10.5px] text-muted-foreground">
        <span>{scale.lo}</span>
        <span className="flex items-center gap-1">
          <i
            className="inline-block size-2 rounded-full"
            style={{ background: NO_DATA }}
          />{" "}
          sin datos
        </span>
        <span>{scale.hi}</span>
      </div>
      {metric === "ornato" && (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Jev clasificó cada proyecto por su nombre. Las formas más
          transparentes tienen más inversión que Jev no pudo clasificar con
          seguridad.
        </p>
      )}
      {metric === "digital" && (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Índice de{" "}
          <a href="https://muniscan.crafter.ing" target="_blank" rel="noreferrer" className="underline underline-offset-4">muniscan</a>{" "}
          (Crafter Research), con datos públicos de gob.pe: pesa 45 % los
          sistemas propios, 35 % el uso de plataformas del Estado y 20 % que
          publique trámites y normas. 100 es la mejor municipalidad de la
          corrida. Provincias y departamentos muestran el promedio de sus
          distritos.
        </p>
      )}
    </div>
  );
}

function Extremes({
  title,
  shapes,
  metric,
}: {
  title: string;
  shapes: Shape[];
  metric: Metric;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </span>
      <ol className="flex flex-col gap-1">
        {shapes.map((s) => (
          <li key={s.id} className="flex items-baseline justify-between gap-2">
            <span className="truncate">{s.name}</span>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {valueLabel(s, metric)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const de100 = (r: number) => Math.round(r * 100);

/** Lo que dice la forma según el criterio elegido, en una frase. Sin dato, no hay frase. */
function sentence(shape: Shape, metric: Metric): string | undefined {
  const v = value(shape, metric);
  if (metric === "area") return `Mide ${km2(shape.area)}.`;
  if (metric === "poblacion" && v !== undefined)
    return `Viven ${count(v)} personas, según la proyección que el INEI hizo antes del Censo 2025. Es una estimación y puede diferir del conteo del censo.`;
  if (metric === "densidad" && v !== undefined)
    return `Hay ${densidad(v)}: ${count(shape.pob ?? 0)} personas en ${km2(shape.area)}.`;
  if (v === undefined) return undefined;
  switch (metric) {
    case "inversion":
      return `Tenía ${soles(shape.inv?.pim ?? 0)} para obras en 2024.`;
    case "ejecucion":
      return `En 2024 gastó ${de100(v)} de cada 100 soles de su presupuesto para obras.`;
    case "quipu": {
      const a = shape.avance;
      const antes =
        a && a.pimPrev > 0
          ? ` Hace un año, en este mismo mes, llevaba ${de100(a.devPrev / a.pimPrev)} de cada 100.`
          : "";
      return `En lo que va del año gastó ${de100(v)} de cada 100 soles de su presupuesto para obras.${antes}`;
    }
    case "ornato":
      return `${de100(v)} de cada 100 soles de sus obras 2024 fueron para plazas, parques, arcos o monumentos.`;
    case "digital":
      return `Su municipalidad tiene ${v} puntos de 100 en presencia digital (índice muniscan: sistemas propios, uso de plataformas del Estado y trámites publicados). 100 es la mejor del país.`;
    case "cobertura":
      return `${de100(v)} de cada 100 pueblos y caseríos (centros poblados) tienen señal 4G de celular. Cuenta lugares, no personas.`;
    case "emergencias":
      return `Tuvo ${v.toFixed(1)} decretos de emergencia por lluvias o sequía entre 2017 y 2024${shape.terr && shape.terr.emergN > 1 ? ", en promedio por distrito" : ""}.`;
    case "zonas":
      return `Tiene ${v.toFixed(1)} zonas críticas por peligros geológicos (derrumbes, huaicos, deslizamientos)${shape.terr && shape.terr.zonasN > 1 ? ", en promedio por distrito inventariado" : ""}.`;
  }
}

/** Un dato de apoyo por criterio, solo si existe: lo justo para entender la frase. */
function support(shape: Shape, metric: Metric): [string, string][] {
  const pim = shape.avance?.pim;
  const rows: Partial<Record<Metric, [string, string | undefined]>> = {
    quipu: ["Presupuesto del año para obras", pim ? soles(pim) : undefined],
    ejecucion: ["Presupuesto para obras (2024)", shape.inv ? soles(shape.inv.pim) : undefined],
    inversion: ["Gastó de ese presupuesto", shape.inv?.pim ? pct(shape.inv.dev / shape.inv.pim) : undefined],
    ornato: ["Presupuesto total para obras (2024)", shape.inv ? soles(shape.inv.pim) : undefined],
  };
  const r = rows[metric];
  return r?.[1] ? [[r[0], r[1]]] : [];
}

/** El país en conjunto para el mismo criterio, en palabras. Sin dato, sin frase. */
function countryText(data: Dataset, metric: Metric): string | undefined {
  const deps = data.dep;
  const sum = (f: (s: Shape) => number) => deps.reduce((t, s) => t + f(s), 0);
  const share = (num: number, den: number) =>
    den > 0 ? `${de100(num / den)} de cada 100` : undefined;
  switch (metric) {
    case "ejecucion":
      return share(sum((s) => s.inv?.dev ?? 0), sum((s) => s.inv?.pim ?? 0));
    case "quipu":
      return share(sum((s) => s.avance?.dev ?? 0), sum((s) => s.avance?.pim ?? 0));
    case "cobertura":
      return share(sum((s) => s.terr?.cp4g ?? 0), sum((s) => s.terr?.cp ?? 0));
    case "ornato":
      return share(sum((s) => s.mix?.ornato ?? 0), sum((s) => (s.mix ? (s.inv?.pim ?? 0) : 0)));
    case "poblacion":
      return `${count(sum((s) => s.pob ?? 0))} habitantes`;
    case "densidad": {
      const a = sum((s) => s.area);
      return a > 0 ? densidad(sum((s) => s.pob ?? 0) / a) : undefined;
    }
    case "emergencias": {
      const n = sum((s) => s.terr?.emergN ?? 0);
      return n ? `${(sum((s) => s.terr?.emerg ?? 0) / n).toFixed(1)} decretos por distrito` : undefined;
    }
    default:
      return undefined;
  }
}

function Tooltip({
  hit,
  metric,
  names,
  rank,
  total,
  country,
}: {
  hit: Hit;
  metric: Metric;
  names: Map<string, string>;
  rank: number;
  total: number;
  country?: string;
}) {
  const { shape, level } = hit;
  const where = [
    level === "dist" && names.get(shape.id.slice(0, 4))
      ? `provincia de ${names.get(shape.id.slice(0, 4))}`
      : undefined,
    level !== "dep" ? names.get(shape.dep) : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  const left = hit.x > 260 ? hit.x - 264 : hit.x + 16;
  const card = useRef<HTMLDivElement>(null);
  const main = sentence(shape, metric);
  const rows = support(shape, metric);
  const unsure = metric === "ornato" && shape.mix && shape.inv?.pim ? certainty(shape) : 1;
  // The card grows with the data it has: keep it inside the panel.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every hover move and metric change
  useLayoutEffect(() => {
    const el = card.current;
    const panel = el?.closest("section");
    const origin = el?.offsetParent;
    if (!el || !panel || !origin) return;
    const room =
      panel.getBoundingClientRect().bottom -
      origin.getBoundingClientRect().top -
      el.offsetHeight -
      8;
    el.style.top = `${Math.max(0, Math.min(hit.y - 24, room))}px`;
  }, [hit.x, hit.y, hit.shape.id, metric]);
  return (
    <div
      ref={card}
      className="glass glass-solid pointer-events-none absolute z-20 w-[248px] rounded-2xl p-3.5 text-[12px]"
      style={{ left, top: Math.max(0, hit.y - 24) }}
    >
      <p className="text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase">
        {LEVELS[level].label}
      </p>
      <p className="font-display text-[19px] leading-tight">{shape.name}</p>
      {where && <p className="text-[11.5px] text-muted-foreground">{where}</p>}
      {shape.gentilicio && (
        <p className="text-[11.5px] text-muted-foreground italic">
          Gentilicio: {shape.gentilicio}
        </p>
      )}
      {main && (
        <p className="mt-2.5 rounded-xl bg-accent/10 px-2.5 py-2 text-[13px] leading-snug text-foreground">
          {main}
        </p>
      )}
      {main && rank > 0 && (
        <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
          Puesto {rank} de {total} {LEVELS[level].plural}, de mayor a menor.
          {country ? ` El país en conjunto: ${country}.` : ""}
        </p>
      )}
      {unsure < 0.995 && (
        <p className="mt-1 text-[10.5px] text-muted-foreground">
          Clasificación automática por el nombre de cada obra, {de100(unsure)} % segura.
        </p>
      )}
      {rows.length > 0 && (
        <dl className="mt-2.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[11.5px]">
          {rows.map(([label, v]) => (
            <Fragment key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-mono">{v}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}
