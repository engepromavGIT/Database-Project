import React, { useEffect, useRef, useState } from 'react'
import { api } from '../data/api.js'
import { brl, num } from '../data/format.js'

const desvioPct = (f) => (f == null ? '—' : `${f > 1 ? '+' : ''}${num((f - 1) * 100, 1)}%`)

const FILTRO_VAZIO = {
  tipoObraId: '', padraoId: '', localidadeId: '', clienteId: '',
  status: '', elegivel: '', areaMin: '', areaMax: '', dataBaseIni: '', dataBaseFim: '',
}
const STATUS = [
  ['planejada', 'Planejada'], ['em_andamento', 'Em andamento'],
  ['concluida', 'Concluída'], ['cancelada', 'Cancelada'],
]

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
  const [tipos, setTipos] = useState([])
  const [padroes, setPadroes] = useState([])
  const [localidades, setLocalidades] = useState([])
  const [clientes, setClientes] = useState([])
  const [filtros, setFiltros] = useState(FILTRO_VAZIO)
  const [erro, setErro] = useState(null)
  const reqSeq = useRef(0) // "última resposta vence": ignora respostas fora de ordem
  const setF = (k) => (e) => setFiltros((f) => ({ ...f, [k]: e.target.value }))

  // Cadastros de referência para os selects (uma vez).
  useEffect(() => {
    Promise.all([api.tiposObra(), api.padroes(), api.localidades(), api.clientes()])
      .then(([t, p, l, c]) => { setTipos(t); setPadroes(p); setLocalidades(l); setClientes(c) })
      .catch((e) => setErro(e.message))
  }, [])
  // Recarrega o painel (debounced) quando um filtro muda; roda também na montagem.
  useEffect(() => {
    const h = setTimeout(async () => {
      const seq = ++reqSeq.current
      try { const r = await api.dashboard(filtros); if (seq === reqSeq.current) { setD(r); setErro(null) } }
      catch (e) { if (seq === reqSeq.current) setErro(e.message) }
    }, 250)
    return () => clearTimeout(h)
  }, [filtros])

  const temFiltro = Object.values(filtros).some((v) => v !== '')

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      {/* Filtros do painel (RF-G01) */}
      <section className="card" style={{ padding: 'var(--sp-3)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <select className="control" style={{ flex: '1 1 120px' }} value={filtros.tipoObraId} onChange={setF('tipoObraId')}>
            <option value="">tipo — todos</option>{tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <select className="control" style={{ flex: '1 1 110px' }} value={filtros.padraoId} onChange={setF('padraoId')}>
            <option value="">padrão — todos</option>{padroes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <select className="control" style={{ flex: '1 1 130px' }} value={filtros.localidadeId} onChange={setF('localidadeId')}>
            <option value="">localidade — todas</option>{localidades.map((l) => <option key={l.id} value={l.id}>{l.municipio}/{l.uf}</option>)}
          </select>
          <select className="control" style={{ flex: '1 1 120px' }} value={filtros.clienteId} onChange={setF('clienteId')}>
            <option value="">cliente — todos</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select className="control" style={{ flex: '1 1 110px' }} value={filtros.status} onChange={setF('status')}>
            <option value="">status — todos</option>{STATUS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
          <select className="control" style={{ flex: '1 1 110px' }} value={filtros.elegivel} onChange={setF('elegivel')}>
            <option value="">ref. — todas</option><option value="true">elegível</option><option value="false">não elegível</option>
          </select>
          <input className="control" style={{ width: 84 }} type="number" placeholder="área mín" value={filtros.areaMin} onChange={setF('areaMin')} />
          <input className="control" style={{ width: 84 }} type="number" placeholder="área máx" value={filtros.areaMax} onChange={setF('areaMax')} />
          <label style={{ fontSize: 12, color: 'var(--fg-3)', display: 'flex', gap: 4, alignItems: 'center' }}>data-base
            <input className="control" style={{ width: 130 }} type="month" value={filtros.dataBaseIni} onChange={setF('dataBaseIni')} />
            <span>até</span>
            <input className="control" style={{ width: 130 }} type="month" value={filtros.dataBaseFim} onChange={setF('dataBaseFim')} />
          </label>
          {temFiltro && <button className="btn btn-ghost btn-sm" onClick={() => setFiltros(FILTRO_VAZIO)}>Limpar</button>}
        </div>
      </section>

      {erro && <div className="login-error">{erro}</div>}
      {!d ? (
        <p className="empty">Carregando painel…</p>
      ) : (
        <>
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
              <p className="empty">{temFiltro ? 'Nenhuma obra com esses filtros.' : 'Sem obras classificadas por tipo ainda.'}</p>
            ) : (() => {
              const maxCusto = Math.max(1, ...d.porTipo.map((t) => Number(t.custoM2Medio) || 0))
              return (
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
              )
            })()}
          </section>
        </>
      )}
    </div>
  )
}
