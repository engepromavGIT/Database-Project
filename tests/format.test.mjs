// Testes dos formatadores compartilhados das telas. Rode: node tests/format.test.mjs
// format.js é puro (só Intl) e roda no node sem DOM.
import { brl, num, pct, desvioPct, monthToDate, prazoDias, faixaPrazo, aderenciaTexto } from '../src/data/format.js'
import { estatisticaAderencia } from '../server/estimativa/metodos.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m) } }
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, esp ${JSON.stringify(b)})`)

// --- nulos: toda tela renderiza '—', nunca 'null' nem 'NaN' ---
eq(brl(null), '—', 'brl(null)')
eq(num(null), '—', 'num(null)')
eq(pct(null), '—', 'pct(null)')
eq(desvioPct(null), '—', 'desvioPct(null)')
eq(prazoDias(null), '—', 'prazoDias(null)')
eq(prazoDias(undefined), '—', 'prazoDias(undefined)')

// --- prazoDias ---
eq(prazoDias(120), '120 dias', 'prazoDias inteiro')
eq(prazoDias(0), '0 dias', 'prazoDias zero não vira "—" (0 é valor, não ausência)')

// --- faixaPrazo (RF-F05) ---
eq(faixaPrazo(95, 160), '95 — 160 dias', 'faixa normal O<P')
eq(faixaPrazo(null, null), '—', 'faixa sem prazo nenhum (acervo sem obras encerradas)')
eq(faixaPrazo(null, 160), '—', 'faixa com O nulo')
eq(faixaPrazo(95, null), '—', 'faixa com P nulo')

// Degenerado: uma referência só (ou histórico sem dispersão) => O === P. Renderizar
// "120 — 120 dias" simularia uma faixa que não existe.
eq(faixaPrazo(120, 120), '120 dias (sem dispersão)', 'faixa degenerada O===P')

// O pg devolve numeric como string; '120' === 120 é falso e imprimiria a faixa degenerada.
eq(faixaPrazo('120', 120), '120 dias (sem dispersão)', 'faixa degenerada com string do pg')

// O "parcial invertido" é real: quando todas as análogas têm escore 0, mediaPonderada devolve
// null (den=0) => M nulo, mas percentil ignora o peso => O/P válidos. A faixa deve aparecer
// mesmo com o provável ausente — é o defeito que o RF-F05 corrige.
eq(prazoDias(null), '—', 'parcial invertido: provável ausente → "—"')
eq(faixaPrazo(53, 77), '53 — 77 dias', 'parcial invertido: faixa aparece mesmo sem o provável')

// --- pct: nivel_confianca_pct é numeric(5,2) e o pg o devolve como STRING ("85.00").
// O template cru `${v}%` imprimia "85.00%" na lista/cenários e "85%" no card recém-gerado.
eq(pct('85.00'), '85%', 'pct com string do pg (numeric)')
eq(pct(85), '85%', 'pct com número do card')
eq(pct('0.00'), '0%', 'pct zero vindo do pg')

// --- aderenciaTexto (RF-F04) ---
// Monta o payload a partir do estatisticaAderencia REAL: o defeito que estes testes travam era
// justamente a tela discordar do que a função de fato mediu.
const payload = (ratios, tipoFiltrado = true) => {
  const ad = estatisticaAderencia(ratios)
  return { fator: Math.round(ad.fator * 100) / 100, desvio: Math.round(ad.desvio * 100) / 100, n: ad.n, desvioMedido: ad.desvioMedido, tipoFiltrado }
}

eq(aderenciaTexto(payload([])), 'sem base histórica (fator 1,00 assumido)', 'n=0 → não finge medição')
eq(aderenciaTexto(null), 'sem base histórica (fator 1,00 assumido)', 'aderência ausente → mesmo texto')

// REGRESSÃO: com 1 obra o fator é medido mas o desvio é o default 0,1. O texto NÃO pode
// imprimir "×1.15 (±0.1) · 1 obra" — isso credita à obra um ±10% que ninguém observou.
const t1 = aderenciaTexto(payload([1.15]))
ok(!t1.includes('(±0.1)'), 'n=1 → não imprime o desvio default como se fosse medido')
ok(t1.includes('não medido'), 'n=1 → diz explicitamente que o desvio não foi medido')
ok(t1.includes('×1.15'), 'n=1 → mas mostra o fator, que É medido')
ok(t1.includes('1 obra') && !t1.includes('1 obras'), 'n=1 → singular')

// A partir de 2 obras o desvio é medido de verdade e pode ser exibido.
const t2 = aderenciaTexto(payload([1.1, 1.2]))
ok(t2.includes('(±0.07)') && !t2.includes('não medido'), 'n=2 → exibe o desvio medido')
ok(t2.includes('2 obras'), 'n=2 → plural')

// Escopo: sem tipo de obra, a aderência mistura todos os tipos — a tela precisa dizer.
ok(aderenciaTexto(payload([1.1, 1.2], false)).includes('todos os tipos'), 'amostra mista é sinalizada')
ok(!aderenciaTexto(payload([1.1, 1.2], true)).includes('todos os tipos'), 'amostra filtrada não sinaliza')

// --- monthToDate ---
eq(monthToDate('2026-07'), '2026-07-01', 'monthToDate month → date')
eq(monthToDate('2026-07-15'), '2026-07-15', 'monthToDate repassa data completa')
eq(monthToDate(''), null, 'monthToDate vazio → null')

console.log(`\nFormatadores: ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
