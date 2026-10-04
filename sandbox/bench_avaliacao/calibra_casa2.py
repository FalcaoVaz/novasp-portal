import pandas as pd, numpy as np, itertools
exec(open('calibra_casa.py').read().split("def avalia")[0])     # mesmos dados, vizinhos e filtros
tmed = np.median(D.area_terreno.values)
def avalia(c0, vida, piso, k=30, beta=0.0, mix=0.0):
    dep = np.clip(1 - D.idade_f.values / vida, piso, 1)
    constr = D.area_constr.values * c0 * D.kpad.values * dep
    fs = (D.area_terreno.values / tmed) ** (-beta)                 # lote menor vale mais por m²
    land = (D.v.values - constr) / (D.area_terreno.values * fs)
    L = np.median(land[viz[:, :k]], axis=1)
    pred = D.area_terreno.values * fs * L + constr
    if mix:                                                         # mistura com o comparativo local
        pc = np.median((D.v.values / D.area_constr.values)[viz[:, :k]], axis=1) * D.area_constr.values
        pred = (1 - mix) * pred + mix * pc
    e = pred / D.v.values - 1
    return np.median(np.abs(e)), np.median(e), np.mean(np.abs(e) <= .1), np.mean(np.abs(e) <= .2)
res = []
for c0, vida, piso, k, beta in itertools.product([3500, 4500, 5500, 6500], [60, 100], [0.5, 0.65, 0.8], [15, 30, 50], [0, 0.25, 0.5]):
    a, b, w10, w20 = avalia(c0, vida, piso, k, beta); res.append((a, b, w10, w20, c0, vida, piso, k, beta))
res.sort()
for r in res[:6]: print(f'  abs {r[0]:.3f} viés {r[1]:+.3f} ≤10% {r[2]:.0%} ≤20% {r[3]:.0%} | c0={r[4]} vida={r[5]} piso={r[6]} k={r[7]} beta={r[8]}')
b = res[0]
for mix in [0.25, 0.5]:
    a, bb, w10, w20 = avalia(*b[4:9], mix=mix); print(f'  + {int(mix*100)}% comparativo local: abs {a:.3f} viés {bb:+.3f} ≤10% {w10:.0%} ≤20% {w20:.0%}')
# por faixa de idade e de tamanho, com o melhor
c0, vida, piso, k, beta = b[4:9]
dep = np.clip(1 - D.idade_f.values / vida, piso, 1); constr = D.area_constr.values * c0 * D.kpad.values * dep
fs = (D.area_terreno.values / tmed) ** (-beta); land = (D.v.values - constr) / (D.area_terreno.values * fs)
L = np.median(land[viz[:, :k]], axis=1); pred = D.area_terreno.values * fs * L + constr; D['e'] = pred / D.v.values - 1
D['faixa_idade'] = pd.cut(D.idade, [0, 15, 30, 50, 70, 200]); print(D.groupby('faixa_idade', observed=True).e.agg(lambda x: f"n={len(x)} viés {np.median(x):+.2f} abs {np.median(np.abs(x)):.2f}").to_string())
D['faixa_lote'] = pd.cut(D.area_terreno, [0, 100, 150, 250, 400, 3000]); print(D.groupby('faixa_lote', observed=True).e.agg(lambda x: f"n={len(x)} viés {np.median(x):+.2f} abs {np.median(np.abs(x)):.2f}").to_string())
print('parte do valor que é terreno (mediana):', round(float(np.median(D.area_terreno.values*fs*L/pred)),2))
