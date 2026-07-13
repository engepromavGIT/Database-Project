// Curva S — cronograma físico-financeiro (RF-B05). Função PURA e testável (molde de
// curvaABC.js). NUNCA lança: tolera nulos, vazios e datas inválidas — o endpoint só faz
// I/O, então erro de dado nunca vira 500.
//
// Semântica (fixada também no schema via CHECK/COMMENT na migration 011):
//   - avanço físico (previsto e realizado) = % ACUMULADO ao fim da competência (0..100)
//     → plota direto no eixo Y.
//   - desembolso (previsto e realizado) = INCREMENTAL do mês (R$) → a curva financeira é a
//     SOMA ACUMULADA (running sum) ao longo das competências ordenadas.
//   - base do % financeiro = custo_orcado_total (mesmo denominador p/ previsto e realizado).
//
// PREVISTO (híbrido, por precedência): 'baseline' se a obra tem qualquer avanco_plan_pct/
// desembolso_plan; senão 'linear' se há datas de plano válidas (fim>=início); senão null.
// FINANCEIRO REALIZADO (por precedência de série): 'custos_realizados' (primária) ou, se a
// obra não tem nenhum, 'medicoes' (desembolso) como fallback; senão null.

const MAX_MESES = 600
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100)
// null/undefined/'' → null (NÃO 0). Number(null)===0, então tratar antes é essencial:
// o pg devolve colunas ausentes como null e um 0 espúrio ligaria o baseline/desembolso.
const numOrNull = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// 'YYYY-MM' a partir de 'YYYY-MM-DD' / 'YYYY-MM' / Date-like. null se inválido.
function mesDe(v) {
  if (v == null) return null
  const m = String(v).match(/^(\d{4})-(0[1-9]|1[0-2])/)
  return m ? `${m[1]}-${m[2]}` : null
}
const mesIndex = (mes) => { const [y, m] = mes.split('-').map(Number); return y * 12 + (m - 1) }
const indexMes = (idx) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`

export function curvaS({ medicoes = [], plano = {}, custosRealizados = [] } = {}) {
  const avisos = []
  const p = plano || {} // default só cobre undefined; plano:null explícito precisa de guarda
  const custoOrcado = numOrNull(p.custoOrcadoTotal)
  const temOrcado = custoOrcado != null && custoOrcado > 0
  const semBaseFinanceira = !temOrcado

  const meds = (Array.isArray(medicoes) ? medicoes : [])
    .map((m) => ({
      mes: mesDe(m.competencia),
      avFis: numOrNull(m.avancoFisicoPct),
      avPlan: numOrNull(m.avancoPlanPct),
      desemb: numOrNull(m.desembolso),
      desembPlan: numOrNull(m.desembolsoPlan),
    }))
    .filter((m) => m.mes)

  // custos_realizados agregados por mês (re-agrega defensivamente).
  const crMap = new Map()
  for (const c of (Array.isArray(custosRealizados) ? custosRealizados : [])) {
    const mes = mesDe(c.competencia); const v = numOrNull(c.valor)
    if (mes && v != null) crMap.set(mes, (crMap.get(mes) || 0) + v)
  }

  // Fonte do previsto (nível obra, por precedência).
  const temBaseline = meds.some((m) => m.avPlan != null || m.desembPlan != null)
  const inicioMes = mesDe(p.dtInicioPlan)
  const fimMes = mesDe(p.dtFimPlan)
  const temDatasPlano = !!inicioMes && !!fimMes && mesIndex(fimMes) >= mesIndex(inicioMes)
  const previstoFonte = temBaseline ? 'baseline' : (temDatasPlano ? 'linear' : null)

  // Fonte do financeiro realizado (nível série, nunca mistura mês a mês).
  const temDesembMed = meds.some((m) => m.desemb != null)
  const fonteFinanceiroRealizado = crMap.size > 0 ? 'custos_realizados' : (temDesembMed ? 'medicoes' : null)

  // Eixo mensal denso: min..max de {janela de plano, meses de medição, meses de custos_realizados}.
  const idxs = []
  if (temDatasPlano) idxs.push(mesIndex(inicioMes), mesIndex(fimMes))
  for (const m of meds) idxs.push(mesIndex(m.mes))
  for (const mes of crMap.keys()) idxs.push(mesIndex(mes))

  const base = {
    previstoFonte, fonteFinanceiroRealizado, semBaseFinanceira,
    custoOrcadoTotal: custoOrcado,
    dtInicioPlan: p.dtInicioPlan || null, dtFimPlan: p.dtFimPlan || null,
    yMaxPct: 100, eixoTruncado: false, avisos,
  }
  if (!idxs.length) return { ...base, pontos: [] }

  let lo = Math.min(...idxs); let hi = Math.max(...idxs)
  if (hi - lo + 1 > MAX_MESES) { hi = lo + MAX_MESES - 1; base.eixoTruncado = true; avisos.push('Intervalo de competências muito longo — eixo truncado.') }

  const medByMes = new Map(meds.map((m) => [m.mes, m]))
  const iniIdx = temDatasPlano ? mesIndex(inicioMes) : 0
  const N = temDatasPlano ? (mesIndex(fimMes) - iniIdx + 1) : 0

  const pontos = []
  let realFisAnterior = null, vistaMed = false      // LOCF físico realizado (após a 1ª medição)
  let planFisAnterior = null                          // LOCF físico previsto (baseline)
  let acumRealFin = 0, iniciouRealFin = false         // running sum financeiro realizado
  let acumPlanFin = 0, iniciouPlanFin = false         // running sum financeiro previsto (baseline)
  let yMaxObservado = 100
  let naoMonotono = false

  for (let idx = lo; idx <= hi; idx++) {
    const mes = indexMes(idx)
    const med = medByMes.get(mes)

    // Físico realizado (acumulado, LOCF após a 1ª medição).
    let realFis = null
    if (med && med.avFis != null) {
      if (vistaMed && realFisAnterior != null && med.avFis < realFisAnterior) naoMonotono = true
      realFis = med.avFis; realFisAnterior = med.avFis; vistaMed = true
    } else if (vistaMed) realFis = realFisAnterior

    // Físico previsto.
    let prevFis = null
    if (previstoFonte === 'baseline') {
      if (med && med.avPlan != null) { prevFis = med.avPlan; planFisAnterior = med.avPlan }
      else if (planFisAnterior != null) prevFis = planFisAnterior
    } else if (previstoFonte === 'linear') {
      const k = idx - iniIdx + 1
      prevFis = k <= 0 ? 0 : k >= N ? 100 : r2(100 * k / N)
    }

    // Financeiro realizado (running sum do incremento do mês).
    let incReal = null
    if (fonteFinanceiroRealizado === 'custos_realizados') incReal = crMap.has(mes) ? crMap.get(mes) : null
    else if (fonteFinanceiroRealizado === 'medicoes') incReal = med && med.desemb != null ? med.desemb : null
    let realFin = null
    if (incReal != null) { acumRealFin += incReal; iniciouRealFin = true; realFin = r2(acumRealFin) }
    else if (iniciouRealFin) realFin = r2(acumRealFin)

    // Financeiro previsto.
    let prevFin = null
    if (previstoFonte === 'baseline') {
      const incPlan = med && med.desembPlan != null ? med.desembPlan : null
      if (incPlan != null) { acumPlanFin += incPlan; iniciouPlanFin = true; prevFin = r2(acumPlanFin) }
      else if (iniciouPlanFin) prevFin = r2(acumPlanFin)
    } else if (previstoFonte === 'linear' && temOrcado) {
      const k = idx - iniIdx + 1
      prevFin = k <= 0 ? 0 : k >= N ? r2(custoOrcado) : r2(custoOrcado * k / N)
    }

    // % financeiro sobre o orçado (sem cap: estouro > 100 é preservado).
    const pctFin = (v) => (v == null || !temOrcado ? null : r2(100 * v / custoOrcado))
    const prevFinanceiroPct = pctFin(prevFin)
    const realFinanceiroPct = pctFin(realFin)
    for (const p of [prevFis, realFis, prevFinanceiroPct, realFinanceiroPct]) if (p != null && p > yMaxObservado) yMaxObservado = p

    pontos.push({
      competencia: mes,
      prevFisicoPct: r2(prevFis), realFisicoPct: r2(realFis),
      prevFinanceiro: prevFin, realFinanceiro: realFin,
      prevFinanceiroPct, realFinanceiroPct,
    })
  }

  if (naoMonotono) avisos.push('Avanço físico realizado não-monotônico (houve correção para baixo).')
  base.yMaxPct = Math.max(100, Math.ceil(yMaxObservado))
  return { ...base, pontos }
}
