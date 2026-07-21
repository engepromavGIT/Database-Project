// Formatação pt-BR compartilhada entre as telas.
export const brl = (v) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export const num = (v, d = 0) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)

export const pct = (v) => (v == null ? '—' : `${num(v, 0)}%`)

// Desvio a partir do FATOR realizado÷planejado (1,20 → "+20,0%"; 0,90 → "−10,0%"; null → "—").
// Positivo = estouro (custou mais / demorou mais que o previsto). RF-D03.
export const desvioPct = (fator) => {
  if (fator == null) return '—'
  const n = Number(fator)
  if (!Number.isFinite(n)) return '—'
  // Arredonda ANTES de decidir o sinal: 0,9999 renderizava "−0,0%" e 1,0001, "+0,0%".
  const d = Math.round((n - 1) * 1000) / 10
  return `${d > 0 ? '+' : d < 0 ? '−' : ''}${num(Math.abs(d), 1)}%`
}

// Prazo em dias (valor único). null → '—'. RF-F05.
export const prazoDias = (v) => (v == null ? '—' : `${num(v)} dias`)

// Faixa de prazo otimista–pessimista. RF-F05.
// O === P (uma única referência, ou histórico sem dispersão) NÃO vira "120 — 120 dias": isso
// simula uma faixa que não existe. Number() nos dois lados porque o pg devolve numeric como
// string — comparar '120' === 120 daria falso e imprimiria a faixa degenerada.
export const faixaPrazo = (o, p) => {
  if (o == null || p == null) return '—'
  if (Number(o) === Number(p)) return `${num(o)} dias (sem dispersão)`
  return `${num(o)} — ${num(p)} dias`
}

// Faixa de custo otimista–pessimista. Espelha faixaPrazo (contrato idêntico), com brl:
// null de um dos lados → '—'; O === P (uma única referência, ou histórico sem dispersão) NÃO
// vira "R$ x — R$ x" (faixa falsa) → "R$ x (sem dispersão)". Number() nos dois lados porque o
// pg devolve numeric como STRING — '100' === 100 é falso e imprimiria a faixa degenerada.
// Onde o provável (esperado) é null mas O/P sobrevivem (todas as análogas com escore 0), esta
// faixa carrega o intervalo legítimo que a linha "Custo provável" mostraria como '—'.
export const faixaCusto = (o, p) => {
  if (o == null || p == null) return '—'
  if (Number(o) === Number(p)) return `${brl(o)} (sem dispersão)`
  return `${brl(o)} — ${brl(p)}`
}

// Aderência histórica do bottom-up (RF-F04), a partir do payload { fator, desvio, n, desvioMedido,
// tipoFiltrado }. estatisticaAderencia fabrica um desvio de 0,1 quando não tem como medi-lo, e o
// fator e o desvio NÃO nascem juntos: com 1 obra o fator já é medido, mas o desvio ainda é a mesma
// constante do acervo vazio. Imprimir "×1.15 (±0.1) · 1 obra" afirmaria que aquela obra sustenta
// os ±10% — o default se passando por observação. Daí seguir desvioMedido (que vem do servidor,
// de quem decide fabricar o default) em vez de n > 0.
export const aderenciaTexto = (ad) => {
  if (!ad || !(ad.n > 0)) return 'sem base histórica (fator 1,00 assumido)'
  const escopo = ad.tipoFiltrado ? '' : ', todos os tipos'
  const disp = ad.desvioMedido ? `(±${ad.desvio})` : '(±0,1 assumido — desvio não medido)'
  return `×${ad.fator} ${disp} · ${ad.n} obra${ad.n > 1 ? 's' : ''}${escopo}`
}

// 'YYYY-MM' (input type=month) -> 'YYYY-MM-01' (date válida); repassa datas completas.
export const monthToDate = (m) => (m ? (m.length === 7 ? `${m}-01` : m) : null)
