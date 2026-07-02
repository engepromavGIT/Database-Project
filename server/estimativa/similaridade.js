// Escore de similaridade entre uma obra-alvo (parâmetros) e uma obra do acervo.
// Resultado em [0, 1]. Pesos configuráveis (RNF-15).

export const DEFAULT_PESOS = {
  tipo: 0.30,
  padrao: 0.20,
  area: 0.25,
  localidade: 0.15,
  recencia: 0.10,
}

// Proximidade de área: 1 quando iguais; cai conforme a diferença relativa.
export function proximidadeArea(aAlvo, aObra) {
  if (!(aAlvo > 0) || !(aObra > 0)) return 0
  const diff = Math.abs(aAlvo - aObra) / aAlvo
  return Math.max(0, 1 - Math.min(1, diff))
}

// alvo: { tipoObraId, padraoId, padraoOrdem, areaAlvoM2, localidadeId, uf }
// obra: { tipoObraId, padraoId, padraoOrdem, areaConstruidaM2, localidadeId, uf, recencia }
export function escoreSimilaridade(alvo, obra, pesos = DEFAULT_PESOS) {
  // Tipo de obra: igualdade.
  const sTipo = alvo.tipoObraId && obra.tipoObraId
    ? (alvo.tipoObraId === obra.tipoObraId ? 1 : 0)
    : 0

  // Padrão: por ordem (popular<normal<alto) se disponível; senão por igualdade.
  let sPad = 0
  if (alvo.padraoOrdem != null && obra.padraoOrdem != null) {
    sPad = Math.max(0, 1 - Math.abs(alvo.padraoOrdem - obra.padraoOrdem) / 2)
  } else if (alvo.padraoId && obra.padraoId) {
    sPad = alvo.padraoId === obra.padraoId ? 1 : 0
  }

  // Área: proximidade relativa.
  const sArea = proximidadeArea(alvo.areaAlvoM2, obra.areaConstruidaM2)

  // Localidade: mesma localidade = 1; mesma UF = 0,5.
  let sLoc = 0
  if (alvo.localidadeId && obra.localidadeId && alvo.localidadeId === obra.localidadeId) sLoc = 1
  else if (alvo.uf && obra.uf && alvo.uf === obra.uf) sLoc = 0.5

  // Recência: 0..1 (calculada pelo chamador a partir da data-base).
  const sRec = obra.recencia != null ? Math.max(0, Math.min(1, obra.recencia)) : 0.5

  const p = pesos
  const num = sTipo * p.tipo + sPad * p.padrao + sArea * p.area + sLoc * p.localidade + sRec * p.recencia
  const den = p.tipo + p.padrao + p.area + p.localidade + p.recencia
  return den > 0 ? num / den : 0
}
