// Testes da curva ABC. Rode: node tests/abc.test.mjs
import { curvaABC } from '../server/curvaABC.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m) } }

// Entrada desordenada deve sair ordenada por custo desc + classificada.
const r = curvaABC([{ id: 'b', custoTotal: 15 }, { id: 'a', custoTotal: 80 }, { id: 'c', custoTotal: 5 }])
ok(r.length === 3, 'mantém 3 itens')
ok(r[0].id === 'a' && r[0].classe === 'A' && r[0].pct === 80 && r[0].pctAcumulado === 80, 'item A (80%)')
ok(r[1].id === 'b' && r[1].classe === 'B' && r[1].pctAcumulado === 95, 'item B (acum 95%)')
ok(r[2].id === 'c' && r[2].classe === 'C' && r[2].pctAcumulado === 100, 'item C (acum 100%)')

// Item único dominante = classe A.
const u = curvaABC([{ id: 's', custoTotal: 50 }])
ok(u.length === 1 && u[0].classe === 'A' && u[0].pct === 100, 'item único → A')

// Itens sem custo são ignorados.
ok(curvaABC([{ id: 'x', custoTotal: 0 }]).length === 0, 'ignora custo 0')
ok(curvaABC([]).length === 0, 'lista vazia')

console.log(`\nCurva ABC: ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
