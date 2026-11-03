"""Canon minero y regalía minera acreditados a cada municipalidad → data/canon-2025.json {ubigeo: soles}.

Fuente: MEF, Datos Abiertos, «Transferencias» (fs.datosabiertos.mef.gob.pe/datastorefiles/2025-Transferencias.csv, ~113 MB).
Se suma MONTO_ACREDITADO de las filas de gobiernos locales (TIPO_ENTIDAD = M) con RECURSO_NOMBRE «CANON MINERO» o
«REGALÍA MINERA», por distrito de la ejecutora; la municipalidad provincial cuenta en su distrito capital, igual que el
gasto. Uso:
    python scripts/canon.py ruta/2025-Transferencias.csv
"""
import csv
import json
import sys
import urllib.request

RECURSOS = {"CANON MINERO", "REGALÍA MINERA"}

ruta = sys.argv[1]
try:
    open(ruta, "rb").close()
except FileNotFoundError:
    urllib.request.urlretrieve("https://fs.datosabiertos.mef.gob.pe/datastorefiles/2025-Transferencias.csv", ruta)

out = {}
for r in csv.DictReader(open(ruta, encoding="utf8", errors="replace", newline="")):
    if r["TIPO_ENTIDAD"] != "M" or r["RECURSO_NOMBRE"].strip() not in RECURSOS:
        continue
    u = r["DEPARTAMENTO_EJECUTORA"].zfill(2) + r["PROVINCIA_EJECUTORA"].zfill(2) + r["DISTRITO_EJECUTORA"].zfill(2)
    if len(u) == 6 and u.isdigit():
        out[u] = out.get(u, 0) + float(r["MONTO_ACREDITADO"] or 0)
out = {u: round(v) for u, v in out.items()}
# Provincias (…00) y departamentos (…0000): suma de sus distritos.
for u, v in list(out.items()):
    for k in (u[:4] + "00", u[:2] + "0000"):
        out[k] = out.get(k, 0) + v
# El mapa dibuja Mazamari y Pangoa como una sola forma (120699).
out["120699"] = out.get("120604", 0) + out.get("120606", 0)
json.dump({"año": 2025, "canon": out}, open("data/canon-2025.json", "w"), separators=(",", ":"))
tot = sum(v for k, v in out.items() if k.endswith("0000"))
print(len([k for k in out if not k.endswith("00")]), "distritos con canon", f"{tot:,} soles")
