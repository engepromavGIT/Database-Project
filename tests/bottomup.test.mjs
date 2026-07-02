// Testes do bottom-up e da aderência histórica. Rode: node tests/bottomup.test.mjs
import { estatisticaAderencia, estimarBottomUp } from '../server/estimativa/metodos.js'

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

// bottom-up
const b1 = estimarBottomUp(100000, 1.0, 0.1)
near(b1.O, 90000, 1e-6, 'bottom-up O')
near(b1.M, 100000, 1e-6, 'bottom-up M')
near(b1.P, 110000, 1e-6, 'bottom-up P')
near(b1.esperado, 100000, 1e-6, 'bottom-up esperado')

const b2 = estimarBottomUp(50000, 1.2, 0)
near(b2.M, 60000, 1e-6, 'bottom-up fator 1.2 M')
near(b2.esperado, 60000, 1e-6, 'bottom-up fator 1.2 esperado')

console.log(`\nBottom-up: ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
