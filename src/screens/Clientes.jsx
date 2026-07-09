import React, { useEffect, useState } from 'react'
import { api } from '../data/api.js'

// CRUD de clientes (RF-A01 / US-08). "Excluir" é inativar (as obras referenciam o cliente).
export function Clientes() {
  const [clientes, setClientes] = useState([])
  const [todos, setTodos] = useState(false)
  const [form, setForm] = useState({ nome: '', documento: '' })
  const [editId, setEditId] = useState(null)
  const [erro, setErro] = useState(null)
  const [busy, setBusy] = useState(false)

  const carregar = async (t = todos) => {
    try { setClientes(await api.clientes(t)) } catch (e) { setErro(e.message) }
  }
  useEffect(() => { carregar(false) }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const limpar = () => { setForm({ nome: '', documento: '' }); setEditId(null) }

  const salvar = async (e) => {
    e.preventDefault()
    if (busy || !form.nome.trim()) return
    setBusy(true); setErro(null)
    try {
      const dados = { nome: form.nome.trim(), documento: form.documento.trim() || null }
      // Sem 'ativo' na edição de metadados → o servidor preserva a situação atual
      // (editar um cliente inativo não o reativa). Ativar/inativar é o botão da lista.
      if (editId) await api.updateCliente(editId, dados)
      else await api.createCliente(dados)
      limpar(); await carregar()
    } catch (err) { setErro(err.message) } finally { setBusy(false) }
  }

  const editar = (c) => { setForm({ nome: c.nome, documento: c.documento || '' }); setEditId(c.id) }
  const alternarAtivo = async (c) => {
    setErro(null)
    try { await api.updateCliente(c.id, { nome: c.nome, documento: c.documento || null, ativo: !c.ativo }); await carregar() }
    catch (e) { setErro(e.message) }
  }
  const alternarTodos = async () => { const t = !todos; setTodos(t); await carregar(t) }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 'var(--sp-4)', alignItems: 'start' }}>
      <form className="card" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 'var(--sp-3)' }} onSubmit={salvar}>
        <div className="eyebrow">{editId ? 'Editar cliente' : 'Novo cliente'}</div>
        <div className="field"><label>Nome *</label>
          <input className="control" value={form.nome} onChange={set('nome')} placeholder="Prefeitura de …" /></div>
        <div className="field"><label>Documento (CNPJ/CPF)</label>
          <input className="control" value={form.documento} onChange={set('documento')} placeholder="00.000.000/0000-00" /></div>
        {erro && <div className="login-error">{erro}</div>}
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !form.nome.trim()}>
            {busy ? 'Salvando…' : editId ? 'Salvar' : 'Adicionar'}
          </button>
          {editId && <button type="button" className="btn btn-secondary" onClick={limpar}>Cancelar</button>}
        </div>
      </form>

      <section className="card" style={{ padding: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="eyebrow">Clientes ({clientes.length})</div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--fg-3)' }}>
            <input type="checkbox" checked={todos} onChange={alternarTodos} /> incluir inativos
          </label>
        </div>
        {clientes.length === 0 ? (
          <p className="empty">Nenhum cliente cadastrado. Adicione o primeiro ao lado.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 6 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
              <th>Nome</th><th>Documento</th><th>Situação</th><th></th>
            </tr></thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border)', opacity: c.ativo ? 1 : 0.55 }}>
                  <td>{c.nome}</td><td>{c.documento || '—'}</td>
                  <td>{c.ativo ? 'Ativo' : 'Inativo'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => editar(c)}>Editar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => alternarAtivo(c)}>{c.ativo ? 'Inativar' : 'Ativar'}</button>
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
