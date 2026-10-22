"""Une el catálogo de municipios (AGEM) con las coordenadas de su cabecera (catálogo de localidades).

Las alcaldías de la Ciudad de México no tienen cabecera (CVE_CAB '----'): se usa su localidad
más poblada, que es su zona urbana.
"""
import csv, sys
mun_path, loc_path, out_path = sys.argv[1:4]
locs, top = {}, {}
with open(loc_path, encoding='latin-1', newline='') as f:
    for r in csv.DictReader(f):
        locs[r['CVEGEO']] = r
        mun = r['CVEGEO'][:5]
        pop = int(r['POB_TOTAL']) if r['POB_TOTAL'].isdigit() else -1
        if mun not in top or pop > top[mun][0]:
            top[mun] = (pop, r)
rows, fallback = [], []
with open(mun_path, encoding='utf-8-sig', newline='') as f:
    for r in csv.DictReader(f):
        l = locs.get(r['CVEGEO'] + r['CVE_CAB'])
        if l is None:
            l = top[r['CVEGEO']][1]
            fallback.append((r['CVEGEO'], r['NOM_MUN'], l['CVE_LOC'], l['NOM_LOC']))
        rows.append([r['CVEGEO'], r['CVE_ENT'], r['CVE_MUN'], r['NOM_MUN'], l['CVE_LOC'], l['NOM_LOC'],
                     f"{float(l['LAT_DECIMAL']):.6f}", f"{float(l['LON_DECIMAL']):.6f}"])
print('rows', len(rows), 'fallback', len(fallback))
for x in fallback: print(x)
with open(out_path, 'w', encoding='utf-8', newline='') as f:
    w = csv.writer(f, lineterminator='\n')
    w.writerow(['code', 'state_code', 'municipality_code', 'name', 'reference_locality_code', 'reference_locality_name', 'latitude', 'longitude'])
    w.writerows(sorted(rows))
