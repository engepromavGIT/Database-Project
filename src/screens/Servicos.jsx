import React, { useEffect, useState } from 'react'
import { api } from '../data/api.js'

// CRUD de serviços/composições de referência (RF-A05). Aba admin. "Excluir" é inativar
// (itens_custo/estimativa_itens referenciam o serviço — mesmo modelo de Clientes).
const VAZIO = { codigoSinapi: '', descricao: '', unidade: '', categoriaId: '' }

export function Servicos() {
  const [servicos, setServicos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [todos, setTodos] = useState(false)
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState(VAZIO)
  const [editId, setEditId] = useState(null)
  const [erro, setErro] = useState(null)
  const [busy, setBusy] = useState(false)

  const carregar = async (t = todos, b = busca) => {
    try { setServicos(await api.servicos({ todos: t, busca: b })) } catch (e) { setErro(e.message) }
  }
  useEffect(() => { carregar(false, '') }, [])
  useEffect(() => { api.categorias().then(setCategorias).catch(() => {}) }, [])
  // Recarrega (debounced) quando a busca muda.
  useEffect(() => {
    const h = setTimeout(() => carregar(todos, busca), 250)
    return () => clearTimeout(h)
  }, [busca]) // eslint-disable-line react-hooks/exhaustive-deps

  const catNome = (id) => categorias.find((c) => c.id === id)?.nome || '—'
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const limpar = () => { setForm(VAZIO); setEditId(null) }
  const podeSalvar = form.descricao.trim() && form.unidade.trim()

  const salvar = async (e) => {
    e.preventDefault()
    if (busy || !podeSalvar) return
    setBusy(true); setErro(null)
    try {
      const dados = {
        codigoSinapi: form.codigoSinapi.trim() || null,
        descricao: form.descricao.trim(),
        unidade: form.unidade.trim(),
        categoriaId: form.categoriaId || null,
      }
      // Sem 'ativo' na edição de metadados → o servidor preserva (não reativa ao editar).
      if (editId) await api.updServico(editId, dados)
      else await api.createServico(dados)
      limpar(); await carregar()
    } catch (err) { setErro(err.message) } finally { setBusy(false) }
  }

  const editar = (s) => {
    setForm({ codigoSinapi: s.codigoSinapi || '', descricao: s.descricao, unidade: s.unidade, categoriaId: s.categoriaId || '' })
    setEditId(s.id)
  }
  const alternarAtivo = async (s) => {
    setErro(null)
    try {
      await api.updServico(s.id, {
        codigoSinapi: s.codigoSinapi || null, descricao: s.descricao, unidade: s.unidade,
        categoriaId: s.categoriaId || null, ativo: !s.ativo,
      })
      await carregar()
    } catch (e) { setErro(e.message) }
  }
  const alternarTodos = async () => { const t = !todos; setTodos(t); await carregar(t, busca) }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 'var(--sp-4)', alignItems: 'start' }}>
      <form className="card" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 'var(--sp-3)' }} onSubmit={salvar}>
        <div className="eyebrow">{editId ? 'Editar serviço' : 'Novo serviço'}</div>
        <div className="field"><label>Descrição *</label>
          <input className="control" value={form.descricao} onChange={set('descricao')} placeholder="Concreto usinado fck 25 MPa…" /></div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <div className="field" style={{ flex: '0 0 90px' }}><label>Unidade *</label>
            <input className="control" value={form.unidade} onChange={set('unidade')} placeholder="m³" /></div>
          <div className="field" style={{ flex: 1 }}><label>Código SINAPI</label>
            <input className="control" value={form.codigoSinapi} onChange={set('codigoSinapi')} placeholder="opcional" /></div>
        </div>
        <div className="field"><label>Categoria</label>
          <select className="control" value={form.categoriaId} onChange={set('categoriaId')}>
            <option value="">(nenhuma)</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select></div>
        {erro && <div className="login-error">{erro}</div>}
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !podeSalvar}>
            {busy ? 'Salvando…' : editId ? 'Salvar' : 'Adicionar'}
          </button>
          {editId && <button type="button" className="btn btn-secondary" onClick={limpar}>Cancelar</button>}
        </div>
      </form>

      <section className="card" style={{ padding: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <div className="eyebrow">Serviços ({servicos.length})</div>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
            <input className="control" style={{ width: 200 }} placeholder="Buscar descrição/código"
              value={busca} onChange={(e) => setBusca(e.target.value)} />
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={todos} onChange={alternarTodos} /> incluir inativos
            </label>
          </div>
        </div>
        {servicos.length === 0 ? (
          <p className="empty">Nenhum serviço encontrado.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 6 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
              <th>Descrição</th><th>Un.</th><th>Código</th><th>Categoria</th><th>Situação</th><th></th>
            </tr></thead>
            <tbody>
              {servicos.map((s) => (
                <tr key={s.id} style={{ borderTop: '1px solid var(--border)', opacity: s.ativo ? 1 : 0.55 }}>
                  <td>{s.descricao}</td><td>{s.unidade}</td><td>{s.codigoSinapi || '—'}</td>
                  <td>{catNome(s.categoriaId)}</td>
                  <td>{s.ativo ? 'Ativo' : 'Inativo'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => editar(s)}>Editar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => alternarAtivo(s)}>{s.ativo ? 'Inativar' : 'Ativar'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
