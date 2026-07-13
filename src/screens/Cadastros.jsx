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

const fmtPct = (v) => (v == null || v === '' ? '—' : `${Number(v).toFixed(2)}%`)

// Importação em lote da série de índices (RF-A06). Cola texto → prévia → grava (idempotente).
const EXEMPLO_INDICES = '2024-01 100,00\n2024-02 100,85\n2025 101,2 101,9 102,4 103,0 103,7 104,1 104,6 105,0 105,5 106,0 106,4 106,9'
function ImportarIndices({ onImportado }) {
  const [indice, setIndice] = useState('SINAPI')
  const [texto, setTexto] = useState('')
  const [previa, setPrevia] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [busy, setBusy] = useState(false)

  const previsualizar = async () => {
    if (!texto.trim()) return
    setErro(null); setResultado(null); setBusy(true)
    try { setPrevia(await api.importarIndices(texto, indice, true)) }
    catch (e) { setErro(e.message) } finally { setBusy(false) }
  }
  const importar = async () => {
    if (!texto.trim()) return
    setErro(null); setBusy(true)
    try {
      const r = await api.importarIndices(texto, indice, false)
      setResultado(r); setPrevia(null); onImportado && onImportado()
    } catch (e) { setErro(e.message) } finally { setBusy(false) }
  }

  return (
    <section className="card" style={{ padding: 'var(--sp-4)', gridColumn: '1 / -1' }}>
      <div className="eyebrow">Importar série de índices (em lote)</div>
      <p style={{ color: 'var(--fg-3)', fontSize: 12, margin: '6px 0' }}>
        Uma linha por competência (<code>AAAA-MM valor</code>) ou matriz anual (<code>AAAA v1 v2 … v12</code>, de janeiro).
        Índice inline (<code>SICRO 2024-03 250</code>) sobrescreve o campo. Reimportar atualiza o valor (idempotente).
      </p>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        <label style={{ fontSize: 13, color: 'var(--fg-3)' }}>Índice padrão</label>
        <input className="control" style={{ width: 140 }} maxLength={20} value={indice} onChange={(e) => setIndice(e.target.value)} placeholder="SINAPI" />
      </div>
      <textarea className="control" style={{ width: '100%', minHeight: 96, fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}
        disabled={busy}
        value={texto} onChange={(e) => { setTexto(e.target.value); setPrevia(null); setResultado(null) }} placeholder={EXEMPLO_INDICES} />
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button className="btn btn-secondary btn-sm" onClick={previsualizar} disabled={busy || !texto.trim()}>Pré-visualizar</button>
        <button className="btn btn-primary btn-sm" onClick={importar} disabled={busy || !texto.trim()}>Importar</button>
      </div>
      {erro && <div className="login-error" style={{ marginTop: 6 }}>{erro}</div>}

      {previa && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <strong>{previa.total}</strong> ponto(s) válido(s){previa.indices.length ? ` · índices: ${previa.indices.join(', ')}` : ''}
          {previa.erros.length > 0 && (
            <div style={{ color: 'var(--danger)', marginTop: 4 }}>
              {previa.erros.length} linha(s) com erro:
              <ul style={{ margin: '2px 0' }}>{previa.erros.slice(0, 8).map((e, i) => <li key={i}>Linha {e.linha}: {e.msg}</li>)}</ul>
            </div>
          )}
          {previa.total === 0 && <div style={{ color: 'var(--prio-medium)' }}>Nada válido para importar — confira o formato.</div>}
          {previa.truncado && <div style={{ color: 'var(--danger)', marginTop: 4 }}>Texto truncado em 5000 linhas — as excedentes NÃO foram processadas.</div>}
        </div>
      )}
      {resultado && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <strong>{resultado.inseridos}</strong> inserido(s) · <strong>{resultado.atualizados}</strong> atualizado(s) de {resultado.total}
          {resultado.indices?.length ? ` · ${resultado.indices.join(', ')}` : ''}.
          {resultado.erros.length > 0 && <span style={{ color: 'var(--danger)' }}> {resultado.erros.length} linha(s) ignorada(s).</span>}
          {resultado.truncado && <div style={{ color: 'var(--danger)' }}>Texto truncado em 5000 linhas — as excedentes NÃO foram processadas.</div>}
        </div>
      )}
    </section>
  )
}

export function Cadastros() {
  // Tipos de obra alimentam o select (opcional) dos parâmetros de BDI.
  const [tipos, setTipos] = useState([])
  const [recargaIdx, setRecargaIdx] = useState(0) // remonta a lista de índices após importar em lote
  useEffect(() => { api.tiposObra().then(setTipos).catch(() => {}) }, [])
  const tipoOpcoes = tipos.map((t) => ({ valor: t.id, rotulo: t.nome }))
  const tipoNome = (id) => (id ? (tipos.find((t) => t.id === id)?.nome || id) : 'Todos')

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
      <RegistroCRUD key={`idx-${recargaIdx}`} titulo="Índices econômicos" fullWidth
        campos={[
          { key: 'indice', rotulo: 'Índice', obrigatorio: true, maxLength: 20, flex: '2 1 120px' },
          { key: 'ano', rotulo: 'Ano', tipo: 'number', step: '1', min: '1900', max: '2100', obrigatorio: true, flex: '0 0 90px' },
          { key: 'mes', rotulo: 'Mês', tipo: 'select', opcoes: MESES, obrigatorio: true, flex: '0 0 90px', formatar: fmtMes },
          { key: 'valor', rotulo: 'Valor', tipo: 'number', step: '0.0001', obrigatorio: true, flex: '1 1 120px', formatar: fmtValor },
        ]}
        listar={() => api.indicesEconomicos()} criar={api.createIndice} atualizar={api.updIndice} excluir={api.delIndice} />
      <ImportarIndices onImportado={() => setRecargaIdx((n) => n + 1)} />
      <RegistroCRUD titulo="Parâmetros de BDI/encargos (por vigência)" fullWidth
        campos={[
          { key: 'tipoObraId', rotulo: 'Tipo (vazio = todos)', tipo: 'select', opcoes: tipoOpcoes, flex: '2 1 150px', formatar: tipoNome },
          { key: 'bdiPct', rotulo: 'BDI %', tipo: 'number', step: '0.01', obrigatorio: true, flex: '0 0 90px', formatar: fmtPct },
          { key: 'encargosPct', rotulo: 'Encargos %', tipo: 'number', step: '0.01', flex: '0 0 110px', formatar: fmtPct },
          { key: 'vigenciaInicio', rotulo: 'Início', tipo: 'date', obrigatorio: true, flex: '0 0 150px' },
          { key: 'vigenciaFim', rotulo: 'Fim', tipo: 'date', flex: '0 0 150px', formatar: (v) => v || '—' },
        ]}
        listar={api.parametrosBdi} criar={api.createBdi} atualizar={api.updBdi} excluir={api.delBdi} />
    </div>
  )
}
