// Testes do núcleo de estimativa (sem framework). Rode: node tests/estimativa.test.mjs
import { chaveMes, fatorAtualizacao, custoM2, ajusteRegional } from '../server/estimativa/normalizacao.js'
import { escoreSimilaridade, proximidadeArea } from '../server/estimativa/similaridade.js'
import {
  mediaPonderada, percentil, pert, coefVariacao,
  estimarParametrico, estimarPrazo, nivelConfianca, rotuloConfianca,
} from '../server/estimativa/metodos.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++ } else { fail++; console.error('  ✗ FALHOU:', msg) } }
const near = (a, b, tol, msg) => ok(a != null && Math.abs(a - b) <= tol, `${msg} (got ${a}, esp ${b})`)

// --- normalização ---
ok(chaveMes('2026-06-26') === '2026-06', 'chaveMes data')
near(fatorAtualizacao({ '2024-01': 100, '2026-01': 130 }, '2024-01-01', '2026-01-01'), 1.3, 1e-9, 'fatorAtualizacao')
ok(fatorAtualizacao({ '2024-01': 100 }, '2024-01', '2026-01') === null, 'fator null se faltar índice')
near(custoM2(1200000, 1000), 1200, 1e-9, 'custoM2')
near(ajusteRegional(1000, 1.0, 1.1), 1100, 1e-9, 'ajusteRegional')

// --- similaridade ---
const alvo = { tipoObraId: 't1', padraoOrdem: 1, areaAlvoM2: 1000, localidadeId: 'l1', uf: 'SP' }
near(escoreSimilaridade(alvo, { tipoObraId: 't1', padraoOrdem: 1, areaConstruidaM2: 1000, localidadeId: 'l1', uf: 'SP', recencia: 1 }), 1, 1e-9, 'escore idêntico = 1')
near(escoreSimilaridade(alvo, { tipoObraId: 't2', padraoOrdem: 1, areaConstruidaM2: 1000, localidadeId: 'l1', uf: 'SP', recencia: 1 }), 0.70, 1e-9, 'escore tipo diferente = 0,70')
near(proximidadeArea(1000, 800), 0.8, 1e-9, 'proximidadeArea 20% diff')

// --- métodos ---
near(mediaPonderada([{ valor: 100, peso: 1 }, { valor: 200, peso: 3 }]), 175, 1e-9, 'mediaPonderada')
near(percentil([10, 20, 30, 40], 0.5), 25, 1e-9, 'percentil mediana')
const pp = pert(100, 150, 260)
near(pp.esperado, 160, 1e-9, 'pert esperado')
near(pp.desvio, 26.6667, 1e-3, 'pert desvio')
near(coefVariacao([100, 100, 100]), 0, 1e-9, 'coefVar zero')

const est = estimarParametrico(
  [{ custoM2: 2860, peso: 0.9 }, { custoM2: 2969, peso: 0.7 }, { custoM2: 3016, peso: 0.5 }],
  1200,
)
near(est.M, 3520171.43, 1, 'paramétrico M (provável)')
near(est.O, 3458160, 1, 'paramétrico O (otimista)')
near(est.P, 3607920, 1, 'paramétrico P (pessimista)')
ok(est.esperado >= est.O && est.esperado <= est.P, 'esperado dentro da faixa O..P')

const pz = estimarPrazo([{ valor: 0.3, peso: 1 }, { valor: 0.4, peso: 1 }], 1000)
near(pz.M, 350, 1e-9, 'prazo M')
near(pz.esperado, 350, 1e-9, 'prazo esperado')

ok(nivelConfianca({ n: 5, coefVar: 0, simMedia: 1 }) === 100, 'confiança máxima = 100')
ok(nivelConfianca({ n: 1, coefVar: 0, simMedia: 1 }) === 20, 'confiança n=1 = 20')
ok(rotuloConfianca(100) === 'Alta' && rotuloConfianca(50) === 'Média' && rotuloConfianca(20) === 'Baixa', 'rótulos de confiança')

console.log(`\nTestes do núcleo: ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
