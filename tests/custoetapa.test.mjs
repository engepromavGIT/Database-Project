// Testes do custo por etapa (RF-D02) e da guarda de ciclo da EAP (RF-B02).
// Rode: node tests/custoetapa.test.mjs
import { custoPorEtapa, criaCiclo } from '../server/custoEtapa.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m) } }
const et = (r, id) => r.etapas.find((e) => e.id === id)

// EAP: 1 FUNDAÇÃO (macro) > 1.1 (itens) e 1.2 (itens); 2 ALVENARIA (macro) > 2.1 (itens)
const EAPAS = [
  { id: 'e1', etapaPaiId: null, codigoEap: '1', descricao: 'FUNDAÇÃO', ordem: 1 },
  { id: 'e11', etapaPaiId: 'e1', codigoEap: '1.1', descricao: 'Escavação', ordem: 1 },
  { id: 'e12', etapaPaiId: 'e1', codigoEap: '1.2', descricao: 'Concreto', ordem: 2 },
  { id: 'e2', etapaPaiId: null, codigoEap: '2', descricao: 'ALVENARIA', ordem: 2 },
  { id: 'e21', etapaPaiId: 'e2', codigoEap: '2.1', descricao: 'Bloco', ordem: 1 },
]
const ITENS = [
  { etapaId: 'e11', custoTotal: 10000 },
  { etapaId: 'e12', custoTotal: 30000 },
  { etapaId: 'e21', custoTotal: 60000 },
]

// 1) Roll-up hierárquico: a macro soma as descendentes (não tem itens próprios)
{
  const r = custoPorEtapa({ etapas: EAPAS, itens: ITENS, area: 100 })
  ok(et(r, 'e1').custo === 40000, 'macro FUNDAÇÃO = 10k + 30k das sub-etapas')
  ok(et(r, 'e1').custoProprio === 0, 'macro não tem custo próprio')
  ok(et(r, 'e2').custo === 60000, 'macro ALVENARIA = 60k')
  ok(et(r, 'e11').custo === 10000, 'folha mantém o próprio custo')
  ok(r.total.custo === 100000, 'total = 100k')
}

// 2) R$/m² e % do total
{
  const r = custoPorEtapa({ etapas: EAPAS, itens: ITENS, area: 100 })
  ok(r.total.custoM2 === 1000, 'total R$/m² = 100000/100')
  ok(et(r, 'e1').custoM2 === 400, 'FUNDAÇÃO R$/m² = 40000/100')
  ok(et(r, 'e1').pctCusto === 40, 'FUNDAÇÃO = 40% do custo')
  ok(et(r, 'e2').pctCusto === 60, 'ALVENARIA = 60% do custo')
}

// 3) Sem área → "/m²" null, mas os custos continuam
{
  const r = custoPorEtapa({ etapas: EAPAS, itens: ITENS, area: 0 })
  ok(r.semArea === true && r.area === null, 'área 0 → semArea')
  ok(r.total.custoM2 === null && et(r, 'e1').custoM2 === null, 'sem área → custoM2 null')
  ok(r.total.custo === 100000 && et(r, 'e1').custo === 40000, 'sem área → custos preservados')
  ok(custoPorEtapa({ etapas: EAPAS, itens: ITENS }).semArea === true, 'área ausente → semArea')
}

// 4) Ordem (pré-ordem) e nível para indentação
{
  const r = custoPorEtapa({ etapas: EAPAS, itens: ITENS, area: 100 })
  ok(r.etapas.map((e) => e.id).join(',') === 'e1,e11,e12,e2,e21', 'pré-ordem: pai antes das filhas, irmãs por ordem')
  ok(et(r, 'e1').nivel === 0 && et(r, 'e11').nivel === 1, 'nível 0 na macro, 1 na sub')
}

// 5) Ordenação numérica do código EAP (2.10 vem depois de 2.9, não antes)
{
  const eaps = [
    { id: 'a', etapaPaiId: null, codigoEap: '2.9', descricao: 'Nove' },
    { id: 'b', etapaPaiId: null, codigoEap: '2.10', descricao: 'Dez' },
  ]
  const r = custoPorEtapa({ etapas: eaps, itens: [], area: 10 })
  ok(r.etapas.map((e) => e.id).join(',') === 'a,b', '2.9 antes de 2.10 (comparação numérica)')
}

// 6) CICLO na EAP não pendura (contrato: termina sempre) e nada some da tela
{
  const ciclo = [
    { id: 'x', etapaPaiId: 'y', codigoEap: '1', descricao: 'X' },
    { id: 'y', etapaPaiId: 'x', codigoEap: '2', descricao: 'Y' },
  ]
  let r = null, threw = false
  try { r = custoPorEtapa({ etapas: ciclo, itens: [{ etapaId: 'x', custoTotal: 500 }], area: 10 }) }
  catch { threw = true }
  ok(!threw, 'ciclo x↔y → não lança nem entra em loop infinito')
  ok(r && r.etapas.length === 2, 'ciclo → as 2 etapas continuam listadas')
  ok(r && r.total.custo === 500, 'ciclo → total preservado')
}

// 7) Robustez: item em etapa inexistente, pai inexistente, nulos
{
  let threw = false
  let r = null
  try {
    r = custoPorEtapa({
      etapas: [null, { id: 'z', etapaPaiId: 'nao-existe', codigoEap: '1', descricao: 'Z' }],
      itens: [null, { etapaId: 'orfao', custoTotal: 70 }, { etapaId: 'z', custoTotal: 30 }],
      area: 10,
    })
  } catch { threw = true }
  ok(!threw, 'etapas/itens com null e pai inexistente → não lança')
  ok(r.etapas.length === 1 && et(r, 'z').custo === 30, 'pai inexistente → vira raiz; custo próprio mantido')
  ok(r.total.custo === 100, 'item órfão ainda conta no total da obra')
  ok(custoPorEtapa().total.custo === 0, 'sem argumentos → não lança')
}

// 8) criaCiclo — guarda de hierarquia do PUT /etapas/:id
{
  ok(criaCiclo(EAPAS, 'e1', null) === false, 'virar raiz (pai null) nunca é ciclo')
  ok(criaCiclo(EAPAS, 'e1', '') === false, 'pai vazio nunca é ciclo')
  ok(criaCiclo(EAPAS, 'e1', 'e1') === true, 'auto-referência é ciclo')
  ok(criaCiclo(EAPAS, 'e1', 'e11') === true, 'pai = filha direta é ciclo')
  ok(criaCiclo(EAPAS, 'e2', 'e21') === true, 'pai = descendente é ciclo')
  ok(criaCiclo(EAPAS, 'e11', 'e2') === false, 'mover sub para outra macro NÃO é ciclo')
  ok(criaCiclo(EAPAS, 'e1', 'e2') === false, 'macro virar filha de outra macro NÃO é ciclo')
  // neto: 1 > 1.1 > 1.1.1 — mover 1 para debaixo de 1.1.1 é ciclo
  const tri = [...EAPAS, { id: 'e111', etapaPaiId: 'e11', codigoEap: '1.1.1', descricao: 'Neta' }]
  ok(criaCiclo(tri, 'e1', 'e111') === true, 'pai = neta é ciclo')
  // ciclo pré-existente na cadeia → recusa (defensivo, não entra em loop)
  const podre = [{ id: 'p', etapaPaiId: 'q' }, { id: 'q', etapaPaiId: 'p' }, { id: 'novo', etapaPaiId: null }]
  ok(criaCiclo(podre, 'novo', 'p') === true, 'cadeia com ciclo pré-existente → recusa')
  ok(criaCiclo(null, 'a', 'b') === false, 'etapas nulas → não lança')
}

// 9) REGRESSÃO — EAP profunda NÃO pode estourar a pilha (a travessia é iterativa).
// A versão recursiva lançava RangeError a partir de ~5.000 níveis → 500 permanente na obra.
{
  const N = 20000
  const fundas = []
  for (let i = 0; i < N; i++) fundas.push({ id: `n${i}`, etapaPaiId: i ? `n${i - 1}` : null, codigoEap: String(i), ordem: 0 })
  let r = null, threw = null
  try { r = custoPorEtapa({ etapas: fundas, itens: [{ etapaId: `n${N - 1}`, custoTotal: '100.00' }], area: 10 }) }
  catch (e) { threw = e }
  ok(!threw, `EAP de ${N} níveis → não lança (${threw?.name || 'ok'})`)
  ok(r && r.etapas.length === N, 'todas as etapas profundas listadas')
  ok(r && et(r, 'n0').custo === 100, 'roll-up sobe da folha até a raiz na EAP profunda')
  ok(r && et(r, `n${N - 1}`).nivel === N - 1, 'nível correto no fundo da cadeia')
}

// 10) REGRESSÃO — o prefixo (macro) vem ANTES das subetapas quando são irmãs (EAP plana).
// Antes: segmento ausente virava Infinity e "1" caía DEPOIS de "1.1"/"1.2".
{
  const plana = [
    { id: 'a', etapaPaiId: null, codigoEap: '1.1', descricao: 'Sub 1' },
    { id: 'b', etapaPaiId: null, codigoEap: '1', descricao: 'Macro' },
    { id: 'c', etapaPaiId: null, codigoEap: '2', descricao: 'Macro 2' },
    { id: 'd', etapaPaiId: null, codigoEap: '1.2', descricao: 'Sub 2' },
  ]
  const r = custoPorEtapa({ etapas: plana, itens: [], area: 10 })
  ok(r.etapas.map((e) => e.codigoEap).join('|') === '1|1.1|1.2|2', `prefixo antes das filhas: ${r.etapas.map((e) => e.codigoEap).join('|')}`)
  // Etapa sem código vai para o FIM (antes ia para o topo: Number('') === 0)
  const semCod = [...plana, { id: 'z', etapaPaiId: null, codigoEap: '', descricao: 'Sem código' }]
  const r2 = custoPorEtapa({ etapas: semCod, itens: [], area: 10 })
  ok(r2.etapas[r2.etapas.length - 1].id === 'z', 'etapa sem código EAP vai para o fim, não para o topo')
}

// 11) REGRESSÃO — criaCiclo normaliza o tipo do id (a guarda não pode falhar em silêncio).
// req.params.id é sempre string; o corpo JSON pode trazer número.
{
  const mistas = [{ id: 1, etapaPaiId: null }, { id: 2, etapaPaiId: 1 }]
  ok(criaCiclo(mistas, '1', 2) === true, 'id number no banco × string no params → ciclo detectado')
  ok(criaCiclo(mistas, 1, '2') === true, 'id string no corpo × number no banco → ciclo detectado')
  ok(criaCiclo(mistas, '1', '1') === true, 'auto-referência com tipos diferentes → ciclo')
  ok(criaCiclo(mistas, '2', 1) === false, 'mover filha para o pai (já é) → não é ciclo')
}

console.log(`\nCusto por etapa / ciclo EAP: ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
