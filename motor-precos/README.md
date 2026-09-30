# Motor de preço ao vivo — Avaliação de Imóveis

Serviço mínimo (FastAPI) que o portal chama para buscar anúncios ao vivo de um bairro e devolver a
mediana de R$/m² (apto e casa) + amostra. Sem banco, sem segredo: só valida que quem chama está
logado no portal (token do Supabase Auth) e raspa o QuintoAndar. Se cair, o portal usa a base ITBI.

## Rodar local
```bash
cd motor-precos && EXIGE_LOGIN=0 python3 -m uvicorn precos_api:app --port 8902
curl "http://localhost:8902/precos?bairro=Saúde"
```

## Publicar no Render (passos do Rodrigo, uma vez)
1. `git push origin main` (o Render lê o repo FalcaoVaz/novasp-portal).
2. render.com → New → Blueprint → conectar o repo → ele lê `motor-precos/render.yaml`.
   (Ou New → Web Service, root directory `motor-precos`, build `pip install -r requirements.txt`,
   start `uvicorn precos_api:app --host 0.0.0.0 --port $PORT`.)
3. Em Environment, colar `SB_ANON` = anon key do Supabase (a mesma do portal, é pública).
4. Anotar a URL (ex.: `https://novasp-motor-precos.onrender.com`) e conferir `/health`.
5. No portal, `window.AVAL_MOTOR_URL` no index.html aponta para essa URL. Se a URL sair diferente,
   trocar a linha e publicar o portal.

## Riscos conhecidos
- IP de datacenter pode levar 403 do QuintoAndar. Se acontecer, alternativa é rodar o serviço numa
  máquina do escritório (mesmo comando "Rodar local", porta liberada) e apontar AVAL_MOTOR_URL para ela.
- Free tier hiberna: 1ª chamada do dia demora 30-60 s. O portal espera até 45 s e acorda o serviço ao
  abrir o módulo.
