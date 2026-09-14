// ════════════════════════════════════════════════════════
// REGRAS E PROCESSOS — Vendas, Locação, Financeiro, RH
// Conteúdo padronizado a partir dos documentos oficiais
// fornecidos pela diretoria (jun/2026).
// ════════════════════════════════════════════════════════

const REGRAS_META = {
  vendas:     { titulo:'Vendas',     icone:'💼', cor:'#3B82F6', bg:'#dbeafe', txt:'#1d4ed8', atualizado:'Junho/2026' },
  locacao:    { titulo:'Locação',    icone:'🏠', cor:'#10B981', bg:'#d1fae5', txt:'#047857', atualizado:'Março/2026' },
  financeiro: { titulo:'Financeiro', icone:'💰', cor:'#F59E0B', bg:'#fef3c7', txt:'#92400e', atualizado:'Março/2026' },
  rh:         { titulo:'RH',         icone:'👥', cor:'#8B5CF6', bg:'#ede9fe', txt:'#6d28d9', atualizado:'Junho/2026' },
  adm:        { titulo:'Administração', icone:'🏢', cor:'#0EA5E9', bg:'#e0f2fe', txt:'#0369a1', atualizado:'Julho/2026' }
};

// Estrutura padronizada: cada departamento é uma lista de SEÇÕES.
// Cada seção tem { titulo, itens:[{num,texto}|texto] }.
const REGRAS_DATA = {
  // ─────────────────────────────────────────────────────────
  financeiro: [
    { titulo:'Contas a Pagar', itens:[
      { num:'1.1', texto:'É obrigatória a utilização do sistema <b>GUESS</b> (sistema de locação). Todas as solicitações de pagamento devem ser enviadas ao departamento financeiro por e-mail com antecedência mínima de <b>48 horas úteis</b> em relação à data de vencimento.' },
      { num:'1.2', texto:'Exceções e emergências (pagamentos fora do prazo estipulado) deverão ser aprovadas por um dos diretores, formalizando-se o processo de liberação por escrito.' },
      { num:'1.3', texto:'<b>Alçadas para aprovação de depósitos:</b><ul><li><b>Até R$ 10.000,00:</b> Aprovado pelo gerente financeiro.</li><li><b>Acima de R$ 20.000,00:</b> Assinatura de um diretor em requerimento próprio.</li><li><b>Acima de R$ 50.000,00:</b> Assinatura de dois diretores.</li></ul>' },
      { num:'1.4', texto:'Pagamentos via caixa (dinheiro) têm limite de <b>R$ 1.000,00</b> e exigem autorização do gerente responsável.' },
      { num:'1.5', texto:'Os pagamentos de comissões de terceiros devem ser enviados por e-mail pelo gerente responsável, juntamente com o fechamento do sistema NIDO (vendas), informando as contas bancárias dos envolvidos.' },
    ]},
    { titulo:'Inquilinos', itens:[
      { texto:'O envio dos boletos de cobrança de aluguel será efetuado com no mínimo <b>15 dias de antecedência</b> da data de vencimento, conforme a tabela abaixo:' },
      { tabela:[
        ['Dia do envio','Vencimentos'],
        ['Dia 5','Dias 20 a 24'],
        ['Dia 10','Dias 25 a 31'],
        ['Dia 15','Dias 1 a 4'],
        ['Dia 20','Dias 5 a 9'],
        ['Dia 25','Dias 10 a 14'],
        ['Dia 30','Dias 15 a 19']
      ]},
      { num:'2.1', texto:'Após o processamento do arquivo bancário, o inquilino receberá o boleto via correio (envio Itaú) e pelo e-mail cadastrado no sistema.' },
    ]},
    { titulo:'Proprietários', itens:[
      { num:'3.1', texto:'O repasse aos proprietários é efetuado <b>48 horas úteis</b> após o pagamento do boleto pelo inquilino (mesmo que o contrato estipule 5 dias úteis). <i>Exceção: proprietários que optaram por receber em data única no mês.</i>' },
      { num:'3.2', texto:'Após o repasse, o extrato/holerite será enviado por e-mail em até <b>48 horas</b>.' },
    ]},
    { titulo:'Seguros', itens:[
      { texto:'A renovação de seguros (Fiança/Incêndio) deve ser informada ao inquilino por e-mail com antecedência mínima de <b>30 dias</b> do vencimento da apólice. Após o aceite, o valor será incluído no próximo vencimento do aluguel.' },
    ]},
    { titulo:'Atendimentos', itens:[
      { num:'5.1', texto:'Todos os atendimentos e solicitações (e-mail ou WhatsApp) devem ser respondidos em <b>no máximo 3 horas</b> após o recebimento.' },
      { num:'5.2', texto:'Caso a solicitação não seja de competência do financeiro, o colaborador deve informar o solicitante e encaminhar ao departamento responsável imediatamente.' },
      { num:'5.3', texto:'Se uma questão não for resolvida em primeira instância, escalonar para a supervisão ou gerência financeira — evitar que o cliente sinta que sua reclamação está estagnada.' },
      { num:'5.4', texto:'Qualquer negociação de dívida ou isenção de multa deve ser formalizada por escrito e assinada por ambas as partes (ou via e-mail com confirmação). <b>Acordos verbais não possuem validade operacional.</b>' },
      { num:'5.5', texto:'A imobiliária atua como <b>intermediadora</b> dos interesses de proprietários e inquilinos — não como parte interessada ou "juiz". Foco na aplicação do contrato e manutenção da relação comercial.' },
    ]},
    { titulo:'Segurança de Dados (LGPD)', itens:[
      { num:'6.1', texto:'É proibido o envio de dados sensíveis (CPF, dados bancários completos, cópias de documentos) por canais não seguros (WhatsApp comum ou e-mails sem criptografia), exceto se o arquivo estiver protegido por senha.' },
      { num:'6.2', texto:'Toda alteração de dados bancários do proprietário deve ser <b>confirmada por telefone ou videochamada</b>, para evitar fraudes de terceiros.' },
    ]},
  ],

  // ─────────────────────────────────────────────────────────
  locacao: [
    { titulo:'Atendimento / FACs NIDO', itens:[
      { texto:'É obrigatória a utilização do sistema <b>NIDO</b> em todas as agências.' },
      { texto:'Todos os clientes atendidos pelos corretores devem ser cadastrados no NIDO, independentemente da forma que chegaram à empresa.' },
      { texto:'Primeiros atendimentos devem ocorrer em <b>até 3 horas</b> com follow-up no sistema. Ultrapassado o prazo, a FAC é redistribuída. Follow-ups genéricos ("ok", "em atendimento", só referência do imóvel) não contam.' },
      { texto:'Corretores devem baixar todos os clientes que não estão sendo atendidos.' },
      { texto:'Todos os follow-ups, propostas, cadastros de imóveis e confirmações de locação devem estar no NIDO. Atos não cadastrados são considerados inexistentes.' },
      { texto:'No primeiro atendimento (telefone/presencial/placa/procura), verificar se o cliente já está sendo atendido pela INSP (NIDO checa por telefone/e-mail).' },
      { texto:'Em caso de mesmo cliente atendido por 2 corretores, prevalece o primeiro com FAC ativa e atualizada (até 100 clientes simultâneos).' },
      { texto:'FACs sem follow-up real podem ser encerradas sem aviso. Sem follow-up por mais de 3 horas, a FAC é arquivada automaticamente.' },
    ]},
    { titulo:'Angariação / Fichas / Regras de Qualidade', itens:[
      { texto:'Todos os imóveis devem ser cadastrados no NIDO. Em caso de 2 corretores angariarem o mesmo, prevalece quem inseriu o cadastro primeiro de forma <b>completa e correta</b> (numeração, bloco, valores, contato, metragens).' },
      { texto:'Taxa de administração padrão: <b>8% sobre o valor da locação</b>. Valor inferior precisa de autorização da diretoria.' },
      { texto:'Primeiro aluguel: <b>100% para a imobiliária</b> (início do trabalho administrativo).' },
      { texto:'Imóveis vindos de outras imobiliárias: cobrança do primeiro aluguel + taxa de 8% mensal. Inferior só com autorização da diretoria.' },
      { num:'8.1', texto:'Para aprovação da ficha são obrigatórios: <b>matrícula, último boleto de condomínio, IPTU e autorização por escrito</b> do proprietário.' },
      { texto:'Quando o imóvel for passível de avaliação pelo Iconatus, o link da avaliação deve ser inserido no texto interno. Sem o link, a ficha não é aprovada.' },
      { texto:'Mínimo <b>20 fotos</b> para residenciais (horizontais; até 5 verticais, a primeira sempre horizontal). Comerciais ou terrenos: mínimo 5 fotos horizontais. <b>Vedadas:</b> ilustrativas, marca d\'água, datas, descrição de cômodos, animais, porta-retratos, sombras ou pessoas.' },
      { texto:'Fotógrafo profissional da imobiliária: 1% da comissão quando o imóvel for locado, descontado da "cabeça".' },
      { texto:'Ficha provisória: máximo <b>7 dias</b> + 7 dias prorrogáveis. Pendência sem resolução em 14 dias → ficha baixada.' },
      { num:'17.1', texto:'Autorizações fora do padrão (anúncios de outras empresas, sem nome da INSP, sem comissão/valor/IPTU/endereço) não são aceitas.' },
      { texto:'Ficha sem requisitos mínimos: prazo de <b>48h</b> para regularizar. Não atendendo, reprovada. Sanada → +72h para aprovação.' },
      { texto:'Não inserir telefone da Nova São Paulo ou de corretores no campo "proprietário". Em caso justificado, usar "dados protegidos" com justificativa no texto interno.' },
      { texto:'Endereço, nome ou contato do proprietário errado → corretor pode perder a angariação se outro reabrir a ficha corretamente.' },
      { texto:'Sobrados novos com alteração de numeração pela prefeitura: corretor mantém angariação se atualizar em até 30 dias.' },
      { texto:'CEP da mesma rua, número diferente → vale a primeira ficha. Outro bairro/nome de rua → perde angariação.' },
      { texto:'Imóveis novos com várias unidades iguais → 1 ficha só, numerações no texto interno. Fotos ilustrativas/decorado apenas no site.' },
      { texto:'Proibido cadastrar imóveis vindos de parcerias comerciais. Campo "proprietário" deve ser sempre do real proprietário.' },
      { texto:'Chaves de imóvel à venda: custódia da agência do angariador. Retirada via protocolo, devolução em <b>24 horas</b>. Perda → corretor responsável pela reposição.' },
      { texto:'30 dias para colocar placa. Não fez → outro colega pode colocar e receber chamadas; angariação permanece.' },
      { texto:'Ficha sem atualização por mais de <b>60 dias</b>: mensagem do sistema + 5 dias para atualizar. Não fez → pode perder angariação/promoção.' },
      { texto:'Imóveis suspensos: prazo máximo <b>90 dias</b>. Ultrapassado, pode ser reaberto por outro corretor (apenas com autorização atualizada).' },
      { texto:'Captações com portaria/zelador: gratificação de <b>5% a 10%</b> da comissão (definido pelo angariador). Guardas de rua: 5%.' },
    ]},
    { titulo:'Exclusividade', itens:[
      { texto:'Exclusividade por escrito: corretor tem direito a <b>10% do total da comissão</b> (descontados da "cabeça"), além da angariação. Deve ser obtida no ato da captação (não vale após proposta).' },
      { texto:'Imóveis exclusivos têm prioridade em publicidade. Documentação analisada previamente, localização na área da INSP, preço de mercado. Autorização assinada com dados completos.' },
      { texto:'Exclusividade cadastrada por prazo mínimo de <b>90 dias</b>.' },
      { num:'28', texto:'Imóvel deve estar cadastrado no sistema há pelo menos 30 dias.' },
      { texto:'Contrato de exclusividade pode admitir parcerias com outras imobiliárias.' },
      { texto:'No imóvel exclusivo, o corretor pode centralizar as visitas, encaminhando colegas e interessados — sem benefício além do %.' },
      { texto:'Todos os corretores podem oferecer esses imóveis e receberão comissão de venda normalmente.' },
      { num:'32', texto:'Requisitos: imóvel bem localizado, preço de mercado, documentação OK (análise jurídica INSP), autorização por escrito com dados dos vendedores e do imóvel.' },
    ]},
    { titulo:'Propostas', itens:[
      { texto:'Inclusões devem ser feitas pelo NIDO e servem como base para prioridade. Todas verificadas pelos gestores antes do cadastro. Propostas escritas exigem: nome completo, documento, tipo de fiança, valor.' },
      { texto:'Validade: <b>14 dias</b>. Após inclusão, proibido levar novos clientes ao imóvel. Segunda proposta → primeira tem 72 horas (úteis) para ser resolvida.' },
      { num:'34', texto:'Imóvel desocupado pode ser visitado por outros corretores após o 8º dia de proposta.' },
      { num:'34.1', texto:'Gerentes incluem o fechamento no sistema em até <b>2 dias úteis</b> da assinatura. Lançamento no 1º dia útil seguinte ao contrato.' },
      { texto:'Proposta verbal não interfere no prazo da escrita. Verbal posterior à escrita não muda nada. Escrita posterior a verbal: a verbal tem 24h para virar escrita.' },
      { texto:'Proposta cai (desistência ou documentação): baixa imediata pelo gerente, com motivo real registrado no NIDO.' },
    ]},
    { titulo:'Plantões', itens:[
      { texto:'Plantonista recebe <b>5% da "cabeça"</b> em caso de locação. Abertura depende da gerência/diretoria após análise dos requisitos.' },
      { texto:'Requisitos: imóvel bem localizado, vago, preço de mercado, documentação OK, autorização por escrito completa.' },
      { texto:'Antes de autorizar, gerência analisa requisitos e arquiva: matrícula, IPTU e autorização de locação.' },
      { texto:'Corretor visita o local semanalmente e cadastra contatos no NIDO. Retorno do plantão vai ao corretor responsável.' },
      { texto:'Prazo máximo: <b>3 meses</b>, avaliados mensalmente. Sem retorno satisfatório no 1º mês → desativação.' },
      { texto:'Na desativação: corretor devolve itens (placas, faixas, cavalete, mesa, cadeira, guarda-sol). Sem devolução → cobrança. Exceção: furto/roubo com B.O.' },
    ]},
  ],

  // ─────────────────────────────────────────────────────────
  vendas: [
    { titulo:'Atendimento / FACs / Leads — C2S e NIDO', itens:[
      { texto:'É obrigatória a utilização dos sistemas <b>C2S e NIDO</b> em todas as agências.' },
      { num:'1.1', texto:'Todos os clientes compradores devem ser cadastrados no C2S e NIDO, independentemente da forma que chegaram.' },
      { num:'1.2', texto:'Transferência de clientes via C2S — atendimento em até <b>1 hora</b> do recebimento da mensagem.' },
      { num:'1.3', texto:'Leads sem atendimento + cadastro da atividade em 1h vão pro "Bolsão" para qualquer outro corretor.' },
      { num:'1.4', texto:'Corretores devem baixar clientes que NÃO estão sendo atendidos (NIDO e C2S). Gerentes/assistentes redistribuem Leads arquivadas e do Bolsão.' },
      { num:'1.5', texto:'No NIDO devem estar: visitas, propostas, cadastro de imóveis, fechamentos, plantões, exclusividade. <b>Não cadastrado = inexistente.</b>' },
      { num:'1.6', texto:'Cada corretor atende no máximo <b>100 clientes simultaneamente</b>. Ultrapassado, novos Leads vão para outros corretores em rodízio.' },
      { texto:'Primeiro atendimento pelo C2S → criar atividade imediatamente. Sem isso, status "PRIMEIRO ATENDIMENTO ATRASADO" por 15 dias → arquivado.' },
      { num:'2.1', texto:'Clientes de placas, procura, indicação, ou meios fora das plataformas: cadastro manual no C2S e NIDO pelos assistentes.' },
      { num:'3.1', texto:'Corretor com lead ativa e atualizada no C2S tem exclusividade no cliente.' },
      { num:'3.2', texto:'No primeiro contato, secretária verifica se cliente já é atendido pela INSP (C2S/NIDO). Lead ativa < 30 dias → encaminha ao corretor anterior. Encerrada/sem movimento > 30 dias → encaminhar ao corretor do anúncio.' },
      { num:'3.3', texto:'FAC avaliação não vincula para compra. É necessária outra FAC após o encerramento.' },
      { num:'3.4', texto:'FACs com movimentação genérica ("ok", "em atendimento") podem ser encerradas sem aviso.' },
      { num:'3.5', texto:'Em caso de permuta, o proprietário pode ser atendido como comprador por qualquer corretor (cadastro prévio).' },
      { texto:'Sem follow-up: corretor sujeito a perder a comissão para quem tiver FAC ativa com o mesmo cliente. Leads/FACs sem follow-up por mais de 15 dias = arquivadas.' },
      { texto:'Chamadas de plantões e placas: exclusivas do corretor responsável. Site e portais: exclusivas do angariador/promotor.' },
      { num:'10', texto:'Cliente vindo presencialmente por placa: se o responsável não está, atende o colega presente e a venda é "Fifty".' },
      { num:'11', texto:'Construtoras/incorporadoras: vários corretores podem atender ao mesmo tempo. Quem fechar leva, sem obrigação de "Fifty".' },
    ]},
    { titulo:'Angariação / Fichas / Regras de Qualidade', itens:[
      { texto:'Todos os imóveis cadastrados no NIDO. Em caso de duplicidade, prevalece quem inseriu o cadastro <b>primeiro, corretamente e completo</b>.' },
      { texto:'Comissão padrão: <b>6% sobre o valor de venda</b>. Imóveis &lt; R$ 1 mi: 6% obrigatório. Acima de R$ 1 mi ou exclusividade em volume: análise individual pela gerência.' },
      { texto:'Proibido anunciar sem ficha cadastrada no NIDO + referência idêntica. Todos os anúncios mencionam referência, nome e telefone da imobiliária.' },
      { num:'16', texto:'Mídias sociais: divulgação preferencialmente pelo captador. Outro corretor precisa de autorização escrita (e-mail ou WhatsApp). Sempre marcar a INSP + usar a referência do sistema.' },
      { num:'17', texto:'Vídeos preferencialmente pelo captador. Compartilhados nas redes da imobiliária mencionando o corretor captador.' },
      { num:'18', texto:'Venda por corretor que gravou (mas não é captador): vendedor 40%, captador 8% (ou 4% se INSP + 4% promotor). Vale para clientes vindos pelo vídeo.' },
      { texto:'Aprovação da ficha pelos assistentes. Critérios: fotos, dados de endereço/proprietário corretos, metragens, latitude/longitude, data de construção. Homologação em até <b>72h</b>.' },
      { num:'19.1', texto:'Cadastros de proprietários devem conter email e telefone.' },
      { texto:'Avaliação Iconatus/Udata/EEmovel pode ser inserida (link ou PDF) — não obrigatório, a critério do corretor.' },
      { texto:'Ficha com autorização escrita do proprietário (com todos os dados + matrícula) pode ser homologada sem confirmação com o proprietário.' },
      { texto:'Fotos: residencial <b>mínimo 20</b> (horizontais; até 5 verticais, primeira horizontal). Comercial/terreno: 5+ horizontais. Vedadas: ilustrativas, marca d\'água, datas, animais, porta-retratos, pessoas, sombras.' },
      { num:'22.1', texto:'Programas habitacionais (HIS / HMP / NR) devem ser indicados claramente no texto promocional e interno.' },
      { num:'23', texto:'Imóveis alugados: informações reais visíveis na ficha (valor, vigência, contato para visitas, carta de oferta/desistência assinada).' },
      { num:'24-26', texto:'Após início das vendas, captador mantém atualização. Não inserir info de locação → pode perder captação/promoção. Imóvel locado não pode ficar suspenso se proprietário ainda quer vender.' },
      { num:'27', texto:'Fotógrafo profissional: <b>1% da comissão</b> da venda (descontado da "cabeça"). Faz trabalho completo (fotos, vídeo, tour virtual) por visita.' },
      { texto:'Ficha provisória: 7 dias + 7 prorrogáveis. Sem regularização em 14 dias → baixa. Outro corretor pode reabrir no 15º dia (3 dias úteis para completar).' },
      { num:'28.1', texto:'Autorizações fora do padrão da empresa não são aceitas (sem nome da INSP, sem comissão, valor, IPTU, condomínio etc).' },
      { texto:'Mesmo corretor que ficou 14 dias com a ficha provisória sem finalizar: sem prazo extra. Tem que refazer cadastro completo.' },
      { texto:'Endereço/proprietário errado → corretor pode perder angariação se outro reabrir corretamente. Sobrados novos com renumeração: 30 dias para atualizar.' },
      { num:'32', texto:'CEP da mesma rua, número errado → vale a primeira ficha. Outro bairro/rua → perde.' },
      { num:'33', texto:'Imóveis novos iguais (mesmas características): 1 ficha + numerações no texto interno. Fotos decorado/ilustrativas só no site.' },
      { texto:'Proibido cadastrar imóveis de parcerias comerciais no campo proprietário.' },
      { texto:'Solicitação de baixa de imóvel pelo NIDO: assistentes processam em <b>1 dia útil</b>. Após a baixa, qualquer corretor pode reabrir a ficha — sem direitos para o anterior.' },
      { num:'35.1', texto:'Baixa irregular sem motivo real: ficha retorna ao corretor original e quem solicitou pode ser desligado.' },
      { texto:'Chaves: custódia da agência do angariador. Protocolo para retirada, devolução em <b>24 horas</b>. Não permitida retirada sem presença do assistente ou gerente.' },
      { texto:'30 dias para colocar placa. Não fez → outro colega pode colocar e receber chamadas; angariação permanece com original.' },
      { texto:'Ficha sem atualização por > <b>60 dias</b>: mensagem do sistema + 5 dias. Pode perder angariação/promoção.' },
      { texto:'Imóvel suspenso: máximo <b>90 dias</b>. Ultrapassado, qualquer corretor pode reabrir (com autorização atualizada).' },
      { texto:'Captações com portaria/zelador: <b>5% a 10%</b> da comissão. Definido pelo angariador.' },
      { num:'40.1', texto:'Sem pagamento ao zelador apenas em: portaria virtual, prédio sem zelador, ou zelador atrapalhando a venda.' },
      { texto:'Se angariador informou que não paga zelador e depois ele cobra: responsabilidade do corretor que informou.' },
      { texto:'Guardas de rua: 5% da comissão.' },
      { texto:'Gerentes podem captar imóveis. Ficha como indicação (4%) em nome do gerente e promoção (4%) distribuída na equipe em escala. Cliente atendido pelo promotor. Em caso de venda: gerente 4%, demais % normais.' },
    ]},
    { titulo:'Exclusividade', itens:[
      { texto:'Termo de exclusividade por escrito do proprietário → corretor recebe <b>10% do total da comissão</b> (cabeça) + angariação. Obrigatório obter no ato da captação.' },
      { texto:'Imóveis exclusivos têm prioridade em publicidade. Análise prévia: documentação, localização, preço de mercado.' },
      { texto:'Prazo mínimo de cadastro: <b>90 dias</b>.' },
      { num:'45', texto:'Imóvel deve estar cadastrado há pelo menos 30 dias.' },
      { num:'46', texto:'Contrato pode admitir parcerias com outras imobiliárias.' },
      { texto:'No imóvel exclusivo, corretor pode centralizar visitas (encaminhando colegas e interessados).' },
      { texto:'Todos podem oferecer e receberão comissão de venda.' },
      { texto:'Outro corretor pode cadastrar exclusividade se a ficha do angariador estiver há mais de 30 dias sem cadastro.' },
      { texto:'Em venda: captador recebe captação (angariação+promoção ou só promoção), corretor da exclusividade 10% (cabeça), vendedor 40%.' },
      { num:'51', texto:'Chamados do imóvel com exclusividade vão para quem cadastrou a ficha (captador/angariador).' },
      { num:'52', texto:'Requisitos: imóvel bem localizado, preço OK, documentação juridicamente em ordem (análise INSP), autorização por escrito completa.' },
    ]},
    { titulo:'Propostas', itens:[
      { texto:'Inclusões via NIDO. Verificadas pelos gerentes antes do cadastro. Escritas: exigem nome completo, documento, forma de pagamento + envio por e-mail a diretores e gerentes.' },
      { num:'53.1', texto:'Validade: <b>14 dias</b>. Após inclusão, proibido levar clientes ao imóvel. Segunda proposta → primeira tem 72 horas (úteis) para resolver.' },
      { num:'53.2', texto:'Imóvel desocupado pode ser visitado por outros após 8º dia de proposta.' },
      { num:'53.3', texto:'Fechamento incluído no sistema em até <b>2 dias úteis</b>. Lançamento até o último dia do mês (30 ou 31).' },
      { num:'54', texto:'Proposta verbal não afeta prazo da escrita. Verbal posterior à escrita: nada muda. Escrita posterior à verbal: verbal tem 24h para virar escrita.' },
      { texto:'Proposta cai (desistência ou documentação): baixa imediata pelo gerente com motivo real registrado.' },
    ]},
    { titulo:'Plantões', itens:[
      { texto:'Plantonista recebe <b>5% da "cabeça"</b> em caso de venda. Abertura depende da gerência e diretoria.' },
      { texto:'Requisitos: imóvel bem localizado, vago, preço de mercado, documentação OK, autorização por escrito completa.' },
      { texto:'Gerência analisa e arquiva matrícula, IPTU e autorização de venda.' },
      { texto:'Visitas semanais ao local, contatos cadastrados no NIDO.' },
      { texto:'Prazo máximo: <b>3 meses</b>, avaliação mensal. Sem retorno satisfatório no 1º mês → desativação.' },
      { texto:'Na desativação: corretor devolve placas, faixas, cavalete, mesa, cadeira, guarda-sol etc. Sem devolução → cobrança. Exceção: furto/roubo com B.O.' },
    ]},
    { titulo:'Pregão (atualmente suspenso)', itens:[
      { texto:'Mensalmente, apresentação dos melhores imóveis entre corretores. Critério: preço, localização, 20+ fotos, rentabilidade. Validade: 30 dias.' },
      { texto:'Em caso de venda: <b>5% da comissão</b> (cabeça) para quem apresentou — se a venda for por outro colega. Não cumulativo com exclusividade.' },
      { texto:'Captador preferencialmente indica e apresenta. Se colega apresenta: 5% dividido entre eles.' },
      { texto:'Corretor pode apresentar imóvel de captação alheia avisando o captador. Venda em até 30 dias por outro colega → 5% (cabeça) para quem apresentou + captador recebe normal.' },
      { num:'67', texto:'Se vendedor for o apresentador ou captador → recebem valores normais, sem o 5% adicional.' },
    ]},
    { titulo:'Placa QR Code', itens:[
      { texto:'Placas têm QR Code de cada imóvel. Corretor informa ao Marketing a referência → adesivo entregue na agência em <b>1 dia útil</b>.' },
      { num:'69', texto:'Solicitações em sextas, vésperas de feriados, emendas ou férias coletivas: prazo inicia no 1º dia útil seguinte.' },
    ]},
    { titulo:'Parcerias', itens:[
      { texto:'Parcerias para imóveis a partir de <b>R$ 800 mil</b>, com imobiliárias ou corretores autônomos, mediante autorização da diretoria e gerência. "Fifty" para empresas imobiliárias após descontos da cabeça.' },
      { texto:'Despesas (documentação, comissão de zelador, exclusividade) descontadas da cabeça antes do fifty.' },
      { texto:'Corretores autônomos com cliente comprador: <b>30% da comissão</b>, sempre acompanhados de um corretor NovaSP.' },
      { texto:'Mera indicação: imóvel = 6% para parceiro + 2% para captador. Cliente = 10% para parceiro + 30% para vendedor. Válido só para venda, não locação.' },
      { tabela:[
        ['Assunto','Quem pode fazer','Remuneração do indicador','Remuneração Gerente','Observações'],
        ['Trazer imóvel locado para administração','Qualquer colaborador','Com 1º aluguel: 10% · Sem: 5%','Com 1º aluguel: 3% · Sem: 1%','Gerido pela Administração. Isenção do 1º aluguel: diretoria caso a caso.'],
        ['Locação COM Adm pelo time de Vendas','Time Vendas','Normal de Vendas','Normal de Vendas','Mínimo R$ 10.000. Validação jurídica. Conta para meta de Locação.'],
        ['Locação SEM Adm pelo time de Vendas','Time Vendas','Normal de Vendas','Normal de Vendas','Mínimo R$ 10.000. Validação jurídica.'],
        ['Captação imóvel p/ Locação','Qualquer colaborador, amigo, parente','6% para o parceiro pós cabeça. Captador fica com restante','Normal de Locação','Formalização entre parceiro e corretor. Mínimo R$ 10.000.'],
        ['Captação imóvel p/ Vendas','Qualquer colaborador, amigo, parente','6% para o parceiro pós cabeça. Captador fica com restante','Normal de Vendas','Formalização entre parceiro e corretor.'],
        ['Indicação cliente p/ Locação','Qualquer colaborador, amigo, parente','2,5% do 1º aluguel pós cabeça','7,5% restantes para o gestor','Formalização entre parceiro e corretor.'],
        ['Indicação cliente p/ Vendas','Qualquer colaborador, amigo, parente','10% para indicador. 30% para corretor vendedor','Normal de Vendas','Formalização entre parceiro e corretor.'],
        ['Parceria com Imobiliária — Vendas (Fifty)','Time Vendas','Pós cabeça: 50% para cada empresa','Normal de Vendas','Mínimo R$ 800 mil. Comissão mínima 6%.'],
        ['Parceria com Corretor Autônomo — Vendas','Time Vendas','Pós cabeça: 30% para o autônomo','Normal de Vendas','Mínimo R$ 800 mil. Comissão mínima 6%.']
      ]},
      { texto:'<b>Liberação Vendas → Locação:</b> imóveis acima de R$ 10.000 podem ser operados pelo time de vendas em todas as agências. Abaixo, direcionar para JA.' },
      { texto:'<b>Agência Moema:</b> liberação a partir de R$ 5.000. Vendas conduz proposta, contrato modelo INSP e vistoria. Administração e abaixo do valor: JA.' },
      { texto:'Locação &lt; R$ 10 mil em Biobedas e Jabaquara: angariador recebe 20% (com adm INSP) ou 15% (sem adm) do 1º aluguel. Trâmite pelo setor de Locação.' },
      { texto:'Locação &lt; R$ 5 mil em Moema: angariador recebe 20% (com adm INSP) ou 15% (sem). Trâmite pelo setor de Locação.' },
    ]},
    { titulo:'Equipe Lançamentos', itens:[
      { texto:'Corretores de terceiros vendem lançamentos sempre em parceria com corretores de lançamentos (fifty).' },
      { num:'80', texto:'Corretor de lançamento com cliente para imóveis de terceiros → fifty. Vice-versa também.' },
      { num:'81', texto:'Vendas por corretor de terceiros: apenas 40% relativo à venda (sem captação/indicação).' },
      { texto:'Corretores de terceiros podem oferecer lançamentos aos próprios clientes. Em caso de venda: fifty.' },
      { texto:'Listagem de construtoras parceiras divulgada pelo Staff de Lançamentos. Empreendimentos cadastrados no sistema por eles.' },
      { num:'85', texto:'Remanescentes de construtoras parceiras NÃO podem ser cadastrados por corretores de terceiros.' },
      { num:'86', texto:'Cadastro de remanescentes/lançamentos no sistema das construtoras só para as fora do quadro de parcerias. Verificar com a gerência.' },
    ]},
    { titulo:'Fichas "compradas" em lote e captadores INSP', itens:[
      { texto:'Fichas compradas em lote ("Zé", "Milson" etc): cadastradas em caráter provisório. Corretor complementa (fotos, autorização) e fica com a promoção; INSP como indicadora.' },
      { num:'88', texto:'Fichas cadastradas por captador INSP distribuídas às equipes. Promoção do corretor, INSP indicadora.' },
      { texto:'Gerência monitora trabalho do corretor com a promoção. Sem atualização/anúncios → transfere promoção para outro corretor.' },
      { texto:'Fichas de herança: distribuídas entre equipes. Atualizações pelos assistentes. Promoção do corretor para receber Leads.' },
      { texto:'Venda de imóveis "herança": assistente 2%, INSP 6%, vendedor 40%.' },
      { texto:'Corretor promotor de herança pode investir em fotos profissionais, vídeos e campanhas para aumentar divulgação.' },
    ]},
    { titulo:'Clientes "Construtores"', itens:[
      { texto:'Clientes VIP/Construtores atendidos por todos sem ordem de preferência. Comunicação via e-mail com cópia para o gerente. FAC em nome do corretor e gerente. Follow-ups com referências dos imóveis apresentados.' },
      { texto:'Quem apresentar primeiro recebe proposta sem dividir. Em caso de mesmo imóvel ofertado: prevalece quem apresentou primeiro (visita + follow-up + proposta escrita).' },
    ]},
    { titulo:'Seleção Especial de Imóveis', itens:[
      { texto:'Seleção <b>1 vez/mês</b> em data agendada pelo gerente.' },
      { texto:'Comitê com todos os gerentes e diretoria seleciona imóveis. Gerentes apresentam os da equipe.' },
      { texto:'Tratamento especial: fotos profissionais, tour 360°, vídeos, Destaque Premium, anúncios patrocinados.' },
      { texto:'Captador com imóvel na Seleção vendido: <b>18% captação + 30% vendedor</b> (mesmo se for ele que vende).' },
      { texto:'<b>Corretor Prata:</b> 3 meses consecutivos com imóveis ativos na Seleção → +1% na captação + 3 anúncios extras de Destaque/Super Destaque.' },
      { texto:'<b>Corretor Ouro:</b> 6 meses consecutivos → +2% na captação + 3 anúncios extras.' },
      { texto:'Anúncios especiais exclusivos para imóveis da Seleção. Fotógrafo/video maker com preferência para esses imóveis.' },
    ]},
    { titulo:'Reunião de Vendas', itens:[
      { texto:'Reunião mensal por equipe + trimestral em conjunto com todas as equipes.' },
      { texto:'Presença obrigatória de todos os gerentes em reuniões e treinamentos (presenciais ou online).' },
      { texto:'Presença obrigatória dos corretores nas reuniões oficiais. Calendário comunicado eletronicamente ou fisicamente.' },
      { texto:'Eventuais faltas: informar com antecedência; justificativas à diretoria.' },
    ]},
    { titulo:'Comitê — Resolução de Conflitos', itens:[
      { texto:'Conflitos não resolvidos pelas regras: gerências decidem (individualmente ou em conjunto).' },
      { texto:'Não resolvidos: levados ao comitê na reunião mensal de vendas. Cada corretor tem 5 minutos. Diretores e gerentes 5 minutos. Votação dos gerentes comerciais + diretoria. CEO voto de minerva em empate.' },
    ]},
    { titulo:'Geral', itens:[
      { texto:'Solicitações entre corretores de agências diferentes: via NIDO ou pelas secretárias. Retorno em até <b>24 horas</b>.' },
      { texto:'Andamentos de propostas: entre gerentes.' },
      { texto:'Pedidos de alteração no NIDO (parâmetros, atualizações): centralizados em Marketing e T.I.' },
      { texto:'<b>Falsificação</b> de visitas, follow-ups, atualizações de imóveis ou outras atividades: descredenciamento imediato.' },
    ]},
    { titulo:'Terrenos para Incorporação', itens:[
      { texto:'Todos os terrenos novos cadastrados no NIDO + KMZ (polígono Google Earth) + documentos enviados para <b>renan@novasaopaulo.com.br</b>.' },
      { texto:'Terreno já no NIDO: enviar código de cadastro para Novos Negócios.' },
      { num:'112', texto:'Setor de Novos Negócios analisa e retorna status para o corretor responsável.' },
    ]},
  ],

  // ─────────────────────────────────────────────────────────
  rh: [
    { titulo:'Analista RH — Administração de Pessoal', itens:[
      { texto:'Elaboração de contratos e distratos.' },
      { texto:'Emissão de carta proposta para colaboradores CLT.' },
      { texto:'Encaminhamento para exame médico admissional.' },
      { texto:'Condução dos processos admissionais CLT.' },
      { texto:'Comunicação e controle do benefício <b>Day Off de aniversário</b>.' },
    ]},
    { titulo:'Analista RH — Recrutamento e Seleção', itens:[
      { texto:'Abertura de vagas e elaboração da descrição de cargos.' },
      { texto:'Agendamento de entrevistas entre candidatos e gestores.' },
      { texto:'Encaminhamento das solicitações de divulgação de vagas para o <b>Departamento de Marketing</b>.' },
      { texto:'Condução do processo de admissão (Day One).' },
      { texto:'Recebimento das comunicações de desligamento enviadas pelos gestores.' },
    ]},
    { titulo:'Analista RH — Indicadores e Eventos', itens:[
      { texto:'Manter o <b>Headcount</b> atualizado.' },
      { texto:'Enviar mensalmente o controle de Headcount para o Departamento de Marketing.' },
      { texto:'Apresentar os indicadores mensais de admissões e desligamentos.' },
      { texto:'Organização do Café com a Diretoria <i>(atualmente suspenso)</i>.' },
    ]},
    { titulo:'Analista RH — Aniversariantes (Matriz)', itens:[
      { texto:'Organização dos aniversários da agência <b>Matriz</b>.' },
      { texto:'Confirmar presença dos aniversariantes.' },
      { texto:'Definir o sabor do bolo.' },
      { texto:'Solicitar encomenda de bolo e salgados.' },
    ]},
    { titulo:'Analista RH — Solicitação de Materiais Institucionais', itens:[
      { texto:'Encaminhar para o <b>Departamento de Marketing</b> as solicitações de: Cartão de visita · Crachá · Assinatura de e-mail.' },
    ]},
    { titulo:'Departamento de Marketing — Comunicação e Divulgação', itens:[
      { texto:'Receber vagas abertas e produzir as artes de divulgação.' },
      { texto:'Publicar vagas nas redes sociais e grupos corporativos.' },
      { texto:'Divulgar aniversariantes do mês e da semana.' },
    ]},
    { titulo:'Organização de Aniversários — por agência', itens:[
      { texto:'<b>Agência Moema</b> — Responsável: <b>Departamento de Marketing</b>. Confirmar presença, definir sabor do bolo, organizar comemoração.' },
      { texto:'<b>Agência Gold</b> — Responsável: <b>Camille</b>. Mesmas atribuições.' },
      { texto:'<b>Agência Matriz</b> — Responsável: <b>Analista RH</b>. Mesmas atribuições.' },
    ]},
    { titulo:'Materiais Institucionais', itens:[
      { texto:'Receber solicitações encaminhadas pelo Analista RH.' },
      { texto:'Consolidar os pedidos até o <b>dia 20</b> de cada mês.' },
      { texto:'Solicitar produção junto à gráfica.' },
      { texto:'<b>Materiais:</b> Cartão de visita · Crachá · Placas · Faixas · Demais materiais institucionais.' },
    ]},
    { titulo:'Comunicação Interna e Eventos', itens:[
      { texto:'Enviar comunicados gerais referentes a reuniões de terceiros.' },
      { texto:'Apoiar a organização de eventos destinados aos terceiros.' },
      { texto:'Organizar a reunião mensal de terceiros.' },
    ]},
    { titulo:'Responsabilidades das Equipes — Cadastro de Novos Corretores', itens:[
      { texto:'Cadastros realizados diretamente pelos assistentes ou gerentes responsáveis nos sistemas:<ul><li>NIDO</li><li>C2S</li><li>Udata</li><li>PipeMob</li></ul>' },
      { texto:'<b>Cadastros específicos:</b><ul><li><b>Eemovel</b> — Solicitar para o <b>Departamento de Marketing</b>.</li><li><b>E-mail corporativo</b> — Solicitar para o <b>Fábio</b>.</li></ul>' },
    ]},
    { titulo:'Responsabilidades das Equipes — Desligamento de Corretores', itens:[
      { texto:'O desligamento deverá ser realizado pelo <b>gerente responsável</b>.' },
      { texto:'Comunicação por e-mail para o <b>Analista RH</b> para atualização do Headcount.' },
      { texto:'Descadastramento dos sistemas: responsabilidade dos gerentes e assistentes das equipes.' },
    ]},
  ],

  // ─────────────────────────────────────────────────────────
  // ADMINISTRAÇÃO — processos dos departamentos (jul/2026)
  adm: [
    { titulo:'Renovação de Contratos — Processo de Trabalho', itens:[
      { texto:'<b>Estrutura:</b> 01 colaborador responsável pelo setor. <b>Atuação:</b> gestão de reajustes, renovações, transferências contratuais e negociação entre locador e locatário.' },
      { num:'Etapa 1', texto:'<b>Controle de Vencimentos</b> — Monitorar contratos próximos ao aniversário · Organizar agenda de renovações · Antecedência mínima: <b>30 a 60 dias</b>.' },
      { num:'Etapa 2', texto:'<b>Análise de Reajuste</b> — Aplicar índice contratual (ex: IGPM/IPCA). Avaliar: valor de mercado, risco de saída do locatário e interesse do locador.' },
      { num:'Etapa 3', texto:'<b>Contato e Negociação</b> — Iniciar contato com locatário e locador · Apresentar proposta de reajuste · Mediar negociação quando houver divergência · Buscar equilíbrio entre <b>rentabilidade do locador</b> e <b>permanência do locatário</b>.' },
      { num:'Etapa 4', texto:'<b>Definição</b> — Formalizar valores acordados. Definir: renovação, reajuste ou possível transferência contratual.' },
      { num:'Etapa 5', texto:'<b>Formalização Contratual</b> — Elaboração do contrato ou aditivo · Revisão de cláusulas · Coleta de assinaturas.' },
      { num:'Etapa 6', texto:'<b>Lançamento em Sistema</b> — Atualizar valores na plataforma · Inserir reajustes ou descontos · Garantir que o financeiro esteja correto.' },
      { texto:'<b>Metas do setor:</b> 100% dos contratos analisados antes do vencimento · Início da negociação com antecedência · Tempo médio de negociação · Número de contratos perdidos · Satisfação de locador e locatário.' },
      { texto:'<b>Comissionamento:</b> percentual sobre o ganho real obtido na negociação (diferença entre valor atual e reajustado) + bônus por renovação (valor fixo por contrato renovado).' },
      { texto:'<b>Indicadores (Encargos/Adm):</b> número de renovações solicitadas pelo locador, automáticas e por transferência de administração — números mensais e trimestrais.' },
    ]},
    { titulo:'Manutenção — Gestão e Mediação', itens:[
      { texto:'<b>Estrutura:</b> 01 responsável pelo setor — <b>Mikaely</b>. <b>Atuação:</b> análise técnica, definição de responsabilidade e mediação entre locador e locatário.' },
      { num:'Etapa 1', texto:'<b>Recebimento da Solicitação</b> — Receber chamado do locatário ou locador · Registrar a demanda · Solicitar fotos, vídeos e descrição detalhada. Reclamações abertas via WhatsApp: resposta <b>imediata</b> e formalização via e-mail. Contato entre as partes em no máximo <b>24 horas</b>, já identificando a responsabilidade quando possível sem visita de prestador.' },
      { num:'Etapa 2', texto:'<b>Análise Técnica</b> — Avaliar o problema. Consultar: contrato de locação e laudo de vistoria de entrada. Classificar a responsabilidade: <b>Locador</b> (estrutura / vício anterior) ou <b>Locatário</b> (uso / mau uso / desgaste indevido).' },
      { num:'Etapa 3', texto:'<b>Definição e Fundamentação</b> — Formalizar a decisão com base em: contrato, Lei do Inquilinato e evidências (fotos/laudo).' },
      { num:'Etapa 4', texto:'<b>Mediação</b> — Comunicar ambas as partes · Explicar a responsabilidade de forma clara · Mediar negociação quando necessário · Definir valores e condições de pagamento.' },
      { num:'Etapa 5', texto:'<b>Formalização</b> — Registrar acordo por e-mail ou termo · Encaminhar para execução (se houver reparo) · Arquivar histórico.' },
      { num:'Etapa 6', texto:'<b>Acompanhamento</b> — Garantir que o reparo foi realizado · Confirmar resolução com as partes · Encerrar chamado.' },
      { texto:'<b>Metas do setor:</b> resposta inicial em até <b>24h</b> · definição de responsabilidade em até <b>48h</b> · redução de conflitos · 100% das decisões fundamentadas · alto índice de resolução sem escalonamento · nº de retrabalhos · nº de conflitos não resolvidos · tempo médio de resolução · satisfação de locador e locatário.' },
      { texto:'<b>Volume de referência:</b> ~45 mensagens/mês — 25 em andamento, 20 resolvidas. Triagem de reclamações na telefonia (6). Montar planilha de controle: data de início, retorno e finalização, nº de reclamações mensais, resolvidas mensais e trimestrais.' },
      { texto:'<b>Ferramentas:</b> e-mail de contato padrão com prestadores · contrato com prestadores · texto padrão + tempo de retorno.' },
      { texto:'<b>Bonificação/Incentivo:</b> função estratégica — bônus por desempenho e qualidade (não comissão direta): resolução rápida de chamados, organização dos processos, bônus por mediação, redução de conflitos, evitar prejuízo ao proprietário, negociações que reduzam custos de reparo.' },
      { texto:'<b>Diretrizes:</b> decisões sempre fundamentadas (contrato + vistoria) · comunicação clara, imparcial e profissional · registrar tudo por escrito · <b>nunca decidir sem evidências</b>.' },
      { texto:'<b>Riscos e pontos de atenção:</b> decisão incorreta de responsabilidade → gera prejuízo · falta de registro → risco jurídico · má comunicação → gera conflito · demora → insatisfação das partes.' },
    ]},
    { titulo:'Entrega de Chaves — Encerramento de Locação', itens:[
      { texto:'<b>Comunicado de saída:</b> avisar o locador no mesmo dia do recebimento. Tentar negociar com o locatário a permanência ou troca por outro imóvel, ou verificar com o locador possibilidade de manter o inquilino. Na desocupação: levantar débitos, providenciar vistoria e, se possível, já programar com o locador a liberação do imóvel para locação.' },
      { num:'1', texto:'<b>Depósito Caução</b> — Receber e protocolar as chaves · Comunicar o locador no mesmo dia · Vistoria final em até 24h (convocar as partes, emitir laudo) · Com vistoria aprovada e sem débitos: devolver o depósito caução <b>corrigido</b> ao locatário · Havendo pendências: informar para regularização ou autorizar desconto na caução · Concluído: disponibilizar imóvel para nova locação e formalizar rescisão.' },
      { num:'2', texto:'<b>Fiador</b> — Receber e protocolar as chaves · Comunicar o locador no mesmo dia · Vistoria final em até 24h com laudo · Reparos necessários: notificar o locatário para execução no prazo estipulado; não realizados → cobrança ao locatário e/ou fiador conforme contrato · Após aprovação e quitação: retornar imóvel pra locação e formalizar rescisão.' },
      { num:'3', texto:'<b>Seguro Fiança</b> — Receber e protocolar as chaves · Comunicar o locador no mesmo dia · Vistoria final em até 24h com laudo · <b>Sinistro:</b> identificados débitos/reparos não realizados, solicitar ao locador 2 orçamentos detalhados; conferir documentação e encaminhar o sinistro à seguradora em até <b>10 dias</b> após a entrega das chaves; acompanhar a análise e manter o locador informado · Disponibilizar o imóvel para nova locação <b>independentemente</b> da conclusão do sinistro · Após pagamento da indenização: formalizar rescisão e registrar encerramento. <i>Atenção: encaminhar cobrança ao departamento imediatamente para não perder prazo.</i>' },
      { num:'4', texto:'<b>Título de Capitalização</b> — Receber e protocolar as chaves · Comunicar o locador no mesmo dia · Vistoria final em até 24h com laudo · Solicitar imediatamente o resgate do título · Apurar débitos em aberto, danos ou reparos · Informar às partes os valores a descontar do título · Liberar saldo remanescente ao locatário · Disponibilizar imóvel e formalizar rescisão.' },
      { texto:'<b>Procedimentos comuns a todas as modalidades:</b><ul><li>Recebimento formal das chaves mediante protocolo</li><li>Comunicação ao locador no mesmo dia da entrega</li><li>Agendamento da vistoria final em até 24 horas</li><li>Emissão de laudo de vistoria conclusivo</li><li>Apuração de débitos locatícios (aluguéis, encargos, consumo e multas)</li><li>Tratamento das pendências conforme a modalidade de garantia</li><li>Liberação do imóvel para nova locação</li><li>Formalização da rescisão contratual e arquivamento do processo</li></ul>' },
      { texto:'<b>Indicadores:</b> planilha mensal com números de entrega + planilha trimestral para análise de metas.' },
    ]},
    { titulo:'Encargos — Transferência de Titularidade', itens:[
      { texto:'<b>Separar documentos:</b> contrato de locação, contas de luz e água (ou apenas numerações fornecidas pelos gestores) e procuração devidamente assinada.' },
      { texto:'<b>Protocolo de transferência:</b> adicionar na planilha de acompanhamento de transferência, com atualização <b>semanal</b>.' },
      { texto:'<b>Apresentação para gerência:</b> números mensais e metas trimestrais a determinar.' },
    ]},
    { titulo:'Rotinas por Colaborador (Tabela ADM)', itens:[
      { texto:'Acompanhamento por período (mensal: Junho/Julho/Agosto · semanal: Semanas 1-3), incluindo Avaliação do Google como rotina de todos.' },
      { tabela:[
        ['Colaborador','Atividades'],
        ['João Marcos','Renovação de contrato · Transferência de ponto comercial · Reajuste de aluguel · Avaliação do Google'],
        ['Vanderleia','Entrega de chaves · Recolocar imóvel para locação · Avaliação do Google'],
        ['Mickaely','Intermediar manutenção de imóvel · Captar mão de obra para reparos · Avaliação do Google'],
        ['Sibele','Atendimento telefônico · Triar atendimento · Abrir chamado para depto. de manutenção · Avaliação do Google'],
        ['Vinicius','Atendimento presencial (proprietário e locatário) · Separar documentos p/ transferência de titularidade · Religação de luz e água · Avaliação do Google'],
        ['Richard','Serviços externos junto a concessionárias (Enel e Sabesp) · Atendimento presencial (proprietário e locatário) · Avaliação do Google']
      ]},
      { texto:'<b>Compromisso contínuo:</b> apresentar melhorias para cada departamento.' },
    ]},
  ]
};

// ─── RENDER ─────────────────────────────────────────────
function renderRegrasHome(){
  // home ja vem no HTML como cards estaticos; nada a fazer
}

function renderRegras(dept){
  const meta = REGRAS_META[dept];
  const secoes = REGRAS_DATA[dept] || [];
  const page = document.getElementById('p-reg-' + dept);
  if (!page) return;

  const hoje = new Date().toLocaleDateString('pt-BR');
  // Mapa de ícones por departamento
  const iconeDept = {vendas:'briefcase', locacao:'home', financeiro:'dollar', rh:'user', adm:'building'};
  const ic = (n,s) => (typeof icon==='function') ? icon(n,s||18) : '';

  let html = `
  <div class="ph no-print">
    <div>
      <button onclick="goTo('regras-home')" style="background:none;border:none;color:#64748b;font-size:12px;cursor:pointer;padding:0;margin-bottom:6px;display:flex;align-items:center;gap:6px">
        ${ic('arrowLeft',14)} Regras e Processos
      </button>
      <h1 class="pt" style="display:flex;align-items:center;gap:12px">
        <span style="background:${meta.bg};color:${meta.cor};padding:8px;border-radius:10px;display:inline-flex">${ic(iconeDept[dept]||'book',22)}</span>
        Regras Gerais — ${meta.titulo}
      </h1>
      <div class="pst">Imobiliária Nova São Paulo · Atualizado em ${meta.atualizado}</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-o bsm" onclick="window.print()" title="Imprimir esta página">${ic('printer',14)} Imprimir</button>
      <button class="btn btn-o bsm" onclick="sugerirAlteracaoRegras('${dept}')" title="Abrir requisição de alteração">${ic('edit',14)} Sugerir alteração</button>
    </div>
  </div>

  <div class="card" style="padding:16px 20px;margin-bottom:14px;background:linear-gradient(135deg,${meta.bg} 0%,#fff 80%);border-left:4px solid ${meta.cor}">
    <div style="font-size:12px;color:${meta.txt};font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Sumário</div>
    <div class="flex" style="flex-wrap:wrap;gap:6px">
      ${secoes.map((s,i)=>`<a href="#reg-${dept}-${i}" style="font-size:12px;background:#fff;border:1px solid var(--borda);color:var(--txt);padding:4px 12px;border-radius:14px;text-decoration:none;cursor:pointer" onclick="document.getElementById('reg-${dept}-${i}')?.scrollIntoView({behavior:'smooth',block:'start'});return false">${s.titulo}</a>`).join('')}
    </div>
  </div>
  `;

  for (let i=0;i<secoes.length;i++){
    const s = secoes[i];
    html += `<div class="card" style="padding:18px 22px;margin-bottom:14px" id="reg-${dept}-${i}">
      <h2 style="font-size:17px;font-weight:700;color:${meta.cor};margin:0 0 12px 0;display:flex;align-items:center;gap:8px;border-bottom:2px solid ${meta.bg};padding-bottom:8px">
        <span style="background:${meta.bg};color:${meta.txt};font-size:11px;padding:2px 8px;border-radius:10px">${i+1}</span>
        ${s.titulo}
      </h2>
      <div style="font-size:14px;line-height:1.65;color:#1e293b">`;
    for (const it of s.itens) {
      if (typeof it === 'string') {
        html += `<p style="margin:0 0 8px 0">${it}</p>`;
      } else if (it.tabela) {
        html += `<div style="overflow-x:auto;margin:10px 0"><table style="width:100%;border-collapse:collapse;font-size:12px">`;
        for (let r=0; r<it.tabela.length; r++){
          const linha = it.tabela[r];
          const tag = r===0?'th':'td';
          const bg = r===0?meta.bg:(r%2===0?'#f8fafc':'#fff');
          const cor = r===0?meta.txt:'#1e293b';
          const peso = r===0?'700':'400';
          html += `<tr style="background:${bg}">`;
          for (const cel of linha){
            html += `<${tag} style="padding:8px 10px;border:1px solid var(--borda);text-align:left;color:${cor};font-weight:${peso};vertical-align:top">${cel}</${tag}>`;
          }
          html += `</tr>`;
        }
        html += `</table></div>`;
      } else if (it.texto) {
        const numBadge = it.num ? `<span style="display:inline-block;background:${meta.bg};color:${meta.txt};font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;margin-right:8px;min-width:32px;text-align:center">${it.num}</span>` : '';
        html += `<p style="margin:0 0 10px 0;display:flex;align-items:flex-start">${numBadge}<span style="flex:1">${it.texto}</span></p>`;
      }
    }
    html += `</div></div>`;
  }

  html += `
  <div class="card" style="padding:14px 18px;background:#f8fafc;border-left:4px solid ${meta.cor};font-size:12px;color:#64748b">
    <b>Versão:</b> ${meta.atualizado} · <b>Consulta:</b> ${hoje} · <b>Departamento:</b> ${meta.titulo}<br>
    Dúvidas sobre interpretação ou casos não previstos: encaminhar à diretoria.
  </div>
  `;

  page.innerHTML = html;
}

// Abre o modal de Requisição Interna pré-preenchido para sugerir
// alteração nas regras de um departamento.
function sugerirAlteracaoRegras(dept){
  const meta = REGRAS_META[dept];
  if (!meta) return;
  // Vai pra Manutenção Interna (req-manut) — ajusta lá os campos.
  goTo('req-manut');
  setTimeout(()=>{
    abrirNovaReq?.();
    const ra = document.getElementById('ra');
    if (ra) ra.value = 'Regras e Processos';
    const rt = document.getElementById('rt');
    if (rt) {
      // forca selecao "Outro" (sugestoes nao sao TI nem manutencao predial)
      for (let i=0; i<rt.options.length; i++){
        if (/outro/i.test(rt.options[i].text)) { rt.selectedIndex = i; break; }
      }
    }
    const rd = document.getElementById('rd');
    if (rd) rd.value = `Sugestão de alteração nas Regras de ${meta.titulo} (versão ${meta.atualizado}):\n\n[Descreva qual cláusula/parágrafo deveria mudar e qual a redação proposta]`;
    // Foca na descrição
    setTimeout(()=>rd?.focus(),100);
    if (typeof toast === 'function') toast('Sugestão de alteração — preencha o campo "Descrição" e envie.','ok');
  }, 200);
}
