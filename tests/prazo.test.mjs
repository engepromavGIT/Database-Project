// Testes do prazo direto (bottom-up). Rode: node tests/prazo.test.mjs
import { estimarPrazoDireto } from '../server/estimativa/metodos.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m) } }
const near = (a, b, t, m) => ok(a != null && Math.abs(a - b) <= t, `${m} (got ${a}, esp ${b})`)

const r = estimarPrazoDireto([100, 150, 200, 300, 250])
near(r.M, 200, 1e-9, 'prazo direto M (média)')
near(r.O, 120, 1e-9, 'prazo direto O (P10)')
near(r.P, 280, 1e-9, 'prazo direto P (P90)')
near(r.esperado, 200, 1e-9, 'prazo direto esperado (PERT)')

const u = estimarPrazoDireto([150])
near(u.esperado, 150, 1e-9, 'prazo direto único valor')

const v = estimarPrazoDireto([])
ok(v.esperado === null, 'prazo direto vazio → null')

console.log(`\nPrazo: ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
