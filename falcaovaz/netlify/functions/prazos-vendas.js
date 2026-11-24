// Alertas por e-mail dos prazos mensais de vendas (24/11/2026). Agendada todo dia às 9h (netlify.toml); só age nos dias 5, 6, 10 e 11.
//  · dia 5 (prazo) e 6 (atrasado): equipe que ainda não inseriu no portal a planilha do mês (vendas_planilhas_importacoes)
//    ou a seleção da equipe (vendas_selecao_imoveis do mês) → e-mail para a assistente e o gerente da equipe (cópia marketing; no dia 6, cópia Rodrigo)
//  · dia 10 (prazo) e 11 (atrasado): gerente com imóveis pendentes da Peneira sem o seu voto → e-mail para ele (dia 11, cópia Rodrigo)
// Variáveis: SUPABASE_URL, SUPABASE_KEY, RESEND_API_KEY. Teste local: event.teste = {dia, mes:'YYYY-MM'} não envia, só devolve o plano.
const EQUIPES = {   // equipe → assistente(s) e gerente
  Aguia:   { planilha: 'AGUIA',   assist: ['leticia.andrade@novasaopaulo.com.br'], gerente: ['renata@novasaopaulo.com.br'] },
  Fenix:   { planilha: 'FENIX',   assist: ['leticia.andrade@novasaopaulo.com.br'], gerente: ['renata@novasaopaulo.com.br'] },
  Chris:   { planilha: 'CHRIS',   assist: ['karina.silva@novasaopaulo.com.br'],    gerente: ['gerenciavendas@novasaopaulo.com.br'] },
  Emilia:  { planilha: 'EMILIA',  assist: ['amanda@novasaopaulo.com.br'],          gerente: ['emilia.vitoria@novasaopaulo.com.br'] },
  Felippe: { planilha: 'FELIPPE', assist: ['camille.cassab@novasaopaulo.com.br'],  gerente: ['felippe.lemos@novasaopaulo.com.br'] },
};
const GERENTES = { Renata: 'renata@novasaopaulo.com.br', Christiane: 'gerenciavendas@novasaopaulo.com.br', Felippe: 'felippe.lemos@novasaopaulo.com.br', Emilia: 'emilia.vitoria@novasaopaulo.com.br' };
const MKT = ['thais.barbosa@novasaopaulo.com.br', 'anderson.lucchi@novasaopaulo.com.br'], DIRETORIA = ['rodrigo@novasaopaulo.com.br'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const html = corpo => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;max-width:560px">${corpo}
<p style="margin-top:18px"><a href="https://novasp.netlify.app">Abrir o portal → Vendas</a></p><p style="font-size:12px;color:#64748b">Aviso automático do portal NovaSP.</p></div>`;

exports.handler = async (event) => {
  const sb = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co', key = process.env.SUPABASE_KEY, rk = process.env.RESEND_API_KEY;
  const teste = event && event.teste;
  const agoraSP = new Date(Date.now() - 3 * 3600e3);
  const dia = teste ? teste.dia : agoraSP.getUTCDate();
  const mes = teste ? teste.mes : `${agoraSP.getUTCFullYear()}-${String(agoraSP.getUTCMonth() + 1).padStart(2, '0')}`;
  if (![5, 6, 10, 11].includes(dia)) return { statusCode: 204 };
  if (!key || (!rk && !teste)) return { statusCode: 503 };
  const H = { apikey: key, Authorization: 'Bearer ' + key };
  const get = q => fetch(`${sb}/rest/v1/${q}`, { headers: H }).then(r => { if (!r.ok) throw new Error(q.split('?')[0] + ' ' + r.status); return r.json(); });
  const nomeMes = MESES[+mes.slice(5) - 1] + '/' + mes.slice(0, 4);
  const envios = [];

  if (dia === 5 || dia === 6) {
    const imps = await get(`vendas_planilhas_importacoes?select=equipe&mes_ref=eq.${mes}-01`);
    const sel = await get(`vendas_selecao_imoveis?select=equipe&mes_referencia=eq.${mes}`);
    const temPlan = new Set(imps.map(i => String(i.equipe || '').toUpperCase())), temSel = new Set(sel.map(s => String(s.equipe || '')));
    for (const [eq, e] of Object.entries(EQUIPES)) {
      const falta = [];
      if (!temPlan.has(e.planilha)) falta.push('a <b>planilha do mês</b> (cotas de Destaque/Super Destaque, cota extra de quem bateu a meta, captação e placas) — Vendas → Planilhas');
      if (!temSel.has(eq)) falta.push('a <b>seleção de imóveis</b> escolhida pela equipe (pendentes da Peneira) — Vendas → Seleção');
      if (!falta.length) continue;
      const atras = dia === 6;
      envios.push({ to: e.assist.concat(e.gerente), cc: MKT.concat(atras ? DIRETORIA : []),
        subject: `${atras ? '⚠️ Atrasado' : '⏰ Prazo hoje'}: equipe ${eq} — planilha e seleção de ${nomeMes}`,
        html: html(`<p>Olá!</p><p>${atras ? 'O prazo de <b>dia 5</b> passou e' : 'Hoje (<b>dia 5</b>) é o prazo máximo, e'} a equipe <b>${eq}</b> ainda não inseriu no portal:</p><ul>${falta.map(f => `<li>${f}</li>`).join('')}</ul>
          <p>${atras ? 'Por favor, insira hoje.' : 'Por favor, insira até o fim do dia.'} Em seguida os gerentes votam a seleção na Peneira até o dia 10.</p>`) });
    }
  } else {
    const pend = await get(`vendas_selecao_imoveis?select=id,equipe&status=eq.pendente&mes_referencia=eq.${mes}&limit=2000`);
    if (pend.length) {
      const votos = await get(`vendas_selecao_votos?select=imovel_id,votante_nome&imovel_id=in.(${pend.map(p => p.id).join(',')})&limit=20000`);
      for (const [g, email] of Object.entries(GERENTES)) {
        const votou = new Set(votos.filter(v => String(v.votante_nome || '').startsWith(g)).map(v => v.imovel_id));
        const faltam = pend.filter(p => !votou.has(p.id));
        if (!faltam.length) continue;
        const porEq = faltam.reduce((o, p) => { o[p.equipe || '—'] = (o[p.equipe || '—'] || 0) + 1; return o; }, {});
        const atras = dia === 11;
        envios.push({ to: [email], cc: atras ? DIRETORIA : [],
          subject: `${atras ? '⚠️ Atrasado' : '🗳️ Prazo hoje'}: ${faltam.length} imóvel(is) da Peneira sem o seu voto (${nomeMes})`,
          html: html(`<p>Olá, ${g}!</p><p>${atras ? 'O prazo de <b>dia 10</b> passou e' : 'Hoje (<b>dia 10</b>) é o prazo para votar a seleção, e'} ainda há <b>${faltam.length}</b> imóvel(is) pendente(s) sem o seu voto:</p>
            <ul>${Object.entries(porEq).map(([e, n]) => `<li>Equipe ${e}: ${n}</li>`).join('')}</ul><p>Vote em Vendas → Peneira.</p>`) });
      }
    }
  }
  if (teste) return { statusCode: 200, body: JSON.stringify(envios.map(e => ({ to: e.to, cc: e.cc, subject: e.subject }))) };
  let ok = 0;
  for (const e of envios) {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + rk, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Portal Nova São Paulo <avisos@novasaopaulo.com.br>', reply_to: DIRETORIA, ...e }) });
    if (r.ok) ok++; else console.error('[prazos-vendas]', r.status, (await r.text()).slice(0, 200));
  }
  console.log('[prazos-vendas]', dia, mes, envios.length, 'avisos,', ok, 'enviados');
  return { statusCode: 200 };
};
