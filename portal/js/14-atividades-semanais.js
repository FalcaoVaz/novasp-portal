// ════════════════════════════════════════════════════════
// ATIVIDADES SEMANAIS — check-in semanal dos liderados
// Reseta automaticamente toda segunda (não apaga histórico,
// só não traz os checks da semana anterior).
// ════════════════════════════════════════════════════════

let _atvEditId = null;

// ISO Week: 'YYYY-Www' — ex: '2026-W26'
function _semanaIso(d) {
  const dt = d ? new Date(d) : new Date();
  dt.setHours(0,0,0,0);
  // ajusta para quinta-feira da mesma semana (regra ISO)
  dt.setDate(dt.getDate() + 4 - (dt.getDay() || 7));
  const yearStart = new Date(dt.getFullYear(), 0, 1);
  const weekNum = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
  return dt.getFullYear() + '-W' + String(weekNum).padStart(2, '0');
}

function _labelSemana(d) {
  const dt = d || new Date();
  const seg = new Date(dt); seg.setDate(seg.getDate() - ((seg.getDay() || 7) - 1));
  const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
  const fmt = x => x.toLocaleDateString('pt-BR', {day:'2-digit', month:'short'});
  return `Semana de ${fmt(seg)} a ${fmt(dom)} · ${_semanaIso(dt)}`;
}

async function carregarAtividadesSemanais() {
  const lista = document.getElementById('atv-lista');
  const lbl   = document.getElementById('atv-semana-label');
  if (!lista) return;
  const semana = _semanaIso();
  if (lbl) lbl.textContent = _labelSemana();

  if (!CUR?.id) { lista.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8">Sem usuário.</div>'; return; }

  let ats, checks;
  try {
    [ats, checks] = await Promise.all([
      db.get('atividades_semanais', `?usuario_id=eq.${CUR.id}&ativo=eq.true&order=ordem.asc,criado_em.asc`),
      db.get('atividades_semanais_check', `?usuario_id=eq.${CUR.id}&semana_iso=eq.${semana}&select=id,atividade_id,feito,feito_em`)
    ]);
  } catch(e) {
    lista.innerHTML = `<div style="padding:24px;text-align:center;color:var(--danger)">Erro: ${e.message}<br><small>A tabela já foi criada no Supabase?</small></div>`;
    return;
  }

  const chkMap = {};
  (checks||[]).forEach(c => { chkMap[c.atividade_id] = c; });

  if (!ats?.length) {
    lista.innerHTML = `<div class="card" style="padding:32px;text-align:center;color:#64748b">
      <p style="font-size:14px;margin-bottom:8px">Nenhuma atividade cadastrada ainda.</p>
      <p style="font-size:12px;color:#94a3b8">Clique em <b>+ Atividade</b> pra criar a primeira.</p>
    </div>`;
    return;
  }

  const feitas = ats.filter(a => chkMap[a.id]?.feito).length;
  const total = ats.length;
  const pct = Math.round(feitas/total*100);

  let html = `<div class="card" style="padding:14px 18px;margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--txt)">Progresso da semana</div>
        <div style="font-size:11px;color:#94a3b8">${feitas} de ${total} marcadas</div>
      </div>
      <div style="font-size:22px;font-weight:800;color:${pct===100?'var(--verde)':'var(--pri)'}">${pct}%</div>
    </div>
    <div style="background:#e2e8f0;height:6px;border-radius:3px;margin-top:10px;overflow:hidden">
      <div style="background:${pct===100?'var(--verde)':'var(--pri)'};width:${pct}%;height:100%;transition:width .3s"></div>
    </div>
  </div>`;

  html += ats.map(a => {
    const chk = chkMap[a.id];
    const feito = !!chk?.feito;
    const hora = chk?.feito_em ? new Date(chk.feito_em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
    return `<div class="card" style="padding:14px 18px;margin-bottom:8px;display:flex;align-items:center;gap:14px;${feito?'background:#f0fdf4;border-color:#86efac':''}">
      <label style="display:flex;align-items:center;gap:14px;cursor:pointer;flex:1">
        <input type="checkbox" ${feito?'checked':''} onchange="marcarAtividade('${a.id}',this.checked)" style="width:22px;height:22px;accent-color:var(--verde);cursor:pointer">
        <div style="flex:1">
          <div style="font-size:14px;font-weight:${feito?'500':'600'};${feito?'color:#16a34a;text-decoration:line-through':''}">${a.descricao}</div>
          ${hora ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">Marcada em ${hora}</div>` : ''}
        </div>
      </label>
      <button class="btn btn-o bxs" onclick="abrirEditarAtividadeSemanal('${a.id}')" title="Editar">✏️</button>
      <button class="btn btn-o bxs" style="color:var(--danger)" onclick="excluirAtividadeSemanal('${a.id}','${(a.descricao||'').replace(/'/g,'')}')" title="Excluir">×</button>
    </div>`;
  }).join('');

  lista.innerHTML = html;

  // Para admin: mostra acompanhamento dos liderados
  if (CUR.admin) carregarAtividadesLiderados(semana);
}

function abrirNovaAtividadeSemanal() {
  _atvEditId = null;
  document.getElementById('m-atv-sem-titulo').textContent = '+ Nova Atividade Semanal';
  document.getElementById('atv-sem-desc').value = '';
  openM('m-atv-sem');
}

async function abrirEditarAtividadeSemanal(id) {
  try {
    const list = await db.get('atividades_semanais', `?id=eq.${id}&select=*`);
    const a = list?.[0];
    if (!a) { toast('Atividade não encontrada.','err'); return; }
    _atvEditId = id;
    document.getElementById('m-atv-sem-titulo').textContent = '✏️ Editar Atividade';
    document.getElementById('atv-sem-desc').value = a.descricao || '';
    openM('m-atv-sem');
  } catch(e) {
    toast('Erro: '+e.message,'err');
  }
}

async function salvarAtividadeSemanal() {
  const desc = document.getElementById('atv-sem-desc')?.value?.trim();
  if (!desc) { toast('Descreva a atividade.','err'); return; }
  try {
    if (_atvEditId) {
      await db.patch('atividades_semanais', _atvEditId, { descricao: desc });
      toast('✅ Atividade atualizada.','ok');
    } else {
      await db.post('atividades_semanais', {
        usuario_id:    CUR.id,
        descricao:     desc,
        criado_por_id: CUR.id
      });
      toast('✅ Atividade criada.','ok');
    }
    _atvEditId = null;
    closeM('m-atv-sem');
    carregarAtividadesSemanais();
  } catch(e) {
    toast('Erro: '+e.message,'err');
  }
}

async function excluirAtividadeSemanal(id, desc) {
  if (!confirm(`Excluir "${desc}"? Vai sumir da sua lista semanal mas o histórico continua.`)) return;
  try {
    // Desativa em vez de deletar (preserva histórico)
    await db.patch('atividades_semanais', id, { ativo: false });
    toast('🗑️ Atividade removida.','ok');
    carregarAtividadesSemanais();
  } catch(e) {
    toast('Erro: '+e.message,'err');
  }
}

async function marcarAtividade(atividadeId, feito) {
  const semana = _semanaIso();
  try {
    if (feito) {
      // Upsert: tenta inserir; se já existir (UNIQUE atividade+semana), atualiza
      try {
        await db.post('atividades_semanais_check', {
          atividade_id: atividadeId,
          usuario_id:   CUR.id,
          semana_iso:   semana,
          feito:        true,
          feito_em:     new Date().toISOString()
        });
      } catch(_) {
        // já existia — busca e atualiza
        const ex = await db.get('atividades_semanais_check', `?atividade_id=eq.${atividadeId}&semana_iso=eq.${semana}&select=id&limit=1`);
        if (ex?.[0]) {
          await db.patch('atividades_semanais_check', ex[0].id, { feito: true, feito_em: new Date().toISOString() });
        }
      }
    } else {
      // Desmarca: busca e deleta o check
      const ex = await db.get('atividades_semanais_check', `?atividade_id=eq.${atividadeId}&semana_iso=eq.${semana}&select=id&limit=1`);
      if (ex?.[0]) await db.del('atividades_semanais_check', ex[0].id);
    }
    carregarAtividadesSemanais();
  } catch(e) {
    toast('Erro ao marcar: '+e.message,'err');
  }
}

// Painel admin: acompanhamento dos liderados na semana
async function carregarAtividadesLiderados(semana) {
  const bloco = document.getElementById('atv-liderados-bloco');
  const cont  = document.getElementById('atv-liderados-lista');
  if (!bloco || !cont) return;
  try {
    // Busca usuários que tem atividades cadastradas
    const usersComAtv = await db.get('atividades_semanais', '?ativo=eq.true&select=usuario_id&limit=500');
    if (!usersComAtv?.length) { bloco.style.display='none'; return; }
    const usuarioIds = Array.from(new Set(usersComAtv.map(u=>u.usuario_id))).filter(id=>id!==CUR.id);
    if (!usuarioIds.length) { bloco.style.display='none'; return; }

    // Para cada usuario: nome + total de atividades + total feitas nesta semana
    const ids = usuarioIds.join(',');
    const [usuarios, todasAts, checksSem] = await Promise.all([
      db.get('usuarios', `?id=in.(${ids})&select=id,nome`),
      db.get('atividades_semanais', `?usuario_id=in.(${ids})&ativo=eq.true&select=id,usuario_id`),
      db.get('atividades_semanais_check', `?usuario_id=in.(${ids})&semana_iso=eq.${semana}&feito=eq.true&select=usuario_id,atividade_id`)
    ]);
    const totalPorUser = {};
    todasAts.forEach(a => totalPorUser[a.usuario_id] = (totalPorUser[a.usuario_id]||0)+1);
    const feitoPorUser = {};
    checksSem.forEach(c => feitoPorUser[c.usuario_id] = (feitoPorUser[c.usuario_id]||0)+1);

    const linhas = (usuarios||[]).map(u => {
      const tot = totalPorUser[u.id] || 0;
      const fei = feitoPorUser[u.id] || 0;
      const pct = tot ? Math.round(fei/tot*100) : 0;
      const cor = pct===100 ? 'var(--verde)' : pct>=50 ? 'var(--pri)' : pct>0 ? 'var(--amber)' : 'var(--danger)';
      return `<div class="card" style="padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;gap:14px">
        <div style="width:34px;height:34px;border-radius:50%;background:${cor}22;color:${cor};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${u.nome.split(' ').slice(0,2).map(n=>n[0]).join('')}</div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:600">${u.nome.split(' ').slice(0,2).join(' ')}</div>
          <div style="font-size:11px;color:#94a3b8">${fei} de ${tot} marcadas esta semana</div>
        </div>
        <div style="font-size:18px;font-weight:800;color:${cor}">${pct}%</div>
      </div>`;
    }).sort().join('');

    cont.innerHTML = linhas || '<div style="padding:14px;color:#94a3b8;font-size:13px">Nenhum liderado com atividades.</div>';
    bloco.style.display = '';
  } catch(e) {
    console.warn('liderados:', e);
    bloco.style.display = 'none';
  }
}
