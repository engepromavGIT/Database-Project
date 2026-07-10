import React, { useEffect, useState } from 'react'
import { api } from '../data/api.js'

// Cadastros de referência (RF-A02/A03/A04/A08). Aba restrita a admin (as rotas de escrita
// também exigem requireAdmin no servidor). Um componente genérico serve os 4 cadastros.
const vazioDe = (campos) => Object.fromEntries(campos.map((c) => [c.key, '']))

function RegistroCRUD({ titulo, campos, listar, criar, atualizar, excluir, fullWidth }) {
  const [itens, setItens] = useState([])
  const [form, setForm] = useState(vazioDe(campos))
  const [editId, setEditId] = useState(null)
  const [erro, setErro] = useState(null)
  const [busy, setBusy] = useState(false)

  const carregar = async () => { try { setItens(await listar()) } catch (e) { setErro(e.message) } }
  useEffect(() => { carregar() }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const limpar = () => { setForm(vazioDe(campos)); setEditId(null) }
  const editar = (it) => { setForm(Object.fromEntries(campos.map((c) => [c.key, it[c.key] ?? '']))); setEditId(it.id) }
  const podeSalvar = campos.filter((c) => c.obrigatorio).every((c) => String(form[c.key] ?? '').trim())

  const salvar = async (e) => {
    e.preventDefault()
    if (busy || !podeSalvar) return
    setBusy(true); setErro(null)
    try {
      if (editId) await atualizar(editId, form)
      else await criar(form)
      limpar(); await carregar()
    } catch (err) { setErro(err.message) } finally { setBusy(false) }
  }
  const remover = async (it) => {
    if (!window.confirm(`Excluir "${it[campos[0].key]}"?`)) return
    setErro(null)
    try { await excluir(it.id); if (editId === it.id) limpar(); await carregar() }
    catch (e) { setErro(e.message) }
  }

  return (
    <section className="card" style={{ padding: 'var(--sp-4)', ...(fullWidth ? { gridColumn: '1 / -1' } : {}) }}>
      <div className="eyebrow">{titulo} ({itens.length})</div>
      <form onSubmit={salvar} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: 'var(--sp-3) 0' }}>
        {campos.map((c) => (c.tipo === 'select' ? (
          <select key={c.key} className="control" style={{ flex: c.flex || '1 1 120px' }} value={form[c.key]} onChange={set(c.key)}>
            <option value="">{c.rotulo}…</option>
            {c.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
        ) : (
          <input key={c.key} className="control" style={{ flex: c.flex || '1 1 120px' }}
            type={c.tipo || 'text'}
            step={c.step ?? (c.tipo === 'number' ? '0.0001' : undefined)}
            min={c.min ?? (c.tipo === 'number' ? '0' : undefined)} max={c.max}
            maxLength={c.maxLength} placeholder={c.rotulo} value={form[c.key]} onChange={set(c.key)} />
        )))}
        <button className="btn btn-primary btn-sm" disabled={busy || !podeSalvar}>{editId ? 'Salvar' : 'Adicionar'}</button>
        {editId && <button type="button" className="btn btn-ghost btn-sm" onClick={limpar}>Cancelar</button>}
      </form>
      {erro && <div className="login-error">{erro}</div>}
      {itens.length === 0 ? (
        <p className="empty">Nenhum registro.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
            {campos.map((c) => <th key={c.key}>{c.rotulo}</th>)}<th></th>
          </tr></thead>
          <tbody>
            {itens.map((it) => (
              <tr key={it.id} style={{ borderTop: '1px solid var(--border)', background: editId === it.id ? 'var(--bg-subtle)' : 'transparent' }}>
                {campos.map((c) => <td key={c.key}>{c.formatar ? c.formatar(it[c.key]) : (it[c.key] || '—')}</td>)}
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => editar(it)}>Editar</button>
                  <button className="btn btn-ghost btn-sm" title="Excluir" onClick={() => remover(it)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

const CAT_TIPOS = [
  { valor: 'material', rotulo: 'Material' },
  { valor: 'mao_de_obra', rotulo: 'Mão de obra' },
  { valor: 'equipamento', rotulo: 'Equipamento' },
  { valor: 'terceiros', rotulo: 'Terceiros' },
  { valor: 'indireto', rotulo: 'Indireto' },
]
const rotuloCatTipo = (v) => CAT_TIPOS.find((t) => t.valor === v)?.rotulo || v || '—'

// Índices econômicos (RF-A06): série mensal p/ atualização monetária.
const MESES = Array.from({ length: 12 }, (_, i) => ({ valor: String(i + 1), rotulo: String(i + 1).padStart(2, '0') }))
const fmtMes = (v) => (v == null || v === '' ? '—' : String(v).padStart(2, '0'))
const fmtValor = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }))

export function Cadastros() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', alignItems: 'start' }}>
      <RegistroCRUD titulo="Tipos de obra"
        campos={[{ key: 'nome', rotulo: 'Nome', obrigatorio: true, flex: '1 1 100%' }]}
        listar={api.tiposObra} criar={api.createTipoObra} atualizar={api.updTipoObra} excluir={api.delTipoObra} />
      <RegistroCRUD titulo="Padrões de acabamento"
        campos={[{ key: 'nome', rotulo: 'Nome', obrigatorio: true, flex: '1 1 100%' }]}
        listar={api.padroes} criar={api.createPadrao} atualizar={api.updPadrao} excluir={api.delPadrao} />
      <RegistroCRUD titulo="Categorias de custo"
        campos={[
          { key: 'nome', rotulo: 'Nome', obrigatorio: true, flex: '2 1 120px' },
          { key: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: CAT_TIPOS, obrigatorio: true, flex: '1 1 130px', formatar: rotuloCatTipo },
        ]}
        listar={api.categorias} criar={api.createCategoria} atualizar={api.updCategoria} excluir={api.delCategoria} />
      <RegistroCRUD titulo="Localidades"
        campos={[
          { key: 'municipio', rotulo: 'Município', obrigatorio: true, flex: '2 1 120px' },
          { key: 'uf', rotulo: 'UF', obrigatorio: true, maxLength: 2, flex: '0 0 56px' },
          { key: 'fatorRegional', rotulo: 'Fator', tipo: 'number', flex: '0 0 84px' },
        ]}
        listar={api.localidades} criar={api.createLocalidade} atualizar={api.updLocalidade} excluir={api.delLocalidade} />
      <RegistroCRUD titulo="Índices econômicos" fullWidth
        campos={[
          { key: 'indice', rotulo: 'Índice', obrigatorio: true, maxLength: 20, flex: '2 1 120px' },
          { key: 'ano', rotulo: 'Ano', tipo: 'number', step: '1', min: '1900', max: '2100', obrigatorio: true, flex: '0 0 90px' },
          { key: 'mes', rotulo: 'Mês', tipo: 'select', opcoes: MESES, obrigatorio: true, flex: '0 0 90px', formatar: fmtMes },
          { key: 'valor', rotulo: 'Valor', tipo: 'number', step: '0.0001', obrigatorio: true, flex: '1 1 120px', formatar: fmtValor },
        ]}
        listar={() => api.indicesEconomicos()} criar={api.createIndice} atualizar={api.updIndice} excluir={api.delIndice} />
    </div>
  )
}
