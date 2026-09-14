-- Adiciona link do anuncio/ficha do imovel na tabela de selecao.
-- Codigo passa a ser clicavel na peneira, na lista e no PDF quando ha link.
-- Upload da planilha reconhece colunas "Link", "URL", "Anuncio", "Ficha", etc.

ALTER TABLE vendas_selecao_imoveis
  ADD COLUMN IF NOT EXISTS link_imovel text;
