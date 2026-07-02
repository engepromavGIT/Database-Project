// Formatação pt-BR compartilhada entre as telas.
export const brl = (v) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export const num = (v, d = 0) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)

export const pct = (v) => (v == null ? '—' : `${num(v, 0)}%`)

// 'YYYY-MM' (input type=month) -> 'YYYY-MM-01' (date válida); repassa datas completas.
export const monthToDate = (m) => (m ? (m.length === 7 ? `${m}-01` : m) : null)
