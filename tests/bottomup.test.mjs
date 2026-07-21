// Testes do bottom-up e da aderência histórica. Rode: node tests/bottomup.test.mjs
import {
  estatisticaAderencia, estimarBottomUp, confiancaBottomUp, rotuloConfianca, nivelConfianca,
  BU_BASE, BU_TETO, BU_DEGENERADO,
} from '../server/estimativa/metodos.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m) } }
const near = (a, b, t, m) => ok(a != null && Math.abs(a - b) <= t, `${m} (got ${a}, esp ${b})`)

// aderência
const ad = estatisticaAderencia([1.1, 1.0, 0.9])
near(ad.fator, 1.0, 1e-9, 'aderência fator')
near(ad.desvio, 0.1, 1e-9, 'aderência desvio')
ok(ad.n === 3, 'aderência n')
const ad0 = estatisticaAderencia([])
ok(ad0.fator === 1 && ad0.desvio === 0.1 && ad0.n === 0, 'aderência vazia → fallback')

// desvioMedido: o fator e o desvio NÃO nascem juntos. Com 1 obra o fator já é medido, mas o
// desvio ainda é o default 0,1 — a MESMA constante do acervo vazio. Quem exibe precisa saber,
// senão imprime "×1.15 (±0.1) · 1 obra" e afirma que aquela obra sustenta os ±10%.
ok(ad0.desvioMedido === false, 'acervo vazio → desvio não medido')
const ad1 = estatisticaAderencia([1.15])
ok(ad1.fator === 1.15 && ad1.desvio === 0.1 && ad1.desvioMedido === false,
  'n=1 → fator medido, desvio ainda é o default (não medido)')
const ad2 = estatisticaAderencia([1.1, 1.2])
ok(ad2.desvioMedido === true && ad2.desvio !== 0.1, 'n=2 → desvio medido de verdade')
ok(ad.desvioMedido === true, 'n=3 → desvio medido')

// bottom-up
const b1 = estimarBottomUp(100000, 1.0, 0.1)
near(b1.O, 90000, 1e-6, 'bottom-up O')
near(b1.M, 100000, 1e-6, 'bottom-up M')
near(b1.P, 110000, 1e-6, 'bottom-up P')
near(b1.esperado, 100000, 1e-6, 'bottom-up esperado')

const b2 = estimarBottomUp(50000, 1.2, 0)
near(b2.M, 60000, 1e-6, 'bottom-up fator 1.2 M')
near(b2.esperado, 60000, 1e-6, 'bottom-up fator 1.2 esperado')

// ---- RF-F04: confiança do bottom-up ----
const cbu = (n, fator, desvio, tipoFiltrado = true) => confiancaBottomUp({ n, fator, desvio, tipoFiltrado })

// Sem evidência: cai na base. n=0 é o estado normal de um acervo novo, não um erro — e 0%
// (o que o reuso de nivelConfianca daria) seria indistinguível de cálculo quebrado.
ok(cbu(0, 1, 0.1) === BU_BASE, 'n=0 (acervo vazio) → base')
ok(rotuloConfianca(cbu(0, 1, 0.1)) === 'Baixa', 'n=0 → rótulo Baixa')

// A dispersão só conta com n>=3: em n=1 o desvio é o default 0,1 (constante, não medição) e em
// n=2 é |r1-r2|/√2 (a distância entre dois pontos). Creditar qualquer um vira ruído virando confiança.
ok(cbu(1, 1.15, 0.1) === BU_BASE, 'n=1 → base (desvio é o default, não medição)')
ok(cbu(2, 1.15, 0.07) === BU_BASE, 'n=2 → base (dois pontos não são distribuição)')
ok(cbu(3, 1.1, 0.055) > BU_BASE, 'n=3 → acima da base (há distribuição)')

// Aderência dispersa NÃO pode ler "Alta". Este é o defeito que condenou o reuso de nivelConfianca:
// com simMedia=1, nivelConfianca({n:8, coefVar:0.5, simMedia:1}) = 75 => "Alta".
ok(nivelConfianca({ n: 8, coefVar: 0.5, simMedia: 1 }) === 75, 'reuso ingênuo daria 75% (regressão documentada)')
ok(rotuloConfianca(cbu(8, 1.0, 0.5)) === 'Baixa', 'n=8 com CV 0,5 → Baixa (e não Alta)')
ok(cbu(8, 1.0, 0.5) < cbu(8, 1.0, 0.05), 'mais dispersão → menos confiança')

// Degenerado: desvio >= fator faz o custo otimista bater em R$ 0 — a faixa não é larga, é sem sentido.
ok(cbu(5, 0.3, 0.3) === BU_DEGENERADO, 'fator === desvio (otimista = 0) → piso degenerado')
ok(cbu(5, 0.2, 0.5) === BU_DEGENERADO, 'desvio > fator → piso degenerado')
ok(cbu(5, 0, 0.1) === BU_DEGENERADO, 'fator zero → piso degenerado')

// Representatividade: sem tipo de obra, aderenciaHistorica mistura todos os tipos no mesmo balde.
ok(cbu(12, 1.08, 0.01, false) < cbu(12, 1.08, 0.01, true), 'amostra mista vale menos que filtrada por tipo')
ok(rotuloConfianca(cbu(12, 1.08, 0.01, false)) !== 'Alta', 'amostra mista não chega a Alta')

// Limites e robustez (metodos.js nunca lança).
ok(cbu(999, 1.08, 0.0001) <= BU_TETO, 'nunca ultrapassa o teto')
ok(cbu(4, 1, 0.0001) >= 70, 'evidência plena e aderência apertada → Alta é alcançável')
ok(cbu(3, 1, 0.0001) < 70, 'com 3 obras, Alta é inalcançável')
ok(confiancaBottomUp({ n: NaN, fator: undefined, desvio: 'x' }) === BU_BASE, 'entrada suja → base, sem lançar')
ok(cbu(-3, 1, 0.1) === BU_BASE, 'n negativo → base')
ok(Number.isInteger(cbu(7, 1.1, 0.05)), 'resultado é inteiro')

// Monotônica em n: ganhar evidência nunca pode derrubar a confiança.
let ant = -1
let mono = true
for (let n = 0; n <= 12; n++) { const c = cbu(n, 1.1, 0.055); if (c < ant) mono = false; ant = c }
ok(mono, 'confiança é monotônica em n (nunca cai ao ganhar evidência)')

console.log(`\nBottom-up: ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
