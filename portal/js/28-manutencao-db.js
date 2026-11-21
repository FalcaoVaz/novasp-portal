// ═══════════════════════════════════════════════════════════════
// MANUTENÇÃO NO BANCO (21/11/2026) — etapa 2 da saída do Apps Script.
// As telas continuam chamando gasGet(GAS_MANUTENCAO, {acao:...}); o 00-config desvia para cá e devolvemos o
// MESMO formato que o Apps Script devolvia (lista com cabeçalho da planilha), para nenhuma tela mudar.
// Tabelas: manutencao_chamados + manutencao_andamentos (sql/2026-11-21-manutencao-supabase.sql).
// E-mail ao inquilino: função falcaovaz enviar-aviso (Resend; respostas p/ contato@ + João; cópia p/ João).
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const AVISO_FN = 'https://falcaovaz.netlify.app/.netlify/functions/enviar-aviso';
  const CAB = ['Protocolo', 'Data', 'Nome', 'Telefone', 'Email', 'Endereço', 'Tipo Serviço', 'Status', 'Responsabilidade', 'Profissional', 'Observações', 'Valor', 'Retorno 10%'];
  const COL = ['protocolo', 'data', 'nome', 'telefone', 'email', 'endereco', 'tipo_servico', 'status', 'responsabilidade', 'profissional', 'observacoes', 'valor', 'retorno_10'];
  const dataISO = s => { const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : (/^\d{4}-\d{2}-\d{2}/.test(String(s)) ? String(s).slice(0, 10) : null); };
  const quem = () => (typeof CUR !== 'undefined' && CUR && CUR.nome) || '';
  const fmt = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };

  async function patchProto(protocolo, dados) {
    const r = await db._fetch(SBU + '/rest/v1/manutencao_chamados?protocolo=eq.' + encodeURIComponent(protocolo), { method: 'PATCH', body: JSON.stringify(dados) });
    const b = await r.json().catch(() => null);
    if (!r.ok) throw new Error((b && b.message) || 'falha ao gravar');
    if (!Array.isArray(b) || !b.length) throw new Error('Protocolo não encontrado');
    return b[0];
  }
  const andamento = (protocolo, status, mensagem) => db.post('manutencao_andamentos', { protocolo, status: status || '', mensagem: mensagem || '', autor: quem() });

  // e-mail: falha não desfaz o chamado — só avisa
  async function avisar(protocolo, titulo, mensagem) {
    try {
      const r = await fetch(AVISO_FN, { method: 'POST', headers: { Authorization: hdr().Authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'manutencao', protocolo, titulo, mensagem }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.erro || r.status);
      if (j.enviado === false && typeof toast === 'function') toast('Chamado gravado. Sem e-mail do solicitante: ninguém foi avisado.', '');
    } catch (e) {
      console.warn('[manutencao] aviso por e-mail falhou:', e.message);
      if (typeof toast === 'function') toast('Chamado gravado, mas o e-mail ao solicitante não saiu (' + e.message + ').', 'err');
    }
  }

  window._manDb = async function (p) {
    const acao = p.acao;
    if (acao === 'listar_chamados') {
      const rows = await db.get('manutencao_chamados', '?select=' + COL.join(',') + '&order=data.asc,criado_em.asc&limit=10000');
      return [CAB].concat(rows.map(r => COL.map(c => c === 'data' ? (r.data ? r.data + 'T03:00:00.000Z' : '') : (r[c] == null ? '' : r[c]))));
    }
    if (acao === 'buscar_chamado') {
      const [c] = await db.get('manutencao_chamados', '?select=*&protocolo=eq.' + encodeURIComponent(p.protocolo) + '&limit=1');
      if (!c) return { status: 'erro', msg: 'Protocolo nao encontrado' };
      const and = await db.get('manutencao_andamentos', '?select=em,status,mensagem,autor&protocolo=eq.' + encodeURIComponent(p.protocolo) + '&order=em.desc');
      const o = {}; CAB.forEach((h, i) => { o[h] = c[COL[i]]; });
      o.andamentos = and.map(a => ({ status: a.status, data: fmt(a.em), mensagem: (a.mensagem || '') + (a.autor ? ' — ' + a.autor : '') }));
      return o;
    }
    if (acao === 'abrir') {
      const d = JSON.parse(decodeURIComponent(p.dados || '{}'));
      if (!d.protocolo) throw new Error('protocolo');
      const m = String(d.obs || '').match(/Atendimento realizado por: ([^.]+)\./);
      await db.post('manutencao_chamados', { protocolo: d.protocolo, data: dataISO(d.data) || new Date().toISOString().slice(0, 10), nome: d.nome || '', telefone: d.telefone || '',
        email: d.email || '', endereco: d.endereco || '', tipo_servico: d.servico || '', observacoes: d.obs || '', status: 'Aberto', aberto_por: m ? m[1].trim() : quem() });
      await andamento(d.protocolo, 'Aberto', 'Chamado aberto');
      await avisar(d.protocolo, 'recebido', '');
      return { status: 'ok', protocolo: d.protocolo };
    }
    if (acao === 'atribuir_responsabilidade') {
      const set = {}; if (p.responsabilidade) set.responsabilidade = p.responsabilidade; if (p.profissional) set.profissional = p.profissional;
      if (Object.keys(set).length) await patchProto(p.protocolo, set);
      await andamento(p.protocolo, 'Responsabilidade', 'Responsabilidade: ' + (p.responsabilidade || '—') + (p.profissional ? ' · Profissional: ' + p.profissional : '') + (p.mensagem ? ' · ' + p.mensagem : ''));
      await avisar(p.protocolo, 'Atualização no chamado', p.mensagem);
      return { status: 'ok' };
    }
    if (acao === 'atualizar_status') {
      await patchProto(p.protocolo, { status: p.novo_status });
      await andamento(p.protocolo, p.novo_status, p.mensagem);
      await avisar(p.protocolo, p.novo_status, p.mensagem);
      return { status: 'ok' };
    }
    return { status: 'erro', msg: 'Acao invalida' };
  };
})();
