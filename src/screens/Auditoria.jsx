import React, { useEffect, useState } from 'react'
import { api } from '../data/api.js'

// Trilha de auditoria (RF-B08 / RF-H05). Aba visível só para administradores;
// o endpoint /api/auditoria também é protegido por requireAdmin no servidor.
const ACAO = {
  create: { rotulo: 'Criação', cor: 'var(--brand)' },
  update: { rotulo: 'Edição', cor: 'var(--prio-medium)' },
  delete: { rotulo: 'Exclusão', cor: 'var(--danger)' },
  export: { rotulo: 'Exportação', cor: 'var(--fg-3)' },
  estimate: { rotulo: 'Estimativa', cor: 'var(--brand)' },
}
const dataHora = (s) => (s ? s.replace('T', ' ') : '—')

export function Auditoria() {
  const [logs, setLogs] = useState([])
  const [erro, setErro] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    api.auditoria(200)
      .then(setLogs)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [])

  return (
    <section className="card" style={{ padding: 'var(--sp-4)' }}>
      <div className="eyebrow">Trilha de auditoria ({logs.length})</div>
      {erro && <div className="login-error">{erro}</div>}
      {carregando ? (
        <p className="empty">Carregando…</p>
      ) : erro ? null : logs.length === 0 ? (
        <p className="empty">Nenhuma ação registrada ainda.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
            <th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>ID</th>
          </tr></thead>
          <tbody>
            {logs.map((l) => {
              const a = ACAO[l.acao] || { rotulo: l.acao, cor: 'var(--fg-3)' }
              return (
                <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td>{dataHora(l.dataHora)}</td>
                  <td>{l.usuarioNome || l.usuarioId || '—'}</td>
                  <td><span className="chip" style={{ background: a.cor, color: '#fff' }}>{a.rotulo}</span></td>
                  <td>{l.entidade}</td>
                  <td style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{l.entidadeId || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
