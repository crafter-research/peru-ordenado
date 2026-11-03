"""Uso de internet por distrito (Censo 2025, INEI) → data/internet-2025.json {ubigeo: [base, usó internet]}.

Base = población censada de 3 y más años; «usó internet» = la que lo usó en los últimos 3 meses. Sale del cuadro 10 de
Tabulados → Población → Educación («por tipo de dispositivo tecnológico e internet utilizado»), un archivo por ámbito.
Los distritos se unen por ubigeo con la misma tabla distrital que usa scripts/censo.py. Uso:
    python scripts/censo-internet.py ruta/distrital_sexo.xlsx carpeta/    # baja lo que falte a carpeta/edu_XX.xlsx
"""
import json
import os
import re
import sys
import unicodedata
import urllib.request

import openpyxl

BASE = "https://proyectos.inei.gob.pe/dir-segmentacion-ci/postcensal/prod/adjuntos/censos-2025/descarga_datos/tabulados"
ÁMBITOS = [f"{i:02d}" for i in (*range(1, 15), *range(16, 28))]  # 26 y 27 = Región Lima y Lima Metropolitana (dep. 15)


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
for a in ÁMBITOS:
    f = os.path.join(carpeta, f"edu_{a}.xlsx")
    if not os.path.exists(f):
        urllib.request.urlretrieve(f"{BASE}/{a}/poblacion/Educacion.xlsx", f)
    dep = "15" if a in ("26", "27") else a
    prov = "PROVCONSTDELCALLAO" if a == "07" else None
    wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
    ws = next(w for w in wb.worksheets if "dispositivo" in str(next(w.iter_rows(max_row=1, values_only=True))[0]).lower() and "NIVEL EDUCATIVO" not in str(next(w.iter_rows(max_row=1, values_only=True))[0]).upper())
    for r in ws.iter_rows(values_only=True):
        n = r[0]
        if not isinstance(n, str):
            continue
        if n.startswith("LIMA METROPOLITANA"):
            prov = "LIMA"
        elif n.startswith("PROVINCIA "):
            prov = norm(n[10:])
        elif n.startswith("DISTRITO ") and prov and (dep, prov, norm(n[9:])) in ref:
            u = ref[(dep, prov, norm(n[9:]))]
            out.setdefault(u, [int(r[1]), int(r[5])])
if len(out) != len(ref):
    sys.exit(f"faltan {len(ref) - len(out)} distritos de {len(ref)}")
# Provincias (…00) y departamentos (…0000): suma de sus distritos.
for u, v in list(out.items()):
    for k in (u[:4] + "00", u[:2] + "0000"):
        t = out.setdefault(k, [0, 0])
        t[0] += v[0]
        t[1] += v[1]
# El mapa dibuja Mazamari y Pangoa como una sola forma (120699).
if "120604" in out and "120606" in out:
    out["120699"] = [out["120604"][0] + out["120606"][0], out["120604"][1] + out["120606"][1]]
json.dump({"año": 2025, "net": out}, open("data/internet-2025.json", "w"), separators=(",", ":"))
tot = [sum(v[i] for k, v in out.items() if k.endswith("0000")) for i in (0, 1)]
print(len(ref), "distritos", tot, f"{tot[1] / tot[0]:.1%} usó internet")
