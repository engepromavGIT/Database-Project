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

// 'YYYY-MM' (input type=month) -> 'YYYY-MM-01' (date válida); repassa datas completas.
export const monthToDate = (m) => (m ? (m.length === 7 ? `${m}-01` : m) : null)
