// Custo por etapa da EAP com roll-up hierárquico (RF-D02) + guarda de ciclo da EAP (RF-B02).
// Funções PURAS e testáveis (molde de curvaABC.js / produtividade.js). NUNCA lançam.
//
// custoPorEtapa(): o custo de uma etapa = itens dela + itens de TODAS as descendentes. As
// macro-etapas não têm itens próprios (o custo vive nas folhas), então sem o roll-up elas
// apareceriam zeradas. Deriva R$/m² e % do total. Sem área (0/nula) → custoM2 = null.
//
// A hierarquia real é a FK etapa_pai_id (não o código EAP textual). Como a EAP passou a ser
// editável (RF-B02), a travessia é:
//   - ITERATIVA (pilha explícita): uma EAP profunda estouraria a pilha do V8 se fosse
//     recursiva (~5k níveis) → RangeError → 500 permanente naquela obra. O contrato aqui é
//     NUNCA lançar, e a profundidade não é limitada pela API.
//   - À prova de CICLO (Set de visitados): um ciclo — que criaCiclo() impede de entrar no
//     banco — jamais pode pendurar o servidor num loop infinito.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const r2 = (v) => Math.round(v * 100) / 100

// Valor de um segmento do código EAP para ordenação:
//   ausente  → -Infinity  ("1" vem ANTES de "1.1": o prefixo é o pai/macro)
//   vazio    → +Infinity  (etapa sem código vai para o fim, não para o topo)
//   numérico → o número   ("2.10" depois de "2.9")
//   qualquer outra coisa → +Infinity (lixo no fim)
const valSeg = (s) => {
  if (s === undefined) return -Infinity
  if (s === '') return Infinity
  const n = Number(s)
  return Number.isFinite(n) ? n : Infinity
}
const cmpSeg = (a, b) => {
  const sa = String(a?.codigoEap ?? '').split('.')
  const sb = String(b?.codigoEap ?? '').split('.')
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const va = valSeg(sa[i]); const vb = valSeg(sb[i])
    if (va !== vb) return va - vb
  }
  return String(a?.descricao ?? '').localeCompare(String(b?.descricao ?? ''))
}
// Irmãs: ordem (o que o usuário controla) → código EAP → descrição.
const cmpIrmas = (a, b) => (num(a?.ordem) - num(b?.ordem)) || cmpSeg(a, b)

export function custoPorEtapa({ etapas = [], itens = [], area } = {}) {
  const A = Number(area)
  const temArea = Number.isFinite(A) && A > 0
  const lista = (Array.isArray(etapas) ? etapas : []).filter((e) => e && e.id != null)
  const its = Array.isArray(itens) ? itens : []

  // Custo próprio: itens lançados diretamente na etapa.
  const proprio = new Map()
  let totalCusto = 0
  for (const it of its) {
    if (it == null) continue
    const c = num(it.custoTotal)
    totalCusto += c
    if (it.etapaId != null) proprio.set(it.etapaId, (proprio.get(it.etapaId) || 0) + c)
  }

  // Árvore. Pai ausente/inexistente/auto-referente → raiz (nada some da tela).
  const porId = new Map(lista.map((e) => [e.id, e]))
  const filhos = new Map()
  const raizes = []
  for (const e of lista) {
    const pai = e.etapaPaiId != null && e.etapaPaiId !== e.id && porId.has(e.etapaPaiId) ? e.etapaPaiId : null
    if (pai == null) raizes.push(e)
    else { const arr = filhos.get(pai) || []; arr.push(e); filhos.set(pai, arr) }
  }

  const visitados = new Set()
  const saida = []
  const total = new Map()

  // Pilha explícita, duas fases por nó: 0 = desce (pré-ordem), 1 = sobe (acumula no pai).
  const percorrer = (raiz) => {
    const pilha = [{ e: raiz, nivel: 0, pai: null, fase: 0 }]
    while (pilha.length) {
      const f = pilha[pilha.length - 1]
      if (f.fase === 0) {
        f.fase = 1
        if (visitados.has(f.e.id)) { pilha.pop(); continue } // ciclo/duplicata: não reentra
        visitados.add(f.e.id)
        saida.push({ e: f.e, nivel: f.nivel })
        total.set(f.e.id, proprio.get(f.e.id) || 0)
        const fs = (filhos.get(f.e.id) || []).slice().sort(cmpIrmas)
        for (let i = fs.length - 1; i >= 0; i--) { // inverso → sai na ordem certa
          pilha.push({ e: fs[i], nivel: f.nivel + 1, pai: f.e.id, fase: 0 })
        }
      } else {
        pilha.pop()
        // Soma no pai pelo qual REALMENTE descemos (não pela FK crua) → ciclo não contamina.
        if (f.pai != null) total.set(f.pai, (total.get(f.pai) || 0) + (total.get(f.e.id) || 0))
      }
    }
  }
  for (const r of raizes.slice().sort(cmpIrmas)) percorrer(r)
  // Etapas presas num ciclo não são alcançadas por raiz nenhuma → entram como raiz.
  for (const e of lista.slice().sort(cmpIrmas)) if (!visitados.has(e.id)) percorrer(e)

  const cm2 = (v) => (temArea ? r2(v / A) : null)
  const pctDe = (v) => (totalCusto > 0 ? r2((v / totalCusto) * 100) : null)

  return {
    area: temArea ? A : null,
    semArea: !temArea,
    total: { custo: r2(totalCusto), custoM2: cm2(totalCusto) },
    etapas: saida.map(({ e, nivel }) => {
      const c = total.get(e.id) || 0
      return {
        id: e.id, codigoEap: e.codigoEap ?? null, descricao: e.descricao ?? null, nivel,
        custoProprio: r2(proprio.get(e.id) || 0),
        custo: r2(c), custoM2: cm2(c), pctCusto: pctDe(c),
      }
    }),
  }
}

// RF-B02: definir `novoPaiId` como pai de `etapaId` criaria um ciclo? Sobe a cadeia de pais a
// partir do novo pai; se reencontrar a própria etapa (ou girar em círculo), é ciclo.
// Os ids são normalizados para string: esta é a guarda que NÃO pode falhar em silêncio se um
// id vier como número (req.params é string, o corpo JSON pode trazer número).
export function criaCiclo(etapas, etapaId, novoPaiId) {
  if (novoPaiId == null || novoPaiId === '') return false // virar raiz nunca cria ciclo
  const alvo = String(etapaId)
  if (String(novoPaiId) === alvo) return true             // auto-referência
  const pai = new Map()
  for (const e of (Array.isArray(etapas) ? etapas : [])) {
    if (e && e.id != null) pai.set(String(e.id), e.etapaPaiId == null ? null : String(e.etapaPaiId))
  }
  const visto = new Set()
  let cur = String(novoPaiId)
  while (cur != null) {
    if (cur === alvo) return true // o novo pai é descendente da própria etapa
    if (visto.has(cur)) return true // ciclo pré-existente → recusa (defensivo)
    visto.add(cur)
    cur = pai.get(cur) ?? null
  }
  return false
}
