# Calibra terreno + construção nas vendas de casas do ITBI (24 meses, Zona Sul + entorno), com validação "deixa um de fora".
import pandas as pd, numpy as np, itertools, sys
from scipy.spatial import cKDTree
D = pd.read_csv('/private/tmp/claude-501/-Users-Rodrigo/e7bee23e-4633-4f5e-bf5b-74ec57e2072b/scratchpad/bench/casas_itbi.csv', parse_dates=['data'])
D = D[D.uso.str.contains('^RESID', regex=True)].copy()
D['rs'] = D.valor / D.area_constr
D = D[(D.area_terreno.between(40, 2000)) & (D.area_constr.between(30, 1500)) & D.rs.between(800, 30000)].copy()
D['idade'] = np.where(D.acc > 1800, 2026 - D.acc, np.nan)
med_idade = D.idade.median(); D['idade_f'] = D.idade.fillna(med_idade)
PAD = {10: 0.65, 11: 0.8, 12: 1.0, 13: 1.25, 14: 1.55, 15: 1.9}
D['kpad'] = D.padrao.map(PAD).fillna(1.0)
D['v'] = D.valor * 1.035                                   # subdeclaração média do ITBI
D = D.reset_index(drop=True)
X = np.c_[D.lat.values * 111320, D.lng.values * 111320 * np.cos(np.radians(-23.62))]
tree = cKDTree(X); K = 31
dist, idx = tree.query(X, k=K)                              # 1º vizinho é ele mesmo
viz, dviz = idx[:, 1:], dist[:, 1:]
print(f'vendas: {len(D)} | idade conhecida {D.idade.notna().mean():.0%} (mediana {med_idade:.0f} anos) | distância mediana ao 30º vizinho {np.median(dviz[:, -1]):.0f} m')
def avalia(c0, vida, piso, k=30):
    dep = np.clip(1 - D.idade_f.values / vida, piso, 1)
    constr = D.area_constr.values * c0 * D.kpad.values * dep
    land = (D.v.values - constr) / D.area_terreno.values           # terreno implícito de cada venda
    L = np.median(land[viz[:, :k]], axis=1)                         # terreno local sem a própria venda
    pred = D.area_terreno.values * L + constr
    e = pred / D.v.values - 1
    return np.median(e), np.median(np.abs(e)), np.mean(np.abs(e) <= 0.10), np.mean(np.abs(e) <= 0.20), L
res = []
for c0, vida, piso in itertools.product([1500, 2000, 2500, 3000, 3500, 4000], [40, 60, 80, 100], [0.2, 0.35, 0.5]):
    b, a, w10, w20, _ = avalia(c0, vida, piso)
    res.append((a, b, w10, w20, c0, vida, piso))
res.sort()
print('melhores (erro abs mediano, viés, ≤10%, ≤20%, construção nova R$/m² padrão C, vida útil, piso):')
for r in res[:8]: print(f'  {r[0]:.3f} {r[1]:+.3f} {r[2]:.0%} {r[3]:.0%}  c0={r[4]} vida={r[5]} piso={r[6]}')
# referência: só comparativo local (R$/m² construído mediano dos 30 vizinhos)
rsv = D.rs.values * 1.035; pc = np.median(rsv[viz], axis=1) * D.area_constr.values; e = pc / D.v.values - 1
print(f'referência só comparativo local (R$/m² construído): abs {np.median(np.abs(e)):.3f} viés {np.median(e):+.3f} ≤10% {np.mean(np.abs(e)<=.1):.0%} ≤20% {np.mean(np.abs(e)<=.2):.0%}')
# referência: terreno puro (R$/m² de terreno mediano dos vizinhos × terreno)
rt = D.v.values / D.area_terreno.values; pt = np.median(rt[viz], axis=1) * D.area_terreno.values; e = pt / D.v.values - 1
print(f'referência só R$/m² de terreno dos vizinhos: abs {np.median(np.abs(e)):.3f} viés {np.median(e):+.3f} ≤10% {np.mean(np.abs(e)<=.1):.0%} ≤20% {np.mean(np.abs(e)<=.2):.0%}')
best = res[0]; _, _, _, _, L = avalia(best[4], best[5], best[6])
D['L'] = L; print('terreno local estimado (R$/m²) — quartis:', np.percentile(L, [10, 25, 50, 75, 90]).round(0))
D[['lat','lng','L']].to_csv('/private/tmp/claude-501/-Users-Rodrigo/e7bee23e-4633-4f5e-bf5b-74ec57e2072b/scratchpad/bench/terreno_local.csv', index=False)
