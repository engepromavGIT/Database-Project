// Parser de série de índices econômicos em lote (RF-A06). Função PURA (sem I/O) — a
// gravação (upsert) fica na rota. Aceita colar uma série nestes formatos por linha:
//   1) competência + valor:   "2024-01 100,50"  ·  "01/2024;100.5"       (índice do campo)
//   2) 3 colunas ano/mês/valor: "2024 01 100,50"  (mês inteiro 1..12 + 1 valor)
//   3) matriz anual:            "2024 100 101 ... 111"  (ano + até 12 valores mensais, de Jan)
// Índice inline no início ("SICRO 2024-03 250") sobrescreve o índice padrão. Separadores:
// ';' ou TAB ou espaços. Em ';'/TAB a POSIÇÃO importa (célula vazia = mês pulado, não desloca).
// Decimal pt-BR (vírgula) ou ponto; ponto de milhar sem decimal ("1.234") vira inteiro.
// Linhas '#...' e cabeçalhos (linha só com indice/ano/mes/valor/competência) são ignorados.
import { numero } from './mapear.js'

const MAX_LINHAS = 5000
const HEADER_RE = /^(indice|índice|ano|m[eê]s|valor|competencia|competência)$/i
const COMP_AM = /^(\d{4})[-/](\d{1,2})$/   // AAAA-MM
const COMP_MA = /^(\d{1,2})[-/](\d{4})$/   // MM/AAAA
const ANO_RE = /^(\d{4})$/
const MES_RE = /^\d{1,2}$/
const MILHAR_RE = /^-?\d{1,3}(\.\d{3})+$/  // 1.234 / 12.500 / 1.234.567 (milhar pt-BR, sem vírgula)
const norm = (s) => String(s == null ? '' : s).trim()

// Divide a linha em células. Com ';'/TAB o separador é explícito e a POSIÇÃO importa —
// preserva vazios internos (apara só as bordas) para a matriz não deslocar os meses.
// Sem separador, divide por espaços (que já colapsam, sem vazios).
function celulas(linha) {
  if (!linha.includes(';') && !linha.includes('\t')) return linha.trim().split(/\s+/).map(norm)
  const sep = linha.includes(';') ? ';' : '\t'
  const cs = linha.split(sep).map(norm)
  while (cs.length && cs[0] === '') cs.shift()
  while (cs.length && cs[cs.length - 1] === '') cs.pop()
  return cs
}

// Número de índice: milhar pt-BR sem decimal ("1.234") → inteiro; senão o numero() padrão
// (decimal por vírgula/ponto; "1.234,56" → 1234.56; "100.50" → 100.5).
function numeroIndice(raw) {
  const s = norm(raw)
  if (MILHAR_RE.test(s)) return Number(s.replace(/\./g, ''))
  return numero(s)
}

const ehLetra = (c) => /[a-zA-Zçãõáéíóúâêô]/.test(c)
// Teto = numeric(14,4): |valor| <= 9999999999.9999 (evita 22003 no INSERT).
const valido = (p) =>
  Number.isInteger(p.ano) && p.ano >= 1900 && p.ano <= 2100 &&
  Number.isInteger(p.mes) && p.mes >= 1 && p.mes <= 12 &&
  Number.isFinite(p.valor) && p.valor > 0 && p.valor <= 9999999999.9999

export function parseSerieIndices(texto, indicePadrao = '') {
  const pontos = []
  const erros = []
  const padrao = norm(indicePadrao).toUpperCase()
  const todas = String(texto == null ? '' : texto).split(/\r?\n/)
  const truncado = todas.length > MAX_LINHAS
  const linhas = truncado ? todas.slice(0, MAX_LINHAS) : todas
  const chaves = new Set() // dedup dentro do próprio lote (última ocorrência vence)

  linhas.forEach((linhaBruta, i) => {
    const nLinha = i + 1
    const linha = norm(linhaBruta)
    if (!linha || linha.startsWith('#')) return
    let cel = celulas(linha)
    if (!cel.length) return
    if (cel.every((c) => HEADER_RE.test(c))) return // linha 100% de palavras de cabeçalho

    // Índice inline (1ª célula com letra e não-data) sobrescreve o padrão.
    let indice = padrao
    if (ehLetra(cel[0])) { indice = cel[0].toUpperCase(); cel = cel.slice(1) }
    if (!indice) { erros.push({ linha: nLinha, msg: 'índice não informado (preencha o campo ou coloque na linha).' }); return }
    if (!cel.length) { erros.push({ linha: nLinha, msg: 'linha sem competência/valor.' }); return }

    const head = cel[0]
    const resto = cel.slice(1)
    const add = (ano, mes, valorRaw) => {
      const valor = numeroIndice(valorRaw)
      const p = { indice, ano, mes, valor }
      if (!valido(p)) { erros.push({ linha: nLinha, msg: `valor/competência inválido (${indice} ${ano}-${String(mes).padStart(2, '0')} = ${valorRaw}).` }); return }
      const k = `${indice}|${ano}|${mes}`
      if (chaves.has(k)) { const j = pontos.findIndex((x) => `${x.indice}|${x.ano}|${x.mes}` === k); if (j >= 0) pontos[j] = p }
      else { chaves.add(k); pontos.push(p) }
    }

    let m
    if ((m = head.match(COMP_AM)) || (m = head.match(COMP_MA))) {
      // competência + 1 valor
      const ano = Number(head.match(COMP_AM) ? m[1] : m[2])
      const mes = Number(head.match(COMP_AM) ? m[2] : m[1])
      const vals = resto.filter((x) => x !== '')
      if (vals.length !== 1) { erros.push({ linha: nLinha, msg: 'esperado exatamente 1 valor após a competência.' }); return }
      add(ano, mes, vals[0])
    } else if ((m = head.match(ANO_RE))) {
      const ano = Number(m[1])
      const vals = resto.filter((x) => x !== '')
      if (!vals.length) { erros.push({ linha: nLinha, msg: 'ano sem valores mensais.' }); return }
      // 3 colunas "ano mês valor": mês inteiro 1..12 + exatamente 1 valor → ponto único.
      // (índices nunca valem 1..12, então isto não colide com matriz de valores reais.)
      if (vals.length === 2 && MES_RE.test(vals[0]) && Number(vals[0]) >= 1 && Number(vals[0]) <= 12) {
        add(ano, Number(vals[0]), vals[1]); return
      }
      // matriz anual: mês pela POSIÇÃO (célula vazia = pula o mês, não desloca).
      if (resto.length > 12) { erros.push({ linha: nLinha, msg: 'mais de 12 valores no ano.' }); return }
      resto.forEach((v, k) => { if (v !== '') add(ano, k + 1, v) })
    } else {
      erros.push({ linha: nLinha, msg: `não reconheci a competência/ano em "${head}".` })
    }
  })

  return { pontos, erros, truncado }
}
