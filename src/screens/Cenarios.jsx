import React, { useEffect, useState } from 'react'
import { api } from '../data/api.js'
import { brl, pct, prazoDias, faixaPrazo, faixaCusto } from '../data/format.js'

async function abrirPdf(id) {
  const blob = await api.estimativaPdf(id)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export function Cenarios() {
  const [grupos, setGrupos] = useState([])
  const [sel, setSel] = useState(null)
  const [versoes, setVersoes] = useState([])
  const [erro, setErro] = useState(null)

  useEffect(() => { api.cenarios().then(setGrupos).catch((e) => setErro(e.message)) }, [])

  const abrir = async (grupo) => {
    setSel(grupo); setErro(null)
    try { setVersoes(await api.cenario(grupo)) } catch (e) { setErro(e.message) }
  }

  const linhas = [
    ['Método', (v) => v.metodo],
    ['Custo provável', (v) => brl(v.custoProvavel)],
    ['Faixa de custo (O–P)', (v) => faixaCusto(v.custoOtimista, v.custoPessimista)],
    ['Prazo provável', (v) => prazoDias(v.prazoProvavelDias)],
    // RF-F05 — faixa de prazo, simétrica à de custo.
    ['Faixa de prazo (O–P)', (v) => faixaPrazo(v.prazoOtimistaDias, v.prazoPessimistaDias)],
    ['Confiança', (v) => pct(v.nivelConfianca)],
    ['Criada em', (v) => v.criadoEm],
    ['Erro (realizado)', (v) => (v.erroPct != null ? `${v.erroPct > 0 ? '+' : ''}${v.erroPct}%` : '—')],
    ['PDF', (v) => <button className="btn btn-ghost btn-sm" onClick={() => abrirPdf(v.id)}>Abrir</button>],
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 'var(--sp-4)', alignItems: 'start' }}>
      <section className="card" style={{ padding: 'var(--sp-4)' }}>
        <div className="eyebrow">Cenários ({grupos.length})</div>
        {erro && <div className="login-error">{erro}</div>}
        {grupos.length === 0
          ? <p className="empty">Nenhum cenário ainda. Gere estimativas na aba Estimativa.</p>
          : grupos.map((g) => (
            <button key={g.grupo} className={`btn btn-sm ${sel === g.grupo ? 'btn-primary' : 'btn-ghost'}`}
              style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6 }}
              onClick={() => abrir(g.grupo)}>
              {g.descricao} · {g.versoes} versão(ões) · {brl(g.custoProvavel)}
            </button>
          ))}
      </section>

      <section className="card" style={{ padding: 'var(--sp-4)', overflowX: 'auto' }}>
        <div className="eyebrow">Comparação de versões</div>
        {versoes.length === 0 ? (
          <p className="empty">Selecione um cenário à esquerda.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
                <th>Métrica</th>
                {versoes.map((v) => <th key={v.id}>v{v.versao}</th>)}
              </tr>
            </thead>
            <tbody>
              {linhas.map(([rotulo, fn]) => (
                <tr key={rotulo} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ color: 'var(--fg-3)' }}>{rotulo}</td>
                  {versoes.map((v) => <td key={v.id}>{fn(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
