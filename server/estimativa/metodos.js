// Métodos de estimativa: média ponderada, percentis, PERT (3 pontos),
// estimativa paramétrica (custo e prazo), bottom-up e nível de confiança.
// Funções puras, testáveis. Implementa o doc 05 (Regras de Estimativa).

export function mediaPonderada(pares) {
  let num = 0
  let den = 0
  for (const { valor, peso } of pares) {
    if (valor == null) continue
    const w = peso == null ? 1 : peso
    num += valor * w
    den += w
  }
  return den > 0 ? num / den : null
}

// Percentil por interpolação linear (q em [0,1]).
export function percentil(valores, q) {
  const xs = valores.filter((v) => v != null).sort((a, b) => a - b)
  if (!xs.length) return null
  const pos = (xs.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return xs[lo]
  return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)
}

// PERT / 3 pontos.
export function pert(o, m, p) {
  return { esperado: (o + 4 * m + p) / 6, desvio: (p - o) / 6 }
}

// Coeficiente de variação (desvio-padrão amostral / média).
export function coefVariacao(valores) {
  const xs = valores.filter((v) => v != null)
  if (xs.length < 2) return 0
  const media = xs.reduce((a, b) => a + b, 0) / xs.length
  if (media === 0) return 0
  const varia = xs.reduce((a, b) => a + (b - media) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(varia) / Math.abs(media)
}

// Estimativa paramétrica de CUSTO a partir de itens { custoM2, peso } e a área-alvo.
export function estimarParametrico(itens, areaAlvo) {
  const custoM2Prov = mediaPonderada(itens.map((i) => ({ valor: i.custoM2, peso: i.peso })))
  const cm2s = itens.map((i) => i.custoM2).filter((v) => v != null)
  const o = percentil(cm2s, 0.1)
  const p = percentil(cm2s, 0.9)
  const O = o != null ? o * areaAlvo : null
  const M = custoM2Prov != null ? custoM2Prov * areaAlvo : null
  const P = p != null ? p * areaAlvo : null
  const faixa = O != null && M != null && P != null ? pert(O, M, P) : { esperado: M, desvio: 0 }
  return { custoM2Prov, O, M, P, esperado: faixa.esperado, desvio: faixa.desvio }
}

// Estimativa paramétrica de PRAZO a partir de itens { valor: diasM2, peso } e a área-alvo.
export function estimarPrazo(itens, areaAlvo) {
  const dm2 = mediaPonderada(itens.map((i) => ({ valor: i.valor, peso: i.peso })))
  const xs = itens.map((i) => i.valor).filter((v) => v != null)
  const o = percentil(xs, 0.1)
  const p = percentil(xs, 0.9)
  const O = o != null ? o * areaAlvo : null
  const M = dm2 != null ? dm2 * areaAlvo : null
  const P = p != null ? p * areaAlvo : null
  const faixa = O != null && M != null && P != null ? pert(O, M, P) : { esperado: M, desvio: 0 }
  return { diasM2: dm2, O, M, P, esperado: faixa.esperado, desvio: faixa.desvio }
}

// Estimativa de PRAZO a partir de prazos absolutos (dias) — sem multiplicar por área.
// Útil no bottom-up, que pode não ter área. M = média; O/P = percentis; esperado = PERT.
export function estimarPrazoDireto(valores) {
  const xs = valores.filter((v) => v != null)
  if (!xs.length) return { O: null, M: null, P: null, esperado: null, desvio: 0 }
  const M = xs.reduce((a, b) => a + b, 0) / xs.length
  const O = percentil(xs, 0.1)
  const P = percentil(xs, 0.9)
  const faixa = O != null && P != null ? pert(O, M, P) : { esperado: M, desvio: 0 }
  return { O, M, P, esperado: faixa.esperado, desvio: faixa.desvio }
}

// Amostras mínimas para o desvio ser MEDIDO em vez de assumido. Abaixo disso o desvio devolvido
// é a constante 0,1 — quem exibe precisa saber a diferença, sob pena de apresentar um default
// como se fosse observação.
export const AD_N_DESVIO = 2

// Estatística de aderência histórica: média e desvio dos fatores realizado/orçado.
// desvioMedido diz se o desvio saiu dos dados ou é o default. Sai daqui, e não de quem chama,
// porque é esta função que decide fabricar o 0,1 — o limiar não pode viver em três lugares.
export function estatisticaAderencia(ratios) {
  const xs = ratios.filter((v) => v != null && isFinite(v))
  if (!xs.length) return { fator: 1, desvio: 0.1, n: 0, desvioMedido: false }
  const fator = xs.reduce((a, b) => a + b, 0) / xs.length
  let desvio = 0.1
  const medido = xs.length >= AD_N_DESVIO
  if (medido) {
    const v = xs.reduce((a, b) => a + (b - fator) ** 2, 0) / (xs.length - 1)
    desvio = Math.sqrt(v)
  }
  return { fator, desvio, n: xs.length, desvioMedido: medido }
}

// Estimativa BOTTOM-UP: custo direto ajustado pela aderência histórica (fator ± desvio).
export function estimarBottomUp(custoDireto, fator = 1, desvio = 0.1) {
  if (custoDireto == null) return { custoDireto: null, O: null, M: null, P: null, esperado: null, desvio: 0 }
  const M = custoDireto * fator
  const O = custoDireto * Math.max(0, fator - desvio)
  const P = custoDireto * (fator + desvio)
  const faixa = pert(O, M, P)
  return { custoDireto, O, M, P, esperado: faixa.esperado, desvio: faixa.desvio }
}

// Nível de confiança (0..100) combinando quantidade, dispersão e similaridade média.
// Só serve à PARAMÉTRICA: n são as obras análogas que *são* a estimativa, e coefVar é a
// dispersão do custo/m² entre elas. Para o bottom-up, ver confiancaBottomUp.
export function nivelConfianca({ n, coefVar, simMedia }) {
  const fatorN = Math.min(1, n / 5)
  const fatorDisp = Math.max(0, 1 - coefVar)
  const fatorSim = Math.max(0, Math.min(1, simMedia))
  const c = 100 * fatorN * (0.5 + 0.5 * fatorDisp) * (0.5 + 0.5 * fatorSim)
  return Math.round(Math.max(0, Math.min(100, c)))
}

// ---- RF-F04: nível de confiança do BOTTOM-UP ----------------------------------
// Constantes de calibração, explícitas e revisáveis pela engenharia (RNF-15).
export const BU_BASE = 30        // bottom-up sem calibração histórica nenhuma
export const BU_TETO = 90        // teto: a confiança mede a calibração, nunca as quantidades
export const BU_DEGENERADO = 10  // aderência sem sentido (o custo otimista bate em zero)
export const BU_N_PLENO = 5      // obras encerradas para evidência plena
export const BU_N_DISP = 3       // mínimo para falar em "dispersão" (ver abaixo)
export const BU_DISP_NULA = 0.5  // dispersão relativa que zera o valor da aderência
export const BU_REPR_MISTA = 0.6 // amostra de aderência misturando tipos de obra

// O bottom-up NÃO é analogia: as quantidades são as do próprio projeto, e o histórico entra
// só como aderência (doc 05 §3.3) — quanto o realizado costuma divergir do orçado. Por isso
// não reusa nivelConfianca: lá 'n' são as obras que sustentam a estimativa (n=0 ⇒ o endpoint
// devolve 400, não existe estimativa); aqui n=0 é o estado normal do acervo novo e significa
// apenas "não calibrado" — uma estimativa real, montada item a item, sem histórico que a corrija.
// Daí a forma base + ganho, em vez de produto que zera.
//
// tipoFiltrado: se a aderência veio filtrada pelo tipo de obra do alvo. Quando o alvo não tem
// tipo, aderenciaHistorica agrega TODOS os tipos — galpão e edifício no mesmo balde. É o
// análogo honesto da "similaridade" do §6: o quanto a amostra representa o alvo.
export function confiancaBottomUp({ n, fator, desvio, tipoFiltrado = false }) {
  const N = Number(n)
  const F = Number(fator)
  const D = Number(desvio)
  if (!Number.isFinite(N) || !Number.isFinite(F) || !Number.isFinite(D)) return BU_BASE

  // Acervo vazio: estatisticaAderencia devolve fator=1/desvio=0,1 por DEFAULT. São constantes,
  // não medições — não sustentam confiança nenhuma, mas também não condenam a estimativa.
  if (N <= 0) return BU_BASE

  // Degenerado: estimarBottomUp faz O = custoDireto * Math.max(0, fator - desvio). Com
  // desvio >= fator o otimista é R$ 0 — a faixa não é larga, é sem sentido. Vale também para
  // n=1, onde o desvio é o default 0,1 e um fator medido abaixo disso cai aqui.
  if (!(F > 0) || D >= F) return BU_DEGENERADO

  const fatorN = Math.min(1, N / BU_N_PLENO)

  // Dispersão só conta a partir de 3 obras. Com n=1 estatisticaAderencia devolve o default
  // 0,1 (constante disfarçada de medição); com n=2 o desvio amostral é |r1-r2|/√2 — a distância
  // entre dois pontos, não uma distribuição. Creditar qualquer um dos dois converteria ruído
  // em confiança, que é o caminho de inflação mais perigoso deste módulo.
  //
  // BU_N_DISP (3) é maior que AD_N_DESVIO (2) de propósito: são perguntas diferentes. "O desvio
  // é medido ou assumido?" é n>=2 — e quem EXIBE o número precisa dessa resposta. "A dispersão
  // é confiável a ponto de elevar a confiança?" é n>=3. Um desvio pode ser medido e ainda assim
  // não sustentar confiança nenhuma.
  let fatorDisp = 0
  if (N >= BU_N_DISP) {
    const dispRel = Math.min(1, Math.max(0, D / F))
    fatorDisp = Math.max(0, 1 - dispRel / BU_DISP_NULA)
  }

  const fatorRepr = tipoFiltrado ? 1 : BU_REPR_MISTA
  const c = BU_BASE + (BU_TETO - BU_BASE) * fatorN * fatorDisp * fatorRepr
  return Math.round(Math.min(BU_TETO, c))
}

export function rotuloConfianca(pct) {
  return pct >= 70 ? 'Alta' : pct >= 40 ? 'Média' : 'Baixa'
}
