"""Población total del Censo 2025 por distrito (INEI) → data/poblacion-2025.json {ubigeo: habitantes}.

Total = censada + omitida (las cifras oficiales; la tabla «población por sexo» solo trae la censada). Fuentes, ambas
de censos2025.inei.gob.pe/resultados → Descarga de datos → Cuadros estadísticos:
  · Cuadros interactivos: nivel Distrital, variable Sexo, «Descargar Excel» (trae el ubigeo de cada distrito).
  · Tabulados → Población → Indicadores demográficos, un archivo por ámbito (cuadro 1: total, censada y omitida; la omitida va en «omit»).
Uso:
    python scripts/censo.py ruta/distrital_sexo.xlsx carpeta/    # baja lo que falte a carpeta/ind_XX.xlsx
"""
import json
import os
import re
import sys
import unicodedata
import urllib.request

import openpyxl

BASE = "https://proyectos.inei.gob.pe/dir-segmentacion-ci/postcensal/prod/adjuntos/censos-2025/descarga_datos/tabulados"
# 01-25 departamentos (07 = Callao); 26 = Región Lima y 27 = Lima Metropolitana (ambas son el departamento 15).
ÁMBITOS = [f"{i:02d}" for i in (*range(1, 15), *range(16, 28))]


def norm(s):
    s = unicodedata.normalize("NFKD", re.sub(r"\d+/", "", str(s))).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]", "", s)


ref = {}
for r in openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True):
    if isinstance(r[1], str) and len(r[1]) == 6 and r[1].isdigit():
        ref[(r[1][:2], norm(r[3]), norm(r[4]))] = r[1]

carpeta = sys.argv[2]
os.makedirs(carpeta, exist_ok=True)
out = {}
omit = {}
for a in ÁMBITOS:
    f = os.path.join(carpeta, f"ind_{a}.xlsx")
    if not os.path.exists(f):
        urllib.request.urlretrieve(f"{BASE}/{a}/poblacion/Indicadores_demograficos.xlsx", f)
    dep = "15" if a in ("26", "27") else a
    prov = "PROVCONSTDELCALLAO" if a == "07" else None
    for r in openpyxl.load_workbook(f, read_only=True, data_only=True).worksheets[2].iter_rows(values_only=True):
        n = r[0]
        if not isinstance(n, str):
            continue
        if n.startswith("LIMA METROPOLITANA"):
            prov = "LIMA"
        elif n.startswith("PROVINCIA "):
            prov = norm(n[10:])
        elif n.startswith("DISTRITO ") and prov and (dep, prov, norm(n[9:])) in ref:
            u = ref[(dep, prov, norm(n[9:]))]
            out[u], omit[u] = int(r[1]), int(r[7])
if len(out) != len(ref):
    sys.exit(f"faltan {len(ref) - len(out)} distritos de {len(ref)}")
# Provincias (…00) y departamentos (…0000) como suma de sus distritos.
for tabla in (out, omit):
    for u, v in list(tabla.items()):
        tabla[u[:4] + "00"] = tabla.get(u[:4] + "00", 0) + v
        tabla[u[:2] + "0000"] = tabla.get(u[:2] + "0000", 0) + v
# El mapa dibuja Mazamari y Pangoa como una sola forma (120699): suma de los dos distritos.
if "120604" in out and "120606" in out:
    out["120699"] = out["120604"] + out["120606"]
    omit["120699"] = omit["120604"] + omit["120606"]
json.dump({"año": 2025, "pob": out, "omit": omit}, open("data/poblacion-2025.json", "w"), separators=(",", ":"))
print(len(ref), "distritos", sum(v for k, v in out.items() if k.endswith("0000")), "habitantes")
