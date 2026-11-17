#!/bin/bash
# Deploy do PORTAL (novasp.netlify.app) pela linha de comando — substitui o zip arrastado no painel (17/11/2026).
#   ./deploy.sh          → publica um RASCUNHO (URL de teste), mostra a URL e pergunta se vai para produção
#   ./deploy.sh --prod   → vai direto para produção (sem rascunho)
# Fica FORA do que vai para o ar: sql/ (scripts do banco), gas/ (Apps Script), arquivos de teste e lixo do Mac.
# Pasta ligada ao site "novasp" (netlify link --name novasp; estado em .netlify/, fora do git).
set -euo pipefail
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")"

msg="${MSG:-$(git log -1 --format='%h %s' 2>/dev/null | cut -c1-120)}"
tmp="$(mktemp -d /tmp/novasp-deploy.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT
rsync -a --exclude '.netlify/' --exclude 'sql/' --exclude 'gas/' --exclude '_teste*' --exclude '.DS_Store' \
      --exclude 'deploy.sh' ./ "$tmp/"
echo "Arquivos que vão para o ar: $(find "$tmp" -type f | wc -l | tr -d ' ')"

if [ "${1:-}" != "--prod" ]; then
  echo "── Rascunho (não muda o site no ar) ──"
  netlify deploy --dir="$tmp" --message "rascunho: $msg"
  echo
  read -r -p "Publicar em PRODUÇÃO (novasp.netlify.app)? [s/N] " ok
  [ "$ok" = "s" ] || [ "$ok" = "S" ] || { echo "Não publicado."; exit 0; }
fi
echo "── Produção ──"
netlify deploy --prod --dir="$tmp" --message "$msg"
