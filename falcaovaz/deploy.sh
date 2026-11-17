#!/bin/bash
# Deploy do SISTEMA JURÍDICO (falcaovaz.netlify.app) pela linha de comando — substitui o zip arrastado no painel (17/11/2026).
#   ./deploy.sh          → publica um RASCUNHO (URL de teste), mostra a URL e pergunta se vai para produção
#   ./deploy.sh --prod   → vai direto para produção (sem rascunho)
# Vai para o ar: public/ (páginas) + netlify/functions (funções, empacotadas com esbuild pelo netlify.toml).
# As chaves (ANTHROPIC_API_KEY, SUPABASE_KEY etc.) ficam nas variáveis do site no Netlify — o deploy não mexe nelas.
# Pasta ligada ao site "falcaovaz" (netlify link --name falcaovaz; estado em .netlify/, fora do git).
set -euo pipefail
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")"

msg="${MSG:-$(git log -1 --format='%h %s' 2>/dev/null | cut -c1-120)}"
if [ "${1:-}" != "--prod" ]; then
  echo "── Rascunho (não muda o site no ar) ──"
  netlify deploy --dir=public --functions=netlify/functions --message "rascunho: $msg"
  echo
  read -r -p "Publicar em PRODUÇÃO (falcaovaz.netlify.app)? [s/N] " ok
  [ "$ok" = "s" ] || [ "$ok" = "S" ] || { echo "Não publicado."; exit 0; }
fi
echo "── Produção ──"
netlify deploy --prod --dir=public --functions=netlify/functions --message "$msg"
