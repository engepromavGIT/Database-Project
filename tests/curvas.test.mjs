// Testes da curva S (cronograma físico-financeiro). Rode: node tests/curvas.test.mjs
import { curvaS } from '../server/curvaS.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m) } }
const ponto = (r, mes) => r.pontos.find((p) => p.competencia === mes)

// ---- 1) Previsto LINEAR das datas de plano + custo orçado ----
{
  const r = curvaS({ plano: { dtInicioPlan: '2025-01-01', dtFimPlan: '2025-04-01', custoOrcadoTotal: 400 } })
  ok(r.previstoFonte === 'linear', 'linear: fonte = linear')
  ok(r.pontos.length === 4, 'linear: 4 meses (jan..abr)')
  ok(ponto(r, '2025-01').prevFisicoPct === 25 && ponto(r, '2025-04').prevFisicoPct === 100, 'linear: físico 25%→100%')
  ok(ponto(r, '2025-01').prevFinanceiro === 100 && ponto(r, '2025-04').prevFinanceiro === 400, 'linear: financeiro 100→400')
  ok(ponto(r, '2025-02').prevFinanceiroPct === 50, 'linear: % financeiro = 50% no 2º mês')
  ok(r.fonteFinanceiroRealizado === null && r.pontos.every((p) => p.realFisicoPct === null), 'linear: sem realizado')
}

// ---- 2) Realizado físico (acumulado, LOCF nos buracos; null antes da 1ª medição) ----
{
  const r = curvaS({
    plano: { dtInicioPlan: '2025-01-01', dtFimPlan: '2025-05-01', custoOrcadoTotal: 500 },
    medicoes: [
      { competencia: '2025-02', avancoFisicoPct: 20 },
      { competencia: '2025-04', avancoFisicoPct: 55 },
    ],
  })
  ok(ponto(r, '2025-01').realFisicoPct === null, 'realizado: null antes da 1ª medição')
  ok(ponto(r, '2025-02').realFisicoPct === 20, 'realizado: 20% em fev')
  ok(ponto(r, '2025-03').realFisicoPct === 20, 'realizado: LOCF (carry-forward) em mar')
  ok(ponto(r, '2025-05').realFisicoPct === 55, 'realizado: patamar 55% após última medição')
}

// ---- 3) Financeiro realizado de custos_realizados (soma acumulada), base % sobre orçado ----
{
  const r = curvaS({
    plano: { dtInicioPlan: '2025-01-01', dtFimPlan: '2025-03-01', custoOrcadoTotal: 1000 },
    custosRealizados: [
      { competencia: '2025-01-01', valor: 200 },
      { competencia: '2025-02-01', valor: 300 },
    ],
  })
  ok(r.fonteFinanceiroRealizado === 'custos_realizados', 'financeiro: fonte custos_realizados')
  ok(ponto(r, '2025-01').realFinanceiro === 200 && ponto(r, '2025-02').realFinanceiro === 500, 'financeiro: acumulado 200→500')
  ok(ponto(r, '2025-02').realFinanceiroPct === 50, 'financeiro: 50% do orçado')
  ok(ponto(r, '2025-03').realFinanceiro === 500, 'financeiro: patamar (sem desembolso em mar)')
}

// ---- 4) medicoes.desembolso é fallback só quando NÃO há custos_realizados ----
{
  const soMed = curvaS({ plano: { custoOrcadoTotal: 1000 }, medicoes: [{ competencia: '2025-01', desembolso: 400 }] })
  ok(soMed.fonteFinanceiroRealizado === 'medicoes', 'fallback: medicoes quando não há custos_realizados')
  ok(ponto(soMed, '2025-01').realFinanceiro === 400, 'fallback: acumula desembolso da medição')
  const comCR = curvaS({
    plano: { custoOrcadoTotal: 1000 },
    medicoes: [{ competencia: '2025-01', desembolso: 400 }],
    custosRealizados: [{ competencia: '2025-01-01', valor: 999 }],
  })
  ok(comCR.fonteFinanceiroRealizado === 'custos_realizados', 'precedência: custos_realizados vence medicoes.desembolso')
  ok(ponto(comCR, '2025-01').realFinanceiro === 999, 'precedência: usa custos_realizados (999), não a medição')
}

// ---- 5) Baseline explícito tem precedência sobre linear ----
{
  const r = curvaS({
    plano: { dtInicioPlan: '2025-01-01', dtFimPlan: '2025-12-01', custoOrcadoTotal: 1000 },
    medicoes: [
      { competencia: '2025-01', avancoPlanPct: 10, desembolsoPlan: 100 },
      { competencia: '2025-02', avancoPlanPct: 40, desembolsoPlan: 300 },
    ],
  })
  ok(r.previstoFonte === 'baseline', 'baseline: precede o linear quando há avanco_plan/desembolso_plan')
  ok(ponto(r, '2025-01').prevFisicoPct === 10 && ponto(r, '2025-02').prevFisicoPct === 40, 'baseline: físico da série registrada')
  ok(ponto(r, '2025-02').prevFinanceiro === 400, 'baseline: financeiro = soma acumulada do desembolso_plan (100+300)')
}

// ---- 6) Estouro de custo: % > 100 preservado e yMaxPct acomoda ----
{
  const r = curvaS({
    plano: { dtInicioPlan: '2025-01-01', dtFimPlan: '2025-02-01', custoOrcadoTotal: 100 },
    custosRealizados: [{ competencia: '2025-01-01', valor: 130 }],
  })
  ok(ponto(r, '2025-01').realFinanceiroPct === 130, 'estouro: 130% preservado (sem cap)')
  ok(r.yMaxPct >= 130, 'estouro: yMaxPct acomoda a linha (>=130)')
}

// ---- 7) Orçado 0/nulo → sem base financeira (%), mas R$ acumulado continua ----
{
  const r = curvaS({
    plano: { dtInicioPlan: '2025-01-01', dtFimPlan: '2025-02-01', custoOrcadoTotal: 0 },
    custosRealizados: [{ competencia: '2025-01-01', valor: 500 }],
  })
  ok(r.semBaseFinanceira === true, 'orçado 0: semBaseFinanceira')
  ok(ponto(r, '2025-01').realFinanceiro === 500 && ponto(r, '2025-01').realFinanceiroPct === null, 'orçado 0: R$ sim, % não')
  ok(ponto(r, '2025-01').prevFinanceiro === null, 'orçado 0: previsto financeiro linear não computa')
}

// ---- 8) Bordas: sem dados; datas invertidas; datas ausentes ----
{
  ok(curvaS().pontos.length === 0, 'sem entrada → pontos vazios (não lança)')
  const invert = curvaS({ plano: { dtInicioPlan: '2025-05-01', dtFimPlan: '2025-01-01', custoOrcadoTotal: 100 } })
  ok(invert.previstoFonte === null && invert.pontos.length === 0, 'datas invertidas → sem previsto e sem eixo')
  const semPlano = curvaS({ medicoes: [{ competencia: '2025-03', avancoFisicoPct: 30 }] })
  ok(semPlano.previstoFonte === null, 'sem datas de plano nem baseline → previstoFonte null')
  ok(ponto(semPlano, '2025-03').realFisicoPct === 30, 'sem plano: realizado ainda renderiza')
}

// ---- 8b) Campos NULL explícitos (como o pg devolve) NÃO ligam baseline/desembolso ----
// Regressão: Number(null)===0 faria previstoFonte cair em 'baseline' e criar desembolso 0 espúrio.
{
  const r = curvaS({
    plano: { dtInicioPlan: '2025-01-01', dtFimPlan: '2025-03-01', custoOrcadoTotal: 300 },
    medicoes: [{ competencia: '2025-02', avancoFisicoPct: 40, avancoPlanPct: null, desembolso: null, desembolsoPlan: null }],
  })
  ok(r.previstoFonte === 'linear', 'null explícito: previsto continua linear (não vira baseline)')
  ok(r.fonteFinanceiroRealizado === null, 'null explícito: desembolso null não vira fonte financeira')
  ok(ponto(r, '2025-02').realFinanceiro === null, 'null explícito: financeiro realizado permanece null (não 0)')
  ok(ponto(r, '2025-02').realFisicoPct === 40, 'null explícito: físico realizado preservado')
}

// ---- 9) Não lança sob dados sujos (competência inválida, valores não-numéricos) ----
{
  let threw = false
  try {
    curvaS({
      plano: { dtInicioPlan: 'lixo', dtFimPlan: null, custoOrcadoTotal: 'x' },
      medicoes: [{ competencia: 'abc', avancoFisicoPct: 'y' }, { competencia: '2025-13', avancoFisicoPct: 10 }],
      custosRealizados: [{ competencia: null, valor: 'z' }],
    })
  } catch { threw = true }
  ok(!threw, 'dados sujos: nunca lança')
}

// ---- 9b) plano/medicoes/custosRealizados = null explícito não lança (contrato "nunca lança") ----
// Regressão: o default de desestruturação só cobre undefined; plano:null explícito estourava.
{
  let threw = false
  try { curvaS({ plano: null, medicoes: null, custosRealizados: null }) } catch { threw = true }
  ok(!threw, 'plano/medicoes/custosRealizados null → não lança')
  ok(curvaS({ plano: null }).pontos.length === 0, 'plano null → pontos vazios')
}

console.log(`\nCurva S: ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
