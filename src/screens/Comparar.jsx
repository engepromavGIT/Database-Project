import React, { useEffect, useState } from 'react'
import { api } from '../data/api.js'
import { brl, num } from '../data/format.js'
import { baixarCSV } from '../data/exportar.js'

const desvioPct = (fator) => (fator == null ? '—' : `${fator > 1 ? '+' : ''}${num((fator - 1) * 100, 1)}%`)

export function Comparar() {
  const [obras, setObras] = useState([])
  const [sel, setSel] = useState(new Set())
  const [cols, setCols] = useState([])
  const [erro, setErro] = useState(null)

  useEffect(() => { api.obras().then(setObras).catch((e) => setErro(e.message)) }, [])

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const comparar = async () => {
    setErro(null)
    try { setCols(await api.comparar([...sel])) } catch (e) { setErro(e.message) }
  }

  // Exporta o comparativo: uma linha por métrica, uma coluna por obra.
  const exportarCSV = () => baixarCSV(
    'comparativo.csv',
    [{ rotulo: 'Métrica', valor: (l) => l.rotulo }, ...cols.map((o) => ({ rotulo: o.codigo, valor: (l) => l.fn(o) }))],
    linhas.map(([rotulo, fn]) => ({ rotulo, fn })),
  )

  const linhas = [
    ['Tipo', (o) => o.tipoObra || '—'],
    ['Padrão', (o) => o.padrao || '—'],
    ['Área (m²)', (o) => (o.areaConstruidaM2 != null ? num(o.areaConstruidaM2, 2) : '—')],
    ['Custo orçado', (o) => brl(o.custoOrcadoTotal)],
    // Obras importadas de orçamento têm realizado "0.00" (DEFAULT, não NULL) — mostra "—".
    ['Custo real', (o) => (Number(o.custoRealTotal) > 0 ? brl(o.custoRealTotal) : '—')],
    ['Custo/m²', (o) => brl(o.custoM2Real)],
    ['Desvio de custo', (o) => desvioPct(o.fatorDesvioCusto)],
    ['Prazo real (dias)', (o) => (o.prazoRealDias ?? '—')],
    ['Prazo planejado (dias)', (o) => (o.prazoPlanDias ?? '—')],
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--sp-4)', alignItems: 'start' }}>
      <section className="card" style={{ padding: 'var(--sp-4)' }}>
        <div className="eyebrow">Selecione as obras ({sel.size})</div>
        {obras.length === 0
          ? <p className="empty">Nenhuma obra no acervo.</p>
          : obras.map((o) => (
            <label key={o.id} style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', padding: '4px 0' }}>
              <input type="checkbox" checked={sel.has(o.id)} onChange={() => toggle(o.id)} />
              <span style={{ fontSize: 14 }}>{o.codigo} — {o.nome}</span>
            </label>
          ))}
        <button className="btn btn-primary" style={{ marginTop: 'var(--sp-3)' }} disabled={sel.size < 1} onClick={comparar}>
          Comparar
        </button>
        {erro && <div className="login-error" style={{ marginTop: 'var(--sp-2)' }}>{erro}</div>}
      </section>

      <section className="card" style={{ padding: 'var(--sp-4)', overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="eyebrow">Comparativo</div>
          {cols.length > 0 && <button className="btn btn-ghost btn-sm" onClick={exportarCSV}>Exportar CSV</button>}
        </div>
        {cols.length === 0 ? (
          <p className="empty">Selecione obras à esquerda e clique em Comparar.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
                <th>Métrica</th>
                {cols.map((o) => <th key={o.id}>{o.codigo}</th>)}
              </tr>
            </thead>
            <tbody>
              {linhas.map(([rotulo, fn]) => (
                <tr key={rotulo} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ color: 'var(--fg-3)' }}>{rotulo}</td>
                  {cols.map((o) => <td key={o.id}>{fn(o)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
