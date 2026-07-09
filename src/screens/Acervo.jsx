import React, { useEffect, useRef, useState } from 'react'
import { api } from '../data/api.js'
import { brl, num, monthToDate } from '../data/format.js'
import { baixarCSV } from '../data/exportar.js'
import { ObraDetalhe } from './ObraDetalhe.jsx'

const FILTRO_VAZIO = {
  busca: '', tipoObraId: '', padraoId: '', localidadeId: '', clienteId: '',
  status: '', elegivel: '', areaMin: '', areaMax: '', ordenar: 'recente',
}

const STATUS = [
  ['planejada', 'Planejada'], ['em_andamento', 'Em andamento'],
  ['concluida', 'Concluída'], ['cancelada', 'Cancelada'],
]

const vazio = {
  codigo: '', nome: '', clienteId: '', tipoObraId: '', padraoId: '', localidadeId: '',
  areaConstruidaM2: '', areaTerrenoM2: '', numPavimentos: '',
  custoRealTotal: '', custoOrcadoTotal: '', dataBaseCusto: '',
  dtInicioPlan: '', dtFimPlan: '', dtInicioReal: '', dtFimReal: '',
  status: 'concluida', elegivelReferencia: true,
}
const deObra = (o) => ({
  codigo: o.codigo || '', nome: o.nome || '', clienteId: o.clienteId || '',
  tipoObraId: o.tipoObraId || '', padraoId: o.padraoId || '', localidadeId: o.localidadeId || '',
  areaConstruidaM2: o.areaConstruidaM2 ?? '', areaTerrenoM2: o.areaTerrenoM2 ?? '',
  numPavimentos: o.numPavimentos ?? '', custoRealTotal: o.custoRealTotal ?? '', custoOrcadoTotal: o.custoOrcadoTotal ?? '',
  dataBaseCusto: o.dataBaseCusto || '', dtInicioPlan: o.dtInicioPlan || '', dtFimPlan: o.dtFimPlan || '',
  dtInicioReal: o.dtInicioReal || '', dtFimReal: o.dtFimReal || '',
  status: o.status || 'concluida', elegivelReferencia: !!o.elegivelReferencia,
})

// Formulário de obra: cria (inicial=null) ou edita (inicial=obra). Na edição, os totais
// de custo não aparecem — são derivados (obras detalhadas) ou definidos no cadastro.
function ObraForm({ tipos, padroes, localidades, clientes, inicial, onSalvar, onCancelar }) {
  const ehEdicao = !!inicial
  const [form, setForm] = useState(inicial ? deObra(inicial) : vazio)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => { setForm(inicial ? deObra(inicial) : vazio); setError(null) }, [inicial])
  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      const p = {
        codigo: form.codigo.trim(), nome: form.nome.trim(), clienteId: form.clienteId || null,
        tipoObraId: form.tipoObraId || null, padraoId: form.padraoId || null, localidadeId: form.localidadeId || null,
        areaConstruidaM2: form.areaConstruidaM2 ? Number(form.areaConstruidaM2) : null,
        areaTerrenoM2: form.areaTerrenoM2 ? Number(form.areaTerrenoM2) : null,
        numPavimentos: form.numPavimentos ? Number(form.numPavimentos) : null,
        dataBaseCusto: monthToDate(form.dataBaseCusto),
        dtInicioPlan: form.dtInicioPlan || null, dtFimPlan: form.dtFimPlan || null,
        dtInicioReal: form.dtInicioReal || null, dtFimReal: form.dtFimReal || null,
        status: form.status || 'concluida', elegivelReferencia: form.elegivelReferencia,
      }
      if (!ehEdicao) {
        p.custoRealTotal = form.custoRealTotal ? Number(form.custoRealTotal) : null
        p.custoOrcadoTotal = form.custoOrcadoTotal ? Number(form.custoOrcadoTotal) : null
      }
      await onSalvar(p)
      if (!ehEdicao) setForm(vazio)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <form className="card" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 'var(--sp-3)' }} onSubmit={submit}>
      <div className="eyebrow">{ehEdicao ? `Editar obra — ${inicial.codigo}` : 'Nova obra'}</div>
      <div className="field"><label>Código *</label>
        <input className="control" value={form.codigo} onChange={set('codigo')} placeholder="OBR-2024-018" /></div>
      <div className="field"><label>Nome *</label>
        <input className="control" value={form.nome} onChange={set('nome')} placeholder="Galpão logístico" /></div>
      <div className="field"><label>Cliente</label>
        <select className="control" value={form.clienteId} onChange={set('clienteId')}>
          <option value="">—</option>
          {/* Cliente inativado que ainda está vinculado a esta obra: mantém visível/selecionável. */}
          {ehEdicao && form.clienteId && !clientes.some((c) => c.id === form.clienteId) && (
            <option value={form.clienteId}>{inicial.cliente || 'cliente'} (inativo)</option>
          )}
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select></div>
      <div className="field"><label>Tipo de obra</label>
        <select className="control" value={form.tipoObraId} onChange={set('tipoObraId')}>
          <option value="">—</option>{tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select></div>
      <div className="field"><label>Padrão</label>
        <select className="control" value={form.padraoId} onChange={set('padraoId')}>
          <option value="">—</option>{padroes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select></div>
      <div className="field"><label>Localidade</label>
        <select className="control" value={form.localidadeId} onChange={set('localidadeId')}>
          <option value="">—</option>{localidades.map((l) => <option key={l.id} value={l.id}>{l.municipio}/{l.uf}</option>)}
        </select></div>
      <div className="field-row" style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <div className="field" style={{ flex: 1 }}><label>Área constr. (m²)</label>
          <input className="control" type="number" min="0" step="0.01" value={form.areaConstruidaM2} onChange={set('areaConstruidaM2')} /></div>
        <div className="field" style={{ flex: 1 }}><label>Área terreno (m²)</label>
          <input className="control" type="number" min="0" step="0.01" value={form.areaTerrenoM2} onChange={set('areaTerrenoM2')} /></div>
        <div className="field" style={{ width: 80 }}><label>Pavim.</label>
          <input className="control" type="number" min="0" step="1" value={form.numPavimentos} onChange={set('numPavimentos')} /></div>
      </div>
      {!ehEdicao && (
        <div className="field-row" style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <div className="field" style={{ flex: 1 }}><label>Custo real (R$)</label>
            <input className="control" type="number" min="0" step="0.01" value={form.custoRealTotal} onChange={set('custoRealTotal')} /></div>
          <div className="field" style={{ flex: 1 }}><label>Custo orçado (R$)</label>
            <input className="control" type="number" min="0" step="0.01" value={form.custoOrcadoTotal} onChange={set('custoOrcadoTotal')} /></div>
        </div>
      )}
      <div className="field"><label>Data-base do custo</label>
        <input className="control" type="month" value={form.dataBaseCusto} onChange={set('dataBaseCusto')} /></div>
      <div className="field-row" style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <div className="field" style={{ flex: 1 }}><label>Início plan.</label>
          <input className="control" type="date" value={form.dtInicioPlan} onChange={set('dtInicioPlan')} /></div>
        <div className="field" style={{ flex: 1 }}><label>Fim plan.</label>
          <input className="control" type="date" value={form.dtFimPlan} onChange={set('dtFimPlan')} /></div>
      </div>
      <div className="field-row" style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <div className="field" style={{ flex: 1 }}><label>Início real</label>
          <input className="control" type="date" value={form.dtInicioReal} onChange={set('dtInicioReal')} /></div>
        <div className="field" style={{ flex: 1 }}><label>Fim real</label>
          <input className="control" type="date" value={form.dtFimReal} onChange={set('dtFimReal')} /></div>
      </div>
      <div className="field"><label>Status</label>
        <select className="control" value={form.status} onChange={set('status')}>
          {STATUS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select></div>
      <label style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
        <input type="checkbox" checked={form.elegivelReferencia} onChange={set('elegivelReferencia')} />
        Elegível como referência
      </label>
      {error && <div className="login-error">{error}</div>}
      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !form.codigo || !form.nome}>
          {busy ? 'Salvando…' : ehEdicao ? 'Salvar alterações' : 'Adicionar obra'}
        </button>
        {ehEdicao && <button type="button" className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>}
      </div>
    </form>
  )
}

export function Acervo({ user }) {
  const [tipos, setTipos] = useState([])
  const [padroes, setPadroes] = useState([])
  const [localidades, setLocalidades] = useState([])
  const [clientes, setClientes] = useState([])
  const [obras, setObras] = useState([])
  const [ind, setInd] = useState([])
  const [sel, setSel] = useState(null)          // obra em detalhe
  const [editando, setEditando] = useState(null) // obra em edição
  const [filtros, setFiltros] = useState(FILTRO_VAZIO)
  const [erro, setErro] = useState(null)
  const reqSeq = useRef(0) // "última resposta vence": ignora fetch de obras que chegou fora de ordem
  const setF = (k) => (e) => setFiltros((f) => ({ ...f, [k]: e.target.value }))

  // Cadastros de referência + indicadores (recarregam pouco).
  const carregarAux = async () => {
    try {
      const [t, p, l, cl, i] = await Promise.all([
        api.tiposObra(), api.padroes(), api.localidades(), api.clientes(), api.indicadores(),
      ])
      setTipos(t); setPadroes(p); setLocalidades(l); setClientes(cl); setInd(i)
    } catch (e) { setErro(e.message) }
  }
  const carregarObras = async () => {
    const seq = ++reqSeq.current
    try { const d = await api.obras(filtros); if (seq === reqSeq.current) setObras(d) }
    catch (e) { if (seq === reqSeq.current) setErro(e.message) }
  }
  useEffect(() => { carregarAux() }, [])
  // Recarrega as obras (debounced) sempre que um filtro muda; roda também na montagem.
  useEffect(() => { const id = setTimeout(carregarObras, 250); return () => clearTimeout(id) }, [filtros])
  // Após uma mutação: recarrega obras (respeitando os filtros) + auxiliares.
  const recarregar = async () => { await carregarObras(); await carregarAux() }

  const excluir = async (o) => {
    if (!window.confirm(`Excluir a obra ${o.codigo} e todo o seu detalhamento? Esta ação não pode ser desfeita.`)) return
    setErro(null)
    try {
      await api.deleteObra(o.id)
      if (sel?.id === o.id) setSel(null)
      if (editando?.id === o.id) setEditando(null)
      await recarregar()
    } catch (e) { setErro(e.message) }
  }

  const exportarCSV = () => baixarCSV('obras.csv', [
    { rotulo: 'Código', valor: (o) => o.codigo },
    { rotulo: 'Nome', valor: (o) => o.nome },
    { rotulo: 'Cliente', valor: (o) => o.cliente || '' },
    { rotulo: 'Tipo', valor: (o) => o.tipoObra || '' },
    { rotulo: 'Padrão', valor: (o) => o.padrao || '' },
    // Números formatados em pt-BR (vírgula decimal) p/ o Excel pt-BR tratá-los como número.
    { rotulo: 'Área construída (m²)', valor: (o) => (o.areaConstruidaM2 != null ? num(o.areaConstruidaM2, 2) : '') },
    { rotulo: 'Custo orçado', valor: (o) => (o.custoOrcadoTotal != null ? num(o.custoOrcadoTotal, 2) : '') },
    { rotulo: 'Custo real', valor: (o) => (o.custoRealTotal != null ? num(o.custoRealTotal, 2) : '') },
    { rotulo: 'Status', valor: (o) => o.status || '' },
    { rotulo: 'Elegível referência', valor: (o) => (o.elegivelReferencia ? 'sim' : 'não') },
  ], obras)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 'var(--sp-4)', alignItems: 'start' }}>
      {editando ? (
        <ObraForm tipos={tipos} padroes={padroes} localidades={localidades} clientes={clientes} inicial={editando}
          onSalvar={async (d) => {
            const atualizada = await api.updateObra(editando.id, d)
            setEditando(null)
            setSel((prev) => (prev && prev.id === atualizada.id ? atualizada : prev)) // sincroniza o detalhe aberto
            await recarregar()
          }}
          onCancelar={() => setEditando(null)} />
      ) : (
        <ObraForm tipos={tipos} padroes={padroes} localidades={localidades} clientes={clientes} inicial={null}
          onSalvar={async (d) => { await api.createObra(d); await recarregar() }} />
      )}

      <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        {erro && <div className="login-error">{erro}</div>}

        <section className="card" style={{ padding: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="eyebrow">Obras no acervo ({obras.length})</div>
            <button className="btn btn-ghost btn-sm" onClick={exportarCSV} disabled={obras.length === 0}>Exportar CSV</button>
          </div>

          {/* Busca/filtro de obras (RF-E01) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: 'var(--sp-3) 0' }}>
            <input className="control" style={{ flex: '2 1 160px' }} placeholder="Buscar código ou nome…" value={filtros.busca} onChange={setF('busca')} />
            <select className="control" style={{ flex: '1 1 110px' }} value={filtros.tipoObraId} onChange={setF('tipoObraId')}>
              <option value="">tipo — todos</option>{tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <select className="control" style={{ flex: '1 1 110px' }} value={filtros.padraoId} onChange={setF('padraoId')}>
              <option value="">padrão — todos</option>{padroes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <select className="control" style={{ flex: '1 1 130px' }} value={filtros.localidadeId} onChange={setF('localidadeId')}>
              <option value="">localidade — todas</option>{localidades.map((l) => <option key={l.id} value={l.id}>{l.municipio}/{l.uf}</option>)}
            </select>
            <select className="control" style={{ flex: '1 1 130px' }} value={filtros.clienteId} onChange={setF('clienteId')}>
              <option value="">cliente — todos</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select className="control" style={{ flex: '1 1 110px' }} value={filtros.status} onChange={setF('status')}>
              <option value="">status — todos</option>{STATUS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
            <select className="control" style={{ flex: '1 1 110px' }} value={filtros.elegivel} onChange={setF('elegivel')}>
              <option value="">ref. — todas</option><option value="true">elegível</option><option value="false">não elegível</option>
            </select>
            <input className="control" style={{ width: 88 }} type="number" placeholder="área mín" value={filtros.areaMin} onChange={setF('areaMin')} />
            <input className="control" style={{ width: 88 }} type="number" placeholder="área máx" value={filtros.areaMax} onChange={setF('areaMax')} />
            <select className="control" style={{ flex: '1 1 120px' }} value={filtros.ordenar} onChange={setF('ordenar')}>
              <option value="recente">mais recentes</option>
              <option value="codigo">código</option>
              <option value="nome">nome</option>
              <option value="area">maior área</option>
              <option value="custo">maior custo</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => setFiltros(FILTRO_VAZIO)}>Limpar</button>
          </div>

          {obras.length === 0 ? (
            <p className="empty">Nenhuma obra {Object.entries(filtros).some(([k, v]) => k !== 'ordenar' && v !== '') ? 'encontrada com esses filtros.' : 'ainda. Cadastre a primeira ao lado.'}</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
                <th>Código</th><th>Nome</th><th>Cliente</th><th>Tipo</th><th>Área</th><th>Custo</th><th>Ref.</th><th></th>
              </tr></thead>
              <tbody>
                {obras.map((o) => (
                  <tr key={o.id} style={{ borderTop: '1px solid var(--border)', background: editando?.id === o.id ? 'var(--bg-subtle)' : 'transparent' }}>
                    <td>{o.codigo}</td><td>{o.nome}</td><td>{o.cliente || '—'}</td><td>{o.tipoObra || '—'}</td>
                    <td>{o.areaConstruidaM2 ? `${o.areaConstruidaM2} m²` : '—'}</td>
                    <td>{brl(Number(o.custoRealTotal) > 0 ? o.custoRealTotal : o.custoOrcadoTotal)}</td>
                    <td>{o.elegivelReferencia ? '✓' : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSel(o)}>Detalhar</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditando(o)}>Editar</button>
                      {user?.isAdmin && <button className="btn btn-ghost btn-sm" title="Excluir obra" onClick={() => excluir(o)}>×</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {sel && <ObraDetalhe obra={sel} onClose={() => setSel(null)} onChanged={recarregar} />}

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
