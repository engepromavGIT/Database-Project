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

// Converte para 'YYYY-MM-DD' (ou 'YYYY-MM-01' quando vier só mês).
export function data(v) {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  let m
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`
  if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/))) return `${m[3]}-${m[2]}-${m[1]}`
  if ((m = s.match(/^(\d{4})-(\d{2})$/))) return `${m[1]}-${m[2]}-01`
  if ((m = s.match(/^(\d{2})\/(\d{4})$/))) return `${m[3]}-${m[1]}-01`
  return null
}

const texto = (v) => (v == null ? null : String(v).trim() || null)

export function ehVerdadeiro(v) {
  return ['sim', 'true', '1', 'x', 'y', 'yes', 'verdadeiro'].includes(normalizar(v))
}

// Monta uma linha canônica a partir de uma linha bruta (array) + o mapa.
export function montarLinha(row, mapa) {
  const get = (c) => { const i = mapa[c]; return i == null ? null : row[i] }
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
    dtInicioReal: data(get('dtInicioReal')),
    dtFimReal: data(get('dtFimReal')),
    dataBaseCusto: data(get('dataBaseCusto')),
    elegivel: ehVerdadeiro(get('elegivel')),
  }
}

// Valida a linha canônica; retorna { ok, erros[] }.
export function validarLinha(l) {
  const erros = []
  if (!l.codigo) erros.push('código vazio')
  if (!l.nome) erros.push('nome vazio')
  if (l.areaConstruidaM2 != null && l.areaConstruidaM2 < 0) erros.push('área negativa')
  if (l.custoRealTotal != null && l.custoRealTotal < 0) erros.push('custo real negativo')
  if (l.custoOrcadoTotal != null && l.custoOrcadoTotal < 0) erros.push('custo orçado negativo')
  if (l.dtInicioReal && l.dtFimReal && l.dtFimReal < l.dtInicioReal) erros.push('fim antes do início')
  return { ok: erros.length === 0, erros }
}
