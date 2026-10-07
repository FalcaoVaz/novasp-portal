# Teste do cálculo da avaliação — 04/10/2026

Código real do portal rodando no navegador local; RPCs só de leitura no banco de produção e motor de anúncios local
(`proxy.py` + `harness.js`). Bairro detectado igual ao portal (OpenStreetMap). Venda própria tirada dos comparáveis.

## 1. Negócios fechados pela NSP (abr/2025 em diante) — preço real conhecido
| | n | viés mediano | erro absoluto mediano | dentro de 10% | dentro de 20% |
|---|---|---|---|---|---|
| Apartamentos — cálculo atual | 30 | +4% | 16% | 27% | 60% |
| Casas — cálculo atual (média comparativo + terreno/construção) | 20 | +6% | 16% | 35% | 60% |
| Casas — só comparativo | 20 | +27% | 27% | 5% | 20% |

Variantes para apartamentos (mesmos 30): só ITBI 18% · só anúncios 16% (viés +12%) · ITBI ponderado por mesmo
prédio/tamanho + vaga avulsa somada 20% · anúncios filtrados por tamanho + ITBI 18%. **Nenhuma melhora o atual.**

## 2. 100 anúncios ativos da carteira (70 aptos, 30 casas) — pedido ÷ avaliação
| | mediana | p25 | p75 | pedido abaixo da avaliação |
|---|---|---|---|---|
| Apartamentos | +4% | −16% | +30% | 47% |
| Casas | +52% | +14% | +79% | 17% |
Referência: pedido→fechado no NIDO = −4,8% (mediana); alvo de "pedido ~5–10% acima".

## 3. Pareceres manuais de set/2026 (não são preço real)
Viareggio +9% · Barra do Parateca −22% · Renan Basto −21% · Manoel Correia −31% (com pino certo; com o pino do
geocode, que caiu 3 km em outra rua, −62%) · galpão da R. Alba +50% → com a correção do comercial, perto do parecer.

## Conclusões
- Apartamento: mediana em ordem, dispersão alta (só ~1 em 4 dentro de 10%).
- Casa: os dois testes discordam (fechados +6%, anúncios −35%) — método de casa não é confiável; precisa de outra base
  (venda de casas por terreno, lote fiscal) antes de mexer.
- Comercial: valor = terreno a preço de lote + construção (adotado).
- Bug: geocode por nome parecido quando a rua não tem venda no ITBI (Manoel Correia Júnior → "Correia Júnior").
  Caminho: pino pela quadra fiscal do cadastro IPTU.

## 4. Casa por terreno + construção CALIBRADO (adotado em 04/10/2026, v83)
Calibração (`calibra_casa.py`, `calibra_casa2.py`) em 10.585 vendas de casas do ITBI (24 meses), cada venda avaliada sem ela mesma:
valor = terreno × L_local × (terreno/154)^-0,5 + construída × R$ 3.500 × fator do padrão IPTU × max(0,5; 1 − idade/100) × estado.
L_local = mediana do terreno implícito das 30 vendas de casa mais próximas (RPC `aval_terreno_local`).
| | erro abs mediano | viés | ≤10% | ≤20% |
|---|---|---|---|---|
| Terreno + construção calibrado (ITBI, 10.585) | 23% | 0% | 23% | 44% |
| Comparativo local por R$/m² construído (ITBI) | 26% | 0% | 21% | 40% |
| Só R$/m² de terreno dos vizinhos (ITBI) | 31% | +1% | 17% | 33% |
| Calibrado nas 20 casas vendidas pela NSP | 16% | +11% | 30% | 55% |
| (antes: média comparativo + evolutivo antigo, mesmas 20) | 16% | +6% | 35% | 60% |
Pareceres manuais: Parateca −3%, Renan Basto −3%, Manoel Correia −17% (antes −22/−21/−31%).
Terreno local passou de valores da carteira (ex.: Vila Guarani R$ 1.296/m²) para o ITBI (R$ 2.051–2.686/m² nos mesmos pontos).
Anúncios ativos de casa seguem ~46% acima da avaliação: o ITBI de casa = preço de fechamento (razão 1,00 em 427 pares) e as
casas vendidas pela NSP fecharam 7% abaixo do último pedido → o excesso está nos anúncios de casa que não vendem. Para casa,
anúncio ativo não é régua; para apartamento é (+4%).

## 5. Anúncios por proximidade (testado e NÃO adotado no cálculo, 04/10/2026)
Busca no bairro do mapa + distrito oficial, distância de cada rua ao pino (`aval_ruas_distancia`), anúncios a até 800 m (1.200 m se faltar):
| apartamentos | cálculo atual (bairro do mapa) | anúncios perto |
|---|---|---|
| 30 vendidos NSP — erro abs mediano | 16% | 20% |
| 30 vendidos NSP — dentro de 20% | 60% | 50% |
| 70 anúncios — desvio mediano da marca de +7% | 23% | 22% |
Adotado só para a TELA: cada anúncio mostra "a X m" do imóvel e a lista vem em ordem de distância; o cálculo não muda.

## 5. Anúncios da Nova SP (Imoview) primeiro, QuintoAndar completando — 06/10/2026 (adotado, v94)
Mesmos 50 negócios fechados pela NSP. Cada caso roda sem o próprio anúncio (mesma ref). Os nossos são os mais próximos
num raio de 2 km, do mesmo grupo (apto/casa), com repetidos removidos (mesma rua, área e valor). Em média entraram 11,5 dos nossos por caso.
| | erro abs mediano | viés | ≤10% | ≤20% |
|---|---|---|---|---|
| Apartamentos — só QuintoAndar (antes) | 18% | +14% | 23% | 57% |
| **Apartamentos — Nova SP primeiro** | **12%** | **+1%** | **33%** | **70%** |
| Só o lado dos anúncios (apto, × 0,952) | 22% → 14% | +14% → +3% | | |
| Casas (valor = terreno + construção; anúncios só de referência) | 16% → 16% | +11% → +11% | 30% | 55% |
Leitura: o desconto pedido→fechado foi medido nos NOSSOS anúncios, então usar os nossos casa a escala; o QuintoAndar
puxava o valor para cima (+14%). Ressalva: se um imóvel vendido continuar como "disponível" no Imoview com outro código, ele pode vazar para a conta.

## 6. Só referências de tamanho parecido (até 50% de diferença de área) — 07/10/2026 (adotado, v96)
Vendas (área útil estimada) e anúncios com área entre 0,5× e 1,5× a do imóvel; busca de vendas ampliada para 40 e de anúncios da Nova SP para 30, antes do corte.
| | erro abs mediano | viés | ≤10% | ≤20% |
|---|---|---|---|---|
| Apartamentos — Nova SP primeiro (v94) | 12% | +1% | 33% | 70% |
| **Apartamentos — + filtro de tamanho** | **11%** | **+2%** | **40%** | **73%** |
| Casas | 16% | +11% | 30% | 55% |
Em média ficaram de fora, por apartamento, 18 vendas e 14 anúncios de tamanho muito diferente. Só 1 dos 30 ficou sem vendas suficientes.
