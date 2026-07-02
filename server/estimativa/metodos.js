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

// Estatística de aderência histórica: média e desvio dos fatores realizado/orçado.
export function estatisticaAderencia(ratios) {
  const xs = ratios.filter((v) => v != null && isFinite(v))
  if (!xs.length) return { fator: 1, desvio: 0.1, n: 0 }
  const fator = xs.reduce((a, b) => a + b, 0) / xs.length
  let desvio = 0.1
  if (xs.length >= 2) {
    const v = xs.reduce((a, b) => a + (b - fator) ** 2, 0) / (xs.length - 1)
    desvio = Math.sqrt(v)
  }
  return { fator, desvio, n: xs.length }
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
export function nivelConfianca({ n, coefVar, simMedia }) {
  const fatorN = Math.min(1, n / 5)
  const fatorDisp = Math.max(0, 1 - coefVar)
  const fatorSim = Math.max(0, Math.min(1, simMedia))
  const c = 100 * fatorN * (0.5 + 0.5 * fatorDisp) * (0.5 + 0.5 * fatorSim)
  return Math.round(Math.max(0, Math.min(100, c)))
}

export function rotuloConfianca(pct) {
  return pct >= 70 ? 'Alta' : pct >= 40 ? 'Média' : 'Baixa'
}
