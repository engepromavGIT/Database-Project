import React, { useEffect, useState } from 'react'
import { api } from '../data/api.js'
import { brl, num } from '../data/format.js'

const desvioPct = (f) => (f == null ? '—' : `${f > 1 ? '+' : ''}${num((f - 1) * 100, 1)}%`)

function Card({ rotulo, valor, sub }) {
  return (
    <div className="card" style={{ padding: 'var(--sp-3)', minWidth: 150 }}>
      <div style={{ color: 'var(--fg-3)', fontSize: 12 }}>{rotulo}</div>
      <strong style={{ fontSize: 22 }}>{valor}</strong>
      {sub && <div style={{ color: 'var(--fg-3)', fontSize: 12 }}>{sub}</div>}
    </div>
  )
}

export function Dashboard() {
  const [d, setD] = useState(null)
  const [erro, setErro] = useState(null)
  useEffect(() => { api.dashboard().then(setD).catch((e) => setErro(e.message)) }, [])

  if (erro) return <div className="login-error">{erro}</div>
  if (!d) return <p className="empty">Carregando painel…</p>

  const maxCusto = Math.max(1, ...d.porTipo.map((t) => Number(t.custoM2Medio) || 0))

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <Card rotulo="Obras no acervo" valor={d.obras.total} sub={`${d.obras.elegiveis} elegíveis`} />
        <Card rotulo="Custo/m² médio" valor={brl(d.geral.custoM2Medio)} />
        <Card rotulo="Desvio de custo médio" valor={desvioPct(d.geral.desvioCustoMedio)} sub="realizado ÷ orçado" />
        <Card rotulo="Prazo médio" valor={d.geral.prazoMedioDias != null ? `${num(d.geral.prazoMedioDias)} dias` : '—'} />
        <Card rotulo="Estimativas" valor={d.estimativas.total} sub={`${d.estimativas.calibradas} calibradas`} />
        <Card rotulo="Erro médio (calibração)" valor={d.estimativas.erroMedioAbs != null ? `${d.estimativas.erroMedioAbs}%` : '—'} />
      </div>

      <section className="card" style={{ padding: 'var(--sp-4)' }}>
        <div className="eyebrow">Custo/m² médio por tipo de obra</div>
        {d.porTipo.length === 0 ? (
          <p className="empty">Sem obras classificadas por tipo ainda.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
              <th>Tipo</th><th>Obras</th><th style={{ width: '45%' }}>Custo/m² médio</th><th>Desvio custo</th>
            </tr></thead>
            <tbody>
              {d.porTipo.map((t) => (
                <tr key={t.tipo} style={{ borderTop: '1px solid var(--border)' }}>
                  <td>{t.tipo}</td>
                  <td>{t.n}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ height: 10, borderRadius: 'var(--r-sm)', background: 'var(--brand)', width: `${Math.round((Number(t.custoM2Medio) || 0) / maxCusto * 100)}%`, minWidth: 2 }} />
                      <span>{brl(t.custoM2Medio)}</span>
                    </div>
                  </td>
                  <td>{desvioPct(t.desvioCustoMedio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
