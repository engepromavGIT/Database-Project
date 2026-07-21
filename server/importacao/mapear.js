// Mapeamento e validação de planilhas de obras (importação CSV/Excel).
// Funções PURAS (sem I/O) — a leitura do arquivo (SheetJS) fica na rota.

// Normaliza um texto para casar cabeçalhos (sem acentos/espaços/pontuação).
// NFKD converte compatibilidade (ex.: m² -> m2) antes de remover marcas.
export function normalizar(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Sinônimos por campo canônico (ordem = prioridade de resolução).
const SINONIMOS = {
  codigo: ['codigo', 'cod', 'code'],
  nome: ['nome', 'obra', 'descricao', 'name'],
  tipo: ['tipoobra', 'tipodeobra', 'tipo'],
  padrao: ['padraoacabamento', 'padrao', 'acabamento'],
  municipio: ['municipio', 'cidade'],
  uf: ['uf', 'estado'],
  areaConstruidaM2: ['areaconstruida', 'aream2', 'area', 'm2'],
  custoRealTotal: ['custorealtotal', 'custoreal', 'custorealizado', 'realizado'],
  custoOrcadoTotal: ['custoorcadototal', 'custoorcado', 'orcado', 'orcamento'],
  dtInicioReal: ['datainicio', 'inicioreal', 'inicio', 'inicial'],
  dtFimReal: ['datafim', 'fimreal', 'termino', 'fim'],
  dataBaseCusto: ['databasecusto', 'database', 'mesbase', 'databasedocusto'],
  elegivel: ['elegivel', 'referencia'],
}

// Sugere { campoCanonico: indiceColuna } a partir dos cabeçalhos.
export function mapearCabecalho(headers) {
  const mapa = {}
  const usados = new Set()
  headers.forEach((h, i) => {
    const hn = normalizar(h)
    if (!hn) return
    for (const [canon, syns] of Object.entries(SINONIMOS)) {
      if (usados.has(canon)) continue
      if (syns.some((s) => { const sn = normalizar(s); return hn === sn || hn.includes(sn) })) {
        mapa[canon] = i
        usados.add(canon)
        break
      }
    }
  })
  return mapa
}

// Converte texto pt-BR/numérico em número (aceita 1.234.567,89 e 1234.5).
export function numero(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  let s = String(v).trim().replace(/[^\d.,-]/g, '')
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s)
  return isFinite(n) ? n : null
}

// Existe no calendário? '2023-13-01' e '2023-02-31' têm a FORMA de uma data e o Postgres
// recusa as duas (22007/22008) — conferir só o formato com /^\d{4}-\d{2}-\d{2}$/ não basta.
function existeNoCalendario(ano, mes, dia) {
  if (mes < 1 || mes > 12 || dia < 1) return false
  // Dia 0 do mês seguinte = último dia deste mês (resolve fevereiro/bissexto sem tabela).
  return dia <= new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

// Converte para 'YYYY-MM-DD' (ou 'YYYY-MM-01' quando vier só mês). Devolve null para
// qualquer coisa que não seja uma data real — NUNCA uma string inválida.
//
// Cada ramo nomeia ano/mes/dia em vez de devolver um template com m[1..3] direto: era daí que
// vinha o `${m[3]}-${m[1]}-01` no ramo MM/AAAA, cujo grupo 3 não existe. O resultado,
// "undefined-06-01", é truthy — passava em `if (!l.dataBaseCusto)` na validação, a prévia
// aprovava a linha, e o INSERT do /confirmar estourava 22007 no meio do laço (que não é
// transacional), deixando a planilha gravada pela metade.
export function data(v) {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  let m, ano, mes, dia
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) [ano, mes, dia] = [m[1], m[2], m[3]]
  else if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/))) [ano, mes, dia] = [m[3], m[2], m[1]]
  else if ((m = s.match(/^(\d{4})-(\d{2})$/))) [ano, mes, dia] = [m[1], m[2], '01']
  else if ((m = s.match(/^(\d{2})\/(\d{4})$/))) [ano, mes, dia] = [m[2], m[1], '01']
  else return null
  // Único ponto de saída: as regexes garantem a forma, isto garante o conteúdo.
  return existeNoCalendario(+ano, +mes, +dia) ? `${ano}-${mes}-${dia}` : null
}

const texto = (v) => (v == null ? null : String(v).trim() || null)

export function ehVerdadeiro(v) {
  return ['sim', 'true', '1', 'x', 'y', 'yes', 'verdadeiro'].includes(normalizar(v))
}

// Monta uma linha canônica a partir de uma linha bruta (array) + o mapa.
export function montarLinha(row, mapa) {
  const get = (c) => { const i = mapa[c]; return i == null ? null : row[i] }
  // Célula PREENCHIDA que não virou data ≠ célula vazia, e a diferença tem que ser dizível.
  // Sem isto o guard de data() troca um estouro no INSERT por uma perda de dado silenciosa:
  // uma coluna inteira em 'mar/23' viraria NULL e a obra gravaria como se a planilha nunca
  // tivesse trazido a data. `datasIlegiveis` leva o fato até validarLinha.
  const datasIlegiveis = []
  const dataDe = (campo, rotulo) => {
    const bruto = get(campo)
    const d = data(bruto)
    if (d == null && bruto != null && String(bruto).trim() !== '') datasIlegiveis.push(rotulo)
    return d
  }
  return {
    codigo: texto(get('codigo')),
    nome: texto(get('nome')),
    tipoNome: texto(get('tipo')),
    padraoNome: texto(get('padrao')),
    municipio: texto(get('municipio')),
    uf: get('uf') != null ? String(get('uf')).trim().toUpperCase().slice(0, 2) : null,
    areaConstruidaM2: numero(get('areaConstruidaM2')),
    custoRealTotal: numero(get('custoRealTotal')),
    custoOrcadoTotal: numero(get('custoOrcadoTotal')),
    dtInicioReal: dataDe('dtInicioReal', 'início'),
    dtFimReal: dataDe('dtFimReal', 'fim'),
    dataBaseCusto: dataDe('dataBaseCusto', 'data-base'),
    elegivel: ehVerdadeiro(get('elegivel')),
    datasIlegiveis,
  }
}

// Razão realizado/orçado a partir da qual a linha vira suspeita de erro de digitação.
// A aderência histórica (bottom-up) é a MÉDIA dessas razões: um "1.200.000" digitado como
// "1200000000" não é rejeitado por nada e envenena toda estimativa futura daquele tipo de obra.
export const RATIO_SUSPEITO = 3

// Valida a linha canônica; retorna { ok, erros[], avisos[] }. RF-C02.
//
// erros  → bloqueiam a gravação da linha (dado quebrado ou contraditório).
// avisos → a linha GRAVA, mas não serve para algum uso. É a diferença entre "importei 200 obras"
//          e "importei 200 obras, das quais 140 nunca vão aparecer numa estimativa" — sem isto,
//          o acervo cresce sem que ninguém perceba que ele não sustenta o que promete.
export function validarLinha(l) {
  const erros = []
  const avisos = []

  if (!l.codigo) erros.push('código vazio')
  if (!l.nome) erros.push('nome vazio')
  if (l.areaConstruidaM2 != null && l.areaConstruidaM2 < 0) erros.push('área negativa')
  if (l.custoRealTotal != null && l.custoRealTotal < 0) erros.push('custo real negativo')
  if (l.custoOrcadoTotal != null && l.custoOrcadoTotal < 0) erros.push('custo orçado negativo')
  if (l.dtInicioReal && l.dtFimReal && l.dtFimReal < l.dtInicioReal) erros.push('fim antes do início')

  // Data preenchida mas ilegível. AVISO e não erro pelo mesmo motivo do zero logo abaixo: hoje
  // uma célula 'a definir' em dt_fim já importa (data() devolve null), e promovê-la a erro
  // passaria a BLOQUEAR planilhas que passam — regressão pior que o dado faltando. Como aviso,
  // a agregação por texto do /previa transforma "180 linhas com data-base em mar/23" em uma
  // ação única, e a reimportação é idempotente (RF-C04): corrigir a planilha e reenviar basta.
  for (const rotulo of l.datasIlegiveis || []) {
    avisos.push(`${rotulo}: data em formato não reconhecido — o campo será gravado VAZIO (use AAAA-MM-DD, DD/MM/AAAA ou MM/AAAA)`)
  }

  // Os textos abaixo afirmam CONSEQUÊNCIAS, então precisam espelhar os filtros reais do acervo —
  // não o que seria intuitivo. As duas fontes de verdade, em server/index.js:
  //
  //   CAND (paramétrica):    WHERE elegivel_referencia AND area_construida_m2 > 0
  //                            AND COALESCE(NULLIF(custo_real_total, 0), custo_orcado_total) > 0
  //   aderenciaHistorica:    WHERE elegivel_referencia AND custo_orcado_total > 0
  //                            AND custo_real_total > 0        (sem filtro de área)
  //
  // O COALESCE é a pegadinha: sem custo real (ou com ele zerado) a obra **entra** na paramétrica
  // usando o ORÇADO — e o CAND ainda o aliasa como "custoRealTotal". Dizer "não entrará" seria
  // tranquilizar o usuário sobre uma linha que vai puxar a estimativa com número de orçamento.
  const custoUsado = l.custoRealTotal > 0 ? l.custoRealTotal : l.custoOrcadoTotal // = o COALESCE

  // Zero/ausência são AVISO e não erro de propósito: a obra é gravável e vale como registro —
  // rejeitar a linha perderia o histórico e quebraria a reimportação de planilhas que hoje passam.
  // Área é o único filtro sem COALESCE, mas só exclui da paramétrica e do prazo por m².
  if (l.areaConstruidaM2 === 0) avisos.push('área zero — fora da estimativa paramétrica e do prazo por m² (ainda conta na aderência do bottom-up)')

  // Só faz sentido cobrar utilidade de quem foi marcado como referência.
  if (l.elegivel) {
    if (l.areaConstruidaM2 == null) avisos.push('marcada como referência mas sem área — não entrará em estimativa paramétrica')
    if (!(custoUsado > 0)) {
      avisos.push('sem custo real nem orçado — não entrará em estimativa paramétrica')
    } else if (!(l.custoRealTotal > 0)) {
      // O perigo não é ficar de fora — é entrar com o número errado.
      avisos.push('sem custo real: o custo ORÇADO será usado como se fosse realizado na estimativa paramétrica')
    }
    // diasM2 exige as duas datas reais.
    if (!l.dtInicioReal || !l.dtFimReal) avisos.push('sem datas reais completas — não contribui para estimativa de prazo')
    // A aderência é a razão realizado/orçado, e ambos os lados exigem > 0 — logo `== null` deixaria
    // passar o zero, que é o que uma célula com "n/a"/"a definir" vira em numero().
    if (!(l.custoOrcadoTotal > 0)) avisos.push('sem custo orçado (ou zero) — não contribui para a aderência do bottom-up')
    if (!(l.custoRealTotal > 0)) avisos.push('sem custo real (ou zero) — não contribui para a aderência do bottom-up')
    // Sem data-base o custo não é trazido a valor presente: entra na conta com fator 1.
    if (!l.dataBaseCusto) avisos.push('sem data-base — o custo não será atualizado monetariamente')
  }

  // Outlier de aderência: provável erro de digitação/unidade em um dos dois custos.
  if (l.custoRealTotal > 0 && l.custoOrcadoTotal > 0) {
    const r = l.custoRealTotal / l.custoOrcadoTotal
    if (r >= RATIO_SUSPEITO || r <= 1 / RATIO_SUSPEITO) {
      avisos.push(`custo real e orçado divergem ${r >= 1 ? `${r.toFixed(1)}×` : `1/${(1 / r).toFixed(1)}`} — confira se não há erro de digitação`)
    }
  }

  return { ok: erros.length === 0, erros, avisos }
}
