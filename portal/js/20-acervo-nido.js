/* =====================================================================
   20-acervo-nido.js — Acervo NIDO (vendas e locação até set/2026) · SÓ-LEITURA
   ---------------------------------------------------------------------
   Módulo Acervo (card próprio na home; itens: Nido e Guess). Consulta o
   recorte do backup do NIDO carregado em nido_* (SQL
   portal/sql/2026-09-30-acervo-nido.sql; carga por sandbox/carregar_nido.py).

   Busca por endereço do imóvel, edifício/condomínio, referência (chave,
   ex. MO19108), nome do proprietário ou CPF/CNPJ; filtro por situação.
   Ficha do imóvel: dados do imóvel, proprietário (CPF só com o miolo),
   propostas e negócios fechados. Contatos das pessoas ficam fora da API
   (grant por coluna) até a regra de retenção/acesso do Jurídico.
   Acesso às linhas = mesma lista do Guess (guess_acesso + admins).
   ===================================================================== */
(function () {
  'use strict';

  const LIMITE = 200;
  const COLS_V = 'chave_imovel,tipo_imovel,situacao,situacao_detalhe,data_cadastro,data_atualizacao,cep,bairro,logradouro,endereco,numero,unidade,andar,complemento,edificio,condominio,area_util_construida,dormitorio,suite,vaga,disponivel_venda,valor_venda,disponivel_locacao,valor_locacao,chave_pessoa_fj,proprietario_nome';
  const COLS_I = 'chave_imovel,codigo_anterior,tipo_imovel,classificacao,origem,situacao,situacao_detalhe,data_cadastro,data_atualizacao,data_ativo,locado_ate,cep,cidade,estado,bairro,regiao,logradouro,endereco,numero,unidade,andar,bloco,complemento,zoneamento,latitude,longitude,edificio,condominio,construtora,ano_construcao,area_total_terreno,area_util_construida,dormitorio,suite,vaga,banheiro,sala,disponivel_venda,valor_venda,disponivel_locacao,valor_locacao,valor_condominio,valor_iptu,exclusividade,placa,chave_pessoa_fj,contribuinte,matricula,registro';
  const COLS_P = 'chave_pessoa_fj,nome,proprietario,cliente,cpf_cnpj,bairro,cidade,estado,profissao,situacao';
  const COLS_PR = 'chave_proposta,chave_imovel,chave_pessoa_fj,data_cadastro,tipo_proposta,tipo_negocio,valor_proposta,valor_atual_proposta,porcentagem_comissao,valor_comissao,situacao,detalhe_situacao,data_encerramento,motivo_recusa,status_financiamento';
  const COLS_F = 'chave_fechamento,chave_imovel,chave_proposta,data_cadastro,data_fechamento,negocio,valor_fechamento,valor_faturamento,valor_comissao,parcelas,obs,situacao,mes_referencia,situacao_posvenda,parceria';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtData = d => { if (!d) return '—'; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
  const fmtHora = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const fmtVal = v => (v == null || Number(v) === 0 ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
  const fmtNum = v => (v == null || Number(v) === 0 ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
  const docMask = v => { const d = String(v == null ? '' : v).replace(/\D/g, '');
    if (d.length === 11) return '***.' + d.substr(3, 3) + '.' + d.substr(6, 3) + '-**';
    if (d.length === 14) return '**.' + d.substr(2, 3) + '.' + d.substr(5, 3) + '/' + d.substr(8, 4) + '-**';
    return d ? '***' : '—'; };
  const endereco = i => [[i.logradouro, i.endereco].filter(Boolean).join(' '), i.numero ? String(i.numero) : '', i.complemento, i.unidade ? 'ap. ' + i.unidade : '', i.andar ? i.andar + 'º' : ''].filter(Boolean).join(', ');
  const podeVer = () => (typeof podeAcessarAcervo === 'function' ? podeAcessarAcervo() : false);
  const aviso = (m, t) => { if (typeof toast === 'function') toast(m, t || ''); };
  const ilike = s => '*' + String(s).replace(/[%*,()]/g, ' ').trim().replace(/\s+/g, '*') + '*';

  let _root = null;

  function abrir() {
    _root = document.getElementById('acervo-nido-root');
    if (!_root) return;
    if (!podeVer()) { _root.innerHTML = '<div class="card cb">Acesso restrito a gerentes (lista guess_acesso).</div>'; return; }
    _root.innerHTML = `
      <div class="ph">
        <div><h1 class="pt">Acervo Nido — vendas e locação</h1>
          <div class="pst">Consulta só-leitura do backup do NIDO (imóveis, proprietários, propostas e negócios fechados, 2000–2026). Nada aqui é editável.</div></div>
      </div>
      <div class="card an-carimbo" style="padding:10px 14px;margin-bottom:14px;font-size:13px;border-left:4px solid var(--pri,#2563eb)">Carregando…</div>
      <div class="card" style="padding:12px 14px;margin-bottom:14px">
        <div class="flex aic" style="gap:8px;flex-wrap:wrap">
          <select id="an-tipo" style="padding:8px 12px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">
            <option value="endereco">Endereço do imóvel</option>
            <option value="edificio">Edifício / condomínio</option>
            <option value="referencia">Referência (ex.: MO19108)</option>
            <option value="proprietario">Nome do proprietário</option>
            <option value="documento">CPF / CNPJ do proprietário</option>
            <option value="cep">CEP</option>
          </select>
          <input type="text" id="an-busca" placeholder="🔍 Digite e pressione Enter…" style="flex:1;min-width:220px;padding:8px 12px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">
          <select id="an-sit" style="padding:8px 12px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">
            <option value="">Todas as situações</option>
            <option value="Ativo">Ativo</option>
            <option value="Inativo">Inativo</option>
            <option value="Suspenso">Suspenso</option>
          </select>
          <button class="btn btn-p" id="an-btn">Buscar</button>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:8px">Até ${LIMITE} imóveis por busca, dos mais recentes (última atualização) para os mais antigos. Clique na linha para abrir a ficha com propostas e fechamentos.</div>
      </div>
      <div id="an-res"></div>`;
    _root.querySelector('#an-btn').onclick = buscar;
    _root.querySelector('#an-busca').onkeydown = e => { if (e.key === 'Enter') buscar(); };
    carimbo();
  }

  async function carimbo() {
    const el = _root.querySelector('.an-carimbo'); if (!el) return;
    try {
      const cargas = await db.get('nido_cargas', '?select=tabela,linhas,carregado_em&order=carregado_em.desc&limit=5');
      if (!cargas || !cargas.length) { el.innerHTML = 'Acervo Nido ainda não carregado neste ambiente. <small>(sandbox/carregar_nido.py)</small>'; return; }
      const probe = await db.get('nido_imoveis', '?select=chave_imovel&limit=1');
      if (!probe || !probe.length) { el.innerHTML = '<span style="color:#b45309;font-weight:600">Seu usuário não está na lista de acesso ao acervo.</span> Peça ao Rodrigo ou ao Fabio (T.I.) para incluir seu e-mail em guess_acesso.'; return; }
      const tot = {}; cargas.forEach(c => { if (!tot[c.tabela]) tot[c.tabela] = c.linhas; });
      el.innerHTML = `Acervo carregado em <strong>${fmtHora(cargas[0].carregado_em)}</strong> · ` +
        Object.entries(tot).map(([t, n]) => `${t.replace('nido_', '')}: ${Number(n).toLocaleString('pt-BR')}`).join(' · ');
    } catch (e) {
      el.innerHTML = `<span style="color:#dc2626">Acervo indisponível: ${esc(e.message)}</span><br><small>As tabelas nido_* já foram criadas? (sql/2026-09-30-acervo-nido.sql)</small>`;
    }
  }

  async function buscar() {
    const tipo = _root.querySelector('#an-tipo').value;
    const termo = _root.querySelector('#an-busca').value.trim();
    const sit = _root.querySelector('#an-sit').value;
    const res = _root.querySelector('#an-res');
    if (!termo && !sit) { aviso('Digite algo para buscar ou escolha uma situação.', 'err'); return; }
    res.innerHTML = '<div class="card cb" style="color:var(--muted)">Buscando…</div>';
    try {
      let q = `?select=${COLS_V}&order=data_atualizacao.desc.nullslast&limit=${LIMITE}`;
      if (sit) q += `&situacao=eq.${encodeURIComponent(sit)}`;
      if (termo) {
        if (tipo === 'endereco')          q += `&endereco=ilike.${encodeURIComponent(ilike(termo))}`;
        else if (tipo === 'edificio')     q += `&or=(edificio.ilike.${encodeURIComponent(ilike(termo))},condominio.ilike.${encodeURIComponent(ilike(termo))})`;
        else if (tipo === 'referencia')   q += `&chave_imovel=ilike.${encodeURIComponent(termo.toUpperCase().replace(/\s+/g, '') + '*')}`;
        else if (tipo === 'proprietario') q += `&proprietario_nome=ilike.${encodeURIComponent(ilike(termo))}`;
        else if (tipo === 'cep')          q += `&cep=like.${encodeURIComponent(termo.replace(/\D/g, '') + '*')}`;
        else if (tipo === 'documento') {
          const dig = termo.replace(/\D/g, '');
          const pat = encodeURIComponent('*' + dig.split('').join('*') + '*');
          const ps = await db.get('nido_pessoas', `?select=chave_pessoa_fj&cpf_cnpj=ilike.${pat}&limit=50`);
          if (!ps || !ps.length) { res.innerHTML = '<div class="card cb" style="color:var(--muted)">Nenhuma pessoa com esse documento no acervo.</div>'; return; }
          q += `&chave_pessoa_fj=in.(${ps.map(p => '"' + p.chave_pessoa_fj + '"').join(',')})`;
        }
      }
      const dados = await db.get('nido_v_imoveis', q);
      renderResultados(dados || [], res);
    } catch (e) { res.innerHTML = `<div class="card cb" style="color:#dc2626">Erro na busca: ${esc(e.message)}</div>`; }
  }

  function badge(s) {
    const cor = s === 'Ativo' ? '#047857' : s === 'Inativo' ? '#475569' : '#b45309';
    const bg  = s === 'Ativo' ? '#d1fae5' : s === 'Inativo' ? '#e2e8f0' : '#fef3c7';
    return `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;background:${bg};color:${cor}">${esc(s || '—')}</span>`;
  }

  function renderResultados(lista, res) {
    if (!lista.length) { res.innerHTML = '<div class="card cb" style="color:var(--muted)">Nenhum imóvel encontrado.</div>'; return; }
    res.innerHTML = `
      <div style="font-size:13px;color:var(--muted);margin-bottom:8px">${lista.length} imóvel(is)${lista.length >= LIMITE ? ' (limite atingido — refine a busca)' : ''}</div>
      <div class="card"><div class="tw tbl"><table>
        <thead><tr><th>Ref.</th><th>Sit.</th><th>Tipo</th><th>Imóvel</th><th>Proprietário</th><th style="text-align:center">Área útil</th><th style="text-align:center">Dorm/Vg</th><th style="text-align:right">Venda</th><th style="text-align:right">Locação</th><th>Atualizado</th></tr></thead>
        <tbody>${lista.map((i, k) => `<tr class="an-row" data-i="${k}" style="cursor:pointer">
          <td style="font-weight:700;font-family:monospace">${esc(i.chave_imovel)}</td>
          <td>${badge(i.situacao)}${i.situacao_detalhe ? '<br><small style="color:var(--muted)">' + esc(i.situacao_detalhe) + '</small>' : ''}</td>
          <td>${esc(i.tipo_imovel || '—')}</td>
          <td>${esc(endereco(i) || '—')}<br><small style="color:var(--muted)">${esc([i.edificio || i.condominio, i.bairro].filter(Boolean).join(' · '))}</small></td>
          <td>${esc(i.proprietario_nome || '—')}</td>
          <td style="text-align:center">${fmtNum(i.area_util_construida)}</td>
          <td style="text-align:center">${i.dormitorio || '—'}/${i.vaga || '—'}</td>
          <td style="text-align:right;white-space:nowrap">${i.disponivel_venda === 'Sim' || Number(i.valor_venda) > 0 ? fmtVal(i.valor_venda) : '—'}</td>
          <td style="text-align:right;white-space:nowrap">${i.disponivel_locacao === 'Sim' || Number(i.valor_locacao) > 0 ? fmtVal(i.valor_locacao) : '—'}</td>
          <td style="white-space:nowrap">${fmtData(i.data_atualizacao)}</td></tr>`).join('')}</tbody>
      </table></div></div>`;
    res.querySelectorAll('.an-row').forEach(tr => tr.onclick = () => abrirFicha(lista[+tr.dataset.i].chave_imovel));
  }

  /* ---------- Ficha do imóvel ---------------------------------------- */
  const rot = {
    chave_imovel: 'Referência', codigo_anterior: 'Código anterior', tipo_imovel: 'Tipo', classificacao: 'Classificação', origem: 'Origem', situacao: 'Situação', situacao_detalhe: 'Detalhe',
    data_cadastro: 'Cadastro', data_atualizacao: 'Última atualização', data_ativo: 'Ativo desde', locado_ate: 'Locado até', cep: 'CEP', cidade: 'Cidade', estado: 'UF', bairro: 'Bairro', regiao: 'Região',
    zoneamento: 'Zoneamento', edificio: 'Edifício', condominio: 'Condomínio', construtora: 'Construtora', ano_construcao: 'Ano de construção', area_total_terreno: 'Área total/terreno (m²)', area_util_construida: 'Área útil (m²)',
    dormitorio: 'Dormitórios', suite: 'Suítes', vaga: 'Vagas', banheiro: 'Banheiros', sala: 'Salas', disponivel_venda: 'Disponível p/ venda', valor_venda: 'Valor de venda (pedido)', disponivel_locacao: 'Disponível p/ locação', valor_locacao: 'Valor de locação (pedido)',
    valor_condominio: 'Condomínio', valor_iptu: 'IPTU', exclusividade: 'Exclusividade', placa: 'Placa', contribuinte: 'Contribuinte (IPTU)', matricula: 'Matrícula', registro: 'Registro', latitude: 'Latitude', longitude: 'Longitude',
  };
  const fmtCampo = (k, v) => { if (v == null || v === '') return '—'; if (/^(data_|locado_)/.test(k)) return fmtData(v); if (/^valor_/.test(k)) return fmtVal(v); if (/^area_/.test(k)) return fmtNum(v); return esc(v); };
  const grade = (obj, chaves) => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px 14px;font-size:13px">` +
    chaves.filter(k => k in obj).map(k => `<div><div style="font-size:11px;color:var(--muted)">${esc(rot[k] || k)}</div><div>${fmtCampo(k, obj[k])}</div></div>`).join('') + `</div>`;
  const secao = (t, html) => `<div style="font-weight:700;font-size:13px;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--borda)">${t}</div>${html}`;
  const pessoaHTML = p => p ? `<div style="font-size:13px"><strong>${esc(p.nome)}</strong> <small style="color:var(--muted)">${esc(p.chave_pessoa_fj)}${p.proprietario === 'Sim' ? ' · proprietário' : ''}${p.cliente === 'Sim' ? ' · cliente' : ''}</small><br>
      <small>CPF/CNPJ ${docMask(p.cpf_cnpj)} · ${esc(p.bairro || '—')} · ${esc(p.cidade || '—')}${p.profissao ? ' · ' + esc(p.profissao) : ''}</small></div>` : '<div style="font-size:13px;color:var(--muted)">— pessoa não encontrada no recorte —</div>';
  const tabela = (cab, linhas, fn) => linhas.length ? `<div class="tw tbl"><table><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.map(fn).join('')}</tbody></table></div>` : '<div style="font-size:13px;color:var(--muted)">—</div>';

  async function abrirFicha(chave) {
    const old = document.getElementById('m-an-ficha'); if (old) old.remove();
    const ov = document.createElement('div'); ov.className = 'mo open'; ov.id = 'm-an-ficha';
    ov.innerHTML = `<div class="modal" style="width:900px;max-width:96vw"><div class="mh"><div class="mt">Imóvel ${esc(chave)} — ficha do Nido</div><button class="mc" onclick="document.getElementById('m-an-ficha').remove()">×</button></div><div class="mb an-mb">Carregando…</div></div>`;
    document.body.appendChild(ov);
    const mb = ov.querySelector('.an-mb');
    try {
      const [i] = await db.get('nido_imoveis', `?select=${COLS_I}&chave_imovel=eq.${encodeURIComponent(chave)}&limit=1`);
      if (!i) { mb.textContent = 'Imóvel não encontrado.'; return; }
      const [prop, props, fechs] = await Promise.all([
        i.chave_pessoa_fj ? db.get('nido_pessoas', `?select=${COLS_P}&chave_pessoa_fj=eq.${encodeURIComponent(i.chave_pessoa_fj)}&limit=1`).then(r => r && r[0]) : null,
        db.get('nido_propostas', `?select=${COLS_PR}&chave_imovel=eq.${encodeURIComponent(chave)}&order=data_cadastro.desc&limit=100`),
        db.get('nido_fechamentos', `?select=${COLS_F}&chave_imovel=eq.${encodeURIComponent(chave)}&order=data_fechamento.desc&limit=50`),
      ]);
      const chavesProp = [...new Set((props || []).map(p => p.chave_pessoa_fj).filter(Boolean))];
      const proponentes = chavesProp.length ? await db.get('nido_pessoas', `?select=${COLS_P}&chave_pessoa_fj=in.(${chavesProp.map(c => '"' + c + '"').join(',')})`) : [];
      const nomeDe = c => { const p = (proponentes || []).find(x => x.chave_pessoa_fj === c); return p ? esc(p.nome) + ' <small style="color:var(--muted)">' + docMask(p.cpf_cnpj) + '</small>' : '<small style="color:var(--muted)">' + esc(c || '—') + '</small>'; };
      mb.innerHTML =
        secao('Imóvel', `<div style="font-size:14px;margin-bottom:8px"><strong>${esc(endereco(i) || '—')}</strong> · ${esc(i.bairro || '')} · ${esc(i.cidade || '')}/${esc(i.estado || '')} · CEP ${esc(i.cep || '—')}</div>` +
          grade(i, ['chave_imovel', 'codigo_anterior', 'tipo_imovel', 'classificacao', 'situacao', 'situacao_detalhe', 'origem', 'data_cadastro', 'data_atualizacao', 'data_ativo', 'locado_ate', 'edificio', 'condominio', 'construtora', 'ano_construcao', 'zoneamento', 'regiao'])) +
        secao('Características e valores pedidos', grade(i, ['area_util_construida', 'area_total_terreno', 'dormitorio', 'suite', 'vaga', 'banheiro', 'sala', 'disponivel_venda', 'valor_venda', 'disponivel_locacao', 'valor_locacao', 'valor_condominio', 'valor_iptu', 'exclusividade', 'placa', 'contribuinte', 'matricula', 'registro'])) +
        secao('Proprietário', pessoaHTML(prop)) +
        secao(`Propostas (${(props || []).length})`, tabela(['Data', 'Tipo', 'Negócio', 'Proponente', 'Valor', 'Situação', 'Encerrada em', 'Motivo'], props || [], p =>
          `<tr><td style="white-space:nowrap">${fmtData(p.data_cadastro)}</td><td>${esc(p.tipo_proposta || '')}</td><td>${esc(p.tipo_negocio || '')}</td><td>${nomeDe(p.chave_pessoa_fj)}</td><td style="white-space:nowrap">${fmtVal(p.valor_atual_proposta || p.valor_proposta)}</td><td>${esc(p.situacao || '')}${p.detalhe_situacao ? '<br><small>' + esc(p.detalhe_situacao) + '</small>' : ''}</td><td style="white-space:nowrap">${fmtData(p.data_encerramento)}</td><td><small>${esc(p.motivo_recusa || '')}</small></td></tr>`)) +
        secao(`Negócios fechados (${(fechs || []).length})`, tabela(['Data', 'Negócio', 'Valor fechado', 'Comissão', 'Situação', 'Pós-venda', 'Parceria', 'Obs.'], fechs || [], f =>
          `<tr><td style="white-space:nowrap">${fmtData(f.data_fechamento)}</td><td>${esc(f.negocio || '')}</td><td style="white-space:nowrap;font-weight:600">${fmtVal(f.valor_fechamento)}</td><td style="white-space:nowrap">${fmtVal(f.valor_comissao)}</td><td>${esc(f.situacao || '')}</td><td>${esc(f.situacao_posvenda || '')}</td><td>${esc(f.parceria || '')}</td><td><small>${esc(f.obs || '')}</small></td></tr>`)) +
        `<div style="font-size:12px;color:var(--muted);margin-top:14px">Telefones, e-mails e endereço das pessoas ficam fora da consulta até a regra de retenção e acesso do Jurídico. Corretor angariador e fotos: próxima versão.</div>`;
    } catch (e) { mb.innerHTML = `<span style="color:#dc2626">Erro: ${esc(e.message)}</span>`; }
  }

  window.AcervoNido = { abrir, buscar, abrirFicha };
})();
