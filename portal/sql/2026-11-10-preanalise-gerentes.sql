-- Pré-análise de certidões: acesso para os gerentes de vendas (10/11/2026). Renata já tinha.
insert into preanalise_acesso (email) values
  ('gerenciavendas@novasaopaulo.com.br'),    -- Christiane
  ('emilia.vitoria@novasaopaulo.com.br'),    -- Emilia
  ('felippe.lemos@novasaopaulo.com.br')      -- Felippe
on conflict (email) do nothing;
select email from preanalise_acesso order by email;
