// Normalização: atualização monetária por índice e custo/m².
// Funções puras (sem banco) para serem testáveis.

// Extrai a chave 'YYYY-MM' de uma data ('YYYY-MM-DD', 'YYYY-MM' ou Date).
// Tipos inesperados (array/objeto vindos da query) → null, sem lançar.
export function chaveMes(d) {
  if (!d) return null
  const s = typeof d === 'string' ? d : (d instanceof Date ? d.toISOString() : null)
  if (!s) return null
  const m = s.match(/(\d{4})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}` : null
}

// Fator de atualização entre duas datas, dado uma série de índices { 'YYYY-MM': valor }.
// Retorna null se faltar índice em alguma das pontas (o chamador decide o fallback).
export function fatorAtualizacao(serie, origem, alvo) {
  const ko = chaveMes(origem)
  const ka = chaveMes(alvo)
  if (!ko || !ka) return null
  const vo = serie[ko]
  const va = serie[ka]
  if (!vo || !va) return null
  return va / vo
}

export function atualizarValor(valor, fator) {
  if (valor == null || fator == null) return valor
  return valor * fator
}

export function custoM2(custoTotal, area) {
  return area > 0 && custoTotal != null ? custoTotal / area : null
}

// Ajusta um valor da região de origem para a região alvo via fator_regional.
export function ajusteRegional(valor, fatorOrigem, fatorAlvo) {
  if (valor == null) return null
  const fo = Number(fatorOrigem) || 1
  const fa = Number(fatorAlvo) || 1
  return valor * (fa / fo)
}
