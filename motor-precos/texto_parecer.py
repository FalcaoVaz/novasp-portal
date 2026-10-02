"""
Texto do parecer de valor escrito pelo Claude a partir dos dados da avaliação.

O portal monta os números (método único, vendas reais, anúncios, cadastro, entorno, zoneamento,
incorporação) e manda aqui um resumo em JSON. O Claude escreve o texto analítico no estilo dos
pareceres feitos à mão em set/2026: resposta direta primeiro, depois o que as evidências dizem,
onde discordam e por quê. Não inventa dado: só usa o que veio no JSON.

Requer ANTHROPIC_API_KEY no ambiente (Render). Sem ela, o endpoint responde 503 e o portal avisa.
"""
import json, os

import anthropic

MODELO = os.environ.get('TEXTO_MODELO', 'claude-opus-5-5')
EFFORT = os.environ.get('TEXTO_EFFORT', 'medium')

SISTEMA = """Você escreve pareceres de valor de imóveis para a Imobiliária Nova São Paulo, que atua na Zona Sul de São Paulo desde 1969. O parecer é entregue ao cliente (proprietário ou comprador) pelo corretor.

Escreva em português do Brasil, com frases curtas e claras, para um leitor leigo e inteligente. Tom sóbrio e seguro, sem adjetivos de venda ("imperdível", "excelente oportunidade") e sem jargão técnico sem explicação.

Regras de conteúdo, inegociáveis:
- Use SOMENTE os dados do JSON. Não invente vendas, endereços, datas, preços, histórico do bairro, obras ou equipamentos que não estejam ali. Se um dado não veio, não fale dele.
- Valor por metro quadrado sempre em ÁREA ÚTIL. A área "no cadastro" da Prefeitura inclui áreas comuns e garagem; cite-a só para explicar a diferença, nunca como base de preço.
- "Venda real" é a transação registrada na Prefeitura (guia de ITBI), com o preço declarado. "Anúncio" é preço pedido, que costuma fechar abaixo. Explique a diferença quando usar os dois.
- Fale em mediana, não em média.
- Publique a incerteza: quando as fontes divergem, diga quanto e o que provavelmente explica. Não force concordância.
- Cite números com sua base: quantas vendas, de quando, a que distância.
- Não cite nomes de pessoas, de clientes, de comunidades ou favelas, nem projetos ou empresas usados internamente para calibrar parâmetros.
- Este documento é uma opinião de valor para comercialização, não um laudo de avaliação (NBR 14.653). Não use a palavra "laudo" para descrevê-lo.

Estrutura:
- "titulo": uma pergunta curta que o parecer responde, com o endereço (ex.: "Quanto vale o apartamento da Alameda dos Guaiós, 247").
- "resposta": 2 a 4 frases que respondem de frente: o valor, a faixa e a razão principal.
- "secoes": de 3 a 5 seções, cada uma com "titulo" curto e "texto" em 1 a 3 parágrafos (separe parágrafos com uma linha em branco). Escolha entre: o imóvel e o prédio; a localização e o entorno; o que as vendas reais e os anúncios mostram; como as evidências se combinam no valor; estratégia de preço (preço de anúncio e de fechamento esperado); potencial para incorporadora (só se o JSON trouxer essa conta). Omita a seção sem dado suficiente.
- "atencao": até 3 pontos curtos que o cliente deve verificar ou que podem mudar o valor (estado de conservação, documentação, vagas, zoneamento a confirmar). Lista vazia se não houver."""

ESQUEMA = {
    'type': 'object',
    'properties': {
        'titulo': {'type': 'string'},
        'resposta': {'type': 'string'},
        'secoes': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {'titulo': {'type': 'string'}, 'texto': {'type': 'string'}},
                'required': ['titulo', 'texto'],
                'additionalProperties': False,
            },
        },
        'atencao': {'type': 'array', 'items': {'type': 'string'}},
    },
    'required': ['titulo', 'resposta', 'secoes', 'atencao'],
    'additionalProperties': False,
}


class TextoIndisponivel(Exception):
    """Configuração ausente ou recusa do modelo — o portal mostra a mensagem ao corretor."""


_client = None


def _cliente():
    global _client
    if not os.environ.get('ANTHROPIC_API_KEY'):
        raise TextoIndisponivel('Texto automático ainda não ativado: falta a chave da API da Anthropic no servidor (ANTHROPIC_API_KEY).')
    if _client is None:
        _client = anthropic.Anthropic(timeout=120.0, max_retries=2)
    return _client


def gerar(dados: dict) -> dict:
    """Recebe o resumo da avaliação (dict) e devolve {titulo, resposta, secoes[], atencao[], uso{}}."""
    cliente = _cliente()
    conteudo = ('Dados da avaliação (JSON). Escreva o parecer seguindo as regras.\n\n'
                + json.dumps(dados, ensure_ascii=False, separators=(',', ':')))
    resp = cliente.beta.messages.create(
        model=MODELO,
        max_tokens=16000,
        system=SISTEMA,
        messages=[{'role': 'user', 'content': conteudo}],
        output_config={'effort': EFFORT, 'format': {'type': 'json_schema', 'schema': ESQUEMA}},
        betas=['server-side-fallback-2026-07-01'],
        fallbacks='default',
    )
    if resp.stop_reason == 'refusal':
        raise TextoIndisponivel('O modelo não escreveu o texto desta avaliação. Tente de novo ou siga sem o texto.')
    if resp.stop_reason == 'max_tokens':
        raise TextoIndisponivel('O texto ficou longo demais e foi cortado. Tente de novo.')
    texto = next((b.text for b in resp.content if b.type == 'text'), None)
    if not texto:
        raise TextoIndisponivel('Resposta sem texto. Tente de novo.')
    out = json.loads(texto)
    u = resp.usage
    out['uso'] = {'modelo': resp.model, 'entrada': u.input_tokens, 'saida': u.output_tokens}
    return out
