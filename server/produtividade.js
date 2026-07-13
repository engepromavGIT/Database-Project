// Produtividade / indicadores por serviço (RF-D05). Função PURA e testável (molde de
// curvaABC.js). NUNCA lança. Agrega os itens de custo de uma obra por SERVIÇO e por
// CATEGORIA e deriva indicadores usando a área construída:
//   - R$/m²   = custo agregado ÷ área
//   - qtd/m²  = quantidade agregada ÷ área  (consumo por m² — ex.: kg de aço por m²)
//   - h/m²    = homem-hora agregada ÷ área  (só quando há horas lançadas)
// Sem área (0/nula) → os "/m²" ficam null (a UI mostra "—"), mas os totais aparecem.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const r2 = (v) => Math.round(v * 100) / 100
const r4 = (v) => Math.round(v * 10000) / 10000

export function produtividade({ itens = [], area } = {}) {
  const A = Number(area)
  const temArea = Number.isFinite(A) && A > 0
  const lista = Array.isArray(itens) ? itens : []
  const rs = (v) => (temArea ? r2(v / A) : null) // R$/m² e h/m²
  const rq = (v) => (temArea ? r4(v / A) : null) // qtd/m²

  const porServico = new Map()
  const porCategoria = new Map()
  let totalCusto = 0, totalHoras = 0, algumHoras = false

  for (const it of lista) {
    if (it == null) continue // contrato "nunca lança": não desreferencia elemento nulo
    const custo = num(it.custoTotal)
    const qtd = num(it.quantidade)
    const horas = it.horas == null || it.horas === '' ? null : num(it.horas)
    if (horas != null) algumHoras = true
    totalCusto += custo
    totalHoras += horas || 0

    // Serviço: agrupa por servico_ref_id + unidade (ou descrição+unidade). A unidade entra na
    // chave para nunca somar quantidades de unidades diferentes (qtd/m² dimensionalmente coerente);
    // no fluxo normal os itens de um serviço têm a mesma unidade → continuam numa linha só.
    const un = (it.unidade || '').trim().toLowerCase()
    const sKey = it.servicoRefId ? `s:${it.servicoRefId}|${un}` : `d:${(it.descricao || '').trim().toLowerCase()}|${un}`
    const s = porServico.get(sKey) || { label: it.servicoNome || it.descricao || '(sem descrição)', unidade: it.unidade || null, custo: 0, quantidade: 0, horas: 0, temHoras: false }
    s.custo += custo; s.quantidade += qtd
    if (horas != null) { s.horas += horas; s.temHoras = true }
    porServico.set(sKey, s)

    // Categoria.
    const cKey = it.categoriaId || '(sem)'
    const c = porCategoria.get(cKey) || { label: it.categoriaNome || 'Sem categoria', custo: 0, horas: 0, temHoras: false }
    c.custo += custo
    if (horas != null) { c.horas += horas; c.temHoras = true }
    porCategoria.set(cKey, c)
  }

  const pct = (v) => (totalCusto > 0 ? r2((v / totalCusto) * 100) : null)

  const servicos = [...porServico.values()].map((s) => ({
    label: s.label, unidade: s.unidade,
    custo: r2(s.custo), quantidade: r4(s.quantidade), horas: s.temHoras ? r2(s.horas) : null,
    custoM2: rs(s.custo), qtdM2: rq(s.quantidade), horasM2: s.temHoras ? rs(s.horas) : null,
    pctCusto: pct(s.custo),
  })).sort((a, b) => b.custo - a.custo)

  const categorias = [...porCategoria.values()].map((c) => ({
    label: c.label, custo: r2(c.custo), horas: c.temHoras ? r2(c.horas) : null,
    custoM2: rs(c.custo), horasM2: c.temHoras ? rs(c.horas) : null, pctCusto: pct(c.custo),
  })).sort((a, b) => b.custo - a.custo)

  return {
    area: temArea ? A : null, semArea: !temArea, temHoras: algumHoras,
    total: {
      custo: r2(totalCusto), horas: algumHoras ? r2(totalHoras) : null,
      custoM2: rs(totalCusto), horasM2: algumHoras ? rs(totalHoras) : null,
    },
    porServico: servicos, porCategoria: categorias,
  }
}
