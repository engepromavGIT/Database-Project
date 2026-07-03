import React, { useEffect, useState } from 'react'
import { api } from '../data/api.js'
import { brl, monthToDate } from '../data/format.js'
import { ObraDetalhe } from './ObraDetalhe.jsx'

// Formulário de cadastro de obra (alimenta o acervo e, com custo/datas, o estimador).
function NovaObra({ tipos, padroes, localidades, onCreated }) {
  const vazio = {
    codigo: '', nome: '', tipoObraId: '', padraoId: '', localidadeId: '',
    areaConstruidaM2: '', custoRealTotal: '', dtInicioReal: '', dtFimReal: '',
    dataBaseCusto: '', elegivelReferencia: true,
  }
  const [form, setForm] = useState(vazio)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      await onCreated({
        codigo: form.codigo.trim(),
        nome: form.nome.trim(),
        tipoObraId: form.tipoObraId || null,
        padraoId: form.padraoId || null,
        localidadeId: form.localidadeId || null,
        areaConstruidaM2: form.areaConstruidaM2 ? Number(form.areaConstruidaM2) : null,
        custoRealTotal: form.custoRealTotal ? Number(form.custoRealTotal) : null,
        dtInicioReal: form.dtInicioReal || null,
        dtFimReal: form.dtFimReal || null,
        dataBaseCusto: monthToDate(form.dataBaseCusto),
        elegivelReferencia: form.elegivelReferencia,
        status: 'concluida',
      })
      setForm(vazio)
    } catch (err) {
      setError(err.message)
    } finally { setBusy(false) }
  }

  return (
    <form className="card" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 'var(--sp-3)' }} onSubmit={submit}>
      <div className="eyebrow">Nova obra</div>
      <div className="field"><label>Código *</label>
        <input className="control" value={form.codigo} onChange={set('codigo')} placeholder="OBR-2024-018" /></div>
      <div className="field"><label>Nome *</label>
        <input className="control" value={form.nome} onChange={set('nome')} placeholder="Galpão logístico" /></div>
      <div className="field"><label>Tipo de obra</label>
        <select className="control" value={form.tipoObraId} onChange={set('tipoObraId')}>
          <option value="">—</option>
          {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select></div>
      <div className="field"><label>Padrão</label>
        <select className="control" value={form.padraoId} onChange={set('padraoId')}>
          <option value="">—</option>
          {padroes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select></div>
      <div className="field"><label>Localidade</label>
        <select className="control" value={form.localidadeId} onChange={set('localidadeId')}>
          <option value="">—</option>
          {localidades.map((l) => <option key={l.id} value={l.id}>{l.municipio}/{l.uf}</option>)}
        </select></div>
      <div className="field"><label>Área construída (m²)</label>
        <input className="control" type="number" min="0" step="0.01" value={form.areaConstruidaM2} onChange={set('areaConstruidaM2')} /></div>
      <div className="field"><label>Custo real total (R$)</label>
        <input className="control" type="number" min="0" step="0.01" value={form.custoRealTotal} onChange={set('custoRealTotal')} /></div>
      <div className="field"><label>Data-base do custo</label>
        <input className="control" type="month" value={form.dataBaseCusto} onChange={set('dataBaseCusto')} /></div>
      <div className="field-row" style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <div className="field" style={{ flex: 1 }}><label>Início real</label>
          <input className="control" type="date" value={form.dtInicioReal} onChange={set('dtInicioReal')} /></div>
        <div className="field" style={{ flex: 1 }}><label>Fim real</label>
          <input className="control" type="date" value={form.dtFimReal} onChange={set('dtFimReal')} /></div>
      </div>
      <label style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
        <input type="checkbox" checked={form.elegivelReferencia} onChange={set('elegivelReferencia')} />
        Elegível como referência
      </label>
      {error && <div className="login-error">{error}</div>}
      <button className="btn btn-primary" disabled={busy || !form.codigo || !form.nome}>
        {busy ? 'Salvando…' : 'Adicionar obra'}
      </button>
    </form>
  )
}

export function Acervo() {
  const [tipos, setTipos] = useState([])
  const [padroes, setPadroes] = useState([])
  const [localidades, setLocalidades] = useState([])
  const [obras, setObras] = useState([])
  const [ind, setInd] = useState([])
  const [sel, setSel] = useState(null) // obra em detalhe
  const [erro, setErro] = useState(null)

  const carregar = async () => {
    try {
      const [t, p, l, o, i] = await Promise.all([
        api.tiposObra(), api.padroes(), api.localidades(), api.obras(), api.indicadores(),
      ])
      setTipos(t); setPadroes(p); setLocalidades(l); setObras(o); setInd(i)
    } catch (e) { setErro(e.message) }
  }
  useEffect(() => { carregar() }, [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 'var(--sp-4)', alignItems: 'start' }}>
      <NovaObra tipos={tipos} padroes={padroes} localidades={localidades}
        onCreated={async (d) => { await api.createObra(d); await carregar() }} />

      <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        {erro && <div className="login-error">{erro}</div>}

        <section className="card" style={{ padding: 'var(--sp-4)' }}>
          <div className="eyebrow">Obras no acervo ({obras.length})</div>
          {obras.length === 0 ? (
            <p className="empty">Nenhuma obra ainda. Cadastre a primeira ao lado.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
                <th>Código</th><th>Nome</th><th>Tipo</th><th>Área</th><th>Custo</th><th>Ref.</th><th></th>
              </tr></thead>
              <tbody>
                {obras.map((o) => (
                  <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td>{o.codigo}</td><td>{o.nome}</td><td>{o.tipoObra || '—'}</td>
                    <td>{o.areaConstruidaM2 ? `${o.areaConstruidaM2} m²` : '—'}</td>
                    <td>{brl(o.custoRealTotal || o.custoOrcadoTotal)}</td>
                    <td>{o.elegivelReferencia ? '✓' : '—'}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setSel(o)}>Detalhar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {sel && <ObraDetalhe obra={sel} onClose={() => setSel(null)} onChanged={carregar} />}

        <section className="card" style={{ padding: 'var(--sp-4)' }}>
          <div className="eyebrow">Indicadores (custo/m² e prazos)</div>
          {ind.length === 0 ? (
            <p className="empty">Sem indicadores: cadastre custo real, área e datas nas obras.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
                <th>Obra</th><th>Custo/m²</th><th>Prazo real (dias)</th>
              </tr></thead>
              <tbody>
                {ind.map((o) => (
                  <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td>{o.codigo} — {o.nome}</td>
                    <td>{o.custoM2Real ? brl(o.custoM2Real) : '—'}</td>
                    <td>{o.prazoRealDias ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}
