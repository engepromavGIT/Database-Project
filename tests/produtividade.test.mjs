// Testes da produtividade por serviço/categoria (RF-D05). Rode: node tests/produtividade.test.mjs
import { produtividade } from '../server/produtividade.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m) } }
const svc = (r, label) => r.porServico.find((s) => s.label === label)
const cat = (r, label) => r.porCategoria.find((c) => c.label === label)

// 1) R$/m², qtd/m² e h/m² por serviço, com área
{
  const r = produtividade({
    area: 100,
    itens: [
      { servicoRefId: 'srv_aco', servicoNome: 'Aço CA-50', unidade: 'kg', quantidade: 500, custoTotal: 5000, horas: 40, categoriaId: 'cat_material', categoriaNome: 'Material' },
      { servicoRefId: 'srv_aco', servicoNome: 'Aço CA-50', unidade: 'kg', quantidade: 300, custoTotal: 3000, horas: 20, categoriaId: 'cat_material', categoriaNome: 'Material' },
      { servicoRefId: 'srv_conc', servicoNome: 'Concreto', unidade: 'm³', quantidade: 50, custoTotal: 20000, horas: null, categoriaId: 'cat_material', categoriaNome: 'Material' },
    ],
  })
  const aco = svc(r, 'Aço CA-50')
  ok(aco.custo === 8000 && aco.quantidade === 800 && aco.horas === 60, 'serviço agrega custo/qtd/horas (2 linhas do aço)')
  ok(aco.custoM2 === 80 && aco.qtdM2 === 8 && aco.horasM2 === 0.6, 'aço: R$/m²=80, qtd/m²=8, h/m²=0,6')
  ok(r.porServico[0].label === 'Concreto', 'ordenado por custo desc (Concreto 20k primeiro)')
  ok(svc(r, 'Concreto').horas === null && svc(r, 'Concreto').horasM2 === null, 'serviço sem horas → h/m² null')
  ok(r.total.custo === 28000 && r.total.custoM2 === 280, 'total custo 28k, R$/m²=280')
  ok(r.total.horas === 60 && r.total.horasM2 === 0.6, 'total horas 60, h/m²=0,6')
  ok(r.temHoras === true && r.semArea === false, 'flags temHoras/semArea')
}

// 2) Agregação por categoria + % do custo
{
  const r = produtividade({
    area: 200,
    itens: [
      { descricao: 'a', quantidade: 1, custoTotal: 6000, categoriaId: 'm', categoriaNome: 'Material' },
      { descricao: 'b', quantidade: 1, custoTotal: 4000, categoriaId: 'mo', categoriaNome: 'Mão de obra' },
    ],
  })
  ok(cat(r, 'Material').custo === 6000 && cat(r, 'Material').pctCusto === 60, 'categoria Material 60% do custo')
  ok(cat(r, 'Material').custoM2 === 30, 'categoria R$/m² = 6000/200 = 30')
  ok(r.porCategoria[0].label === 'Material', 'categorias ordenadas por custo desc')
}

// 3) Sem área → "/m²" null, mas totais aparecem
{
  const r = produtividade({ area: 0, itens: [{ descricao: 'x', quantidade: 10, custoTotal: 1000, horas: 5 }] })
  ok(r.semArea === true && r.total.custo === 1000, 'sem área: total custo ainda soma')
  ok(r.total.custoM2 === null && r.porServico[0].custoM2 === null && r.porServico[0].qtdM2 === null, 'sem área: R$/m² e qtd/m² null')
  ok(r.porServico[0].horasM2 === null, 'sem área: h/m² null (mesmo com horas)')
}

// 4) Item sem serviço nem categoria → agrupa por descrição/unidade e "Sem categoria"
{
  const r = produtividade({ area: 50, itens: [
    { descricao: 'Escavação', unidade: 'm³', quantidade: 100, custoTotal: 2500 },
    { descricao: 'Escavação', unidade: 'm³', quantidade: 100, custoTotal: 2500 },
  ] })
  ok(r.porServico.length === 1 && svc(r, 'Escavação').custo === 5000, 'sem servicoRefId: agrupa por descrição+unidade')
  ok(cat(r, 'Sem categoria').custo === 5000, 'sem categoria → "Sem categoria"')
  ok(r.temHoras === false, 'nenhum horas → temHoras false')
}

// 5) Robustez: entrada vazia/nula, valores não-numéricos → não lança
{
  let threw = false
  try {
    produtividade(); produtividade({ itens: null, area: null })
    produtividade({ area: 'x', itens: [{ custoTotal: 'y', quantidade: null, horas: 'z' }] })
  } catch { threw = true }
  ok(!threw, 'entradas sujas não lançam')
  ok(produtividade().porServico.length === 0, 'sem itens → listas vazias')
}

// 6) Mesmo serviço com unidades diferentes → linhas separadas (não soma qtd incompatível) [fix revisão]
{
  const r = produtividade({
    area: 100,
    itens: [
      { servicoRefId: 'srv_x', servicoNome: 'Serviço X', unidade: 'kg', quantidade: 1000, custoTotal: 100 },
      { servicoRefId: 'srv_x', servicoNome: 'Serviço X', unidade: 't', quantidade: 2, custoTotal: 100 },
    ],
  })
  ok(r.porServico.length === 2, 'mesmo serviço + unidades diferentes → 2 linhas (não soma kg com t)')
  const kg = r.porServico.find((s) => s.unidade === 'kg')
  ok(kg.quantidade === 1000 && kg.qtdM2 === 10, 'linha kg: qtd/m² coerente (1000/100=10)')
  // mesma unidade continua agregando numa linha só
  const r2 = produtividade({ area: 100, itens: [
    { servicoRefId: 'srv_y', servicoNome: 'Y', unidade: 'm²', quantidade: 100, custoTotal: 100 },
    { servicoRefId: 'srv_y', servicoNome: 'Y', unidade: 'm²', quantidade: 100, custoTotal: 100 },
  ] })
  ok(r2.porServico.length === 1 && r2.porServico[0].quantidade === 200, 'mesmo serviço + mesma unidade → 1 linha agregada')
}

// 7) Elemento null/undefined na lista não lança (contrato "nunca lança") [fix revisão]
{
  let threw = false
  try { produtividade({ area: 100, itens: [null, undefined, { custoTotal: 10, quantidade: 1 }] }) } catch { threw = true }
  ok(!threw, 'itens com null/undefined → não lança')
  ok(produtividade({ area: 100, itens: [null] }).porServico.length === 0, 'itens [null] → sem serviços')
}

console.log(`\nProdutividade: ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
