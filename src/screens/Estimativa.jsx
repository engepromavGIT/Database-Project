import React, { useEffect, useState } from 'react'
import { api } from '../data/api.js'
import { brl, num, monthToDate } from '../data/format.js'

const escorePct = (e) => `${Math.round((e || 0) * 100)}%`
const corConf = (r) => (r === 'Alta' ? 'var(--info)' : r === 'Média' ? 'var(--prio-medium)' : 'var(--danger)')

async function abrirPdf(id) {
  const blob = await api.estimativaPdf(id)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

function LinhaEstimativa({ e, onCalibrar }) {
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td>{e.descricao}{e.versao ? ` (v${e.versao})` : ''}</td>
      <td><span className="chip">{e.metodo}</span></td>
      <td>{brl(e.custoProvavel)}</td>
      <td>{e.nivelConfianca != null ? `${e.nivelConfianca}%` : '—'}</td>
      <td><button className="btn btn-ghost btn-sm" onClick={() => abrirPdf(e.id)}>PDF</button></td>
      <td>
        {e.custoRealizado != null
          ? <span className="chip">erro {e.erroPct > 0 ? '+' : ''}{e.erroPct}%</span>
          : (
            <span style={{ display: 'flex', gap: 4 }}>
              <input className="control" type="number" min="0" step="0.01" placeholder="realizado R$"
                value={val} onChange={(ev) => setVal(ev.target.value)} style={{ width: 100 }} />
              <button className="btn btn-secondary btn-sm" disabled={busy || !val}
                onClick={async () => { setBusy(true); try { await onCalibrar(e.id, Number(val)) } finally { setBusy(false) } }}>OK</button>
            </span>
          )}
      </td>
    </tr>
  )
}

export function Estimativa() {
  const [metodo, setMetodo] = useState('parametrica')
  const [tipos, setTipos] = useState([])
  const [padroes, setPadroes] = useState([])
  const [localidades, setLocalidades] = useState([])
  const [servicos, setServicos] = useState([])
  const [cenarios, setCenarios] = useState([])
  const [grupo, setGrupo] = useState('') // '' = novo cenário
  const [form, setForm] = useState({ descricao: '', tipoObraId: '', padraoId: '', localidadeId: '', areaAlvoM2: '', dataBase: '', bdiPct: '25' })
  const [analogas, setAnalogas] = useState(null)
  const [sel, setSel] = useState(new Set())
  const [itens, setItens] = useState([{ descricao: '', unidade: '', quantidade: '', custoUnitario: '' }])
  const [resultado, setResultado] = useState(null)
  const [estimativas, setEstimativas] = useState([])
  const [erro, setErro] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const carregarBase = async () => {
    const [t, p, l, s, es, ce] = await Promise.all([
      api.tiposObra(), api.padroes(), api.localidades(), api.servicos(), api.estimativas(), api.cenarios(),
    ])
    setTipos(t); setPadroes(p); setLocalidades(l); setServicos(s); setEstimativas(es); setCenarios(ce)
  }
  useEffect(() => { carregarBase().catch((e) => setErro(e.message)) }, [])

  const alvoBody = () => ({
    tipoObraId: form.tipoObraId || null,
    padraoId: form.padraoId || null,
    localidadeId: form.localidadeId || null,
    areaAlvoM2: form.areaAlvoM2 ? Number(form.areaAlvoM2) : null,
    dataBase: monthToDate(form.dataBase),
  })

  const buscar = async () => {
    setErro(null); setResultado(null); setBusy(true)
    try {
      const r = await api.analogas(alvoBody())
      setAnalogas(r.analogas); setSel(new Set(r.analogas.map((a) => a.id)))
    } catch (e) { setErro(e.message) } finally { setBusy(false) }
  }
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const setItem = (i, k, v) => setItens((arr) => arr.map((it, j) => (j === i ? { ...it, [k]: v } : it)))
  const addItem = () => setItens((arr) => [...arr, { descricao: '', unidade: '', quantidade: '', custoUnitario: '' }])
  const delItem = (i) => setItens((arr) => arr.filter((_, j) => j !== i))
  const escolherServico = (i, id) => {
    const s = servicos.find((x) => x.id === id)
    setItens((arr) => arr.map((it, j) => (j === i ? { ...it, servicoRefId: id || null, descricao: s ? s.descricao : it.descricao, unidade: s ? s.unidade : it.unidade } : it)))
  }
  const conciliarSinapi = async () => {
    setBusy(true); setErro(null)
    try {
      const res = await api.conciliar(itens.map((i) => ({ descricao: i.descricao, codigoSinapi: i.codigoSinapi })))
      setItens((arr) => arr.map((it, i) => {
        const r = res.find((x) => x.indice === i)
        return r && r.match ? { ...it, servicoRefId: r.match.id, unidade: it.unidade || r.match.unidade } : it
      }))
    } catch (e) { setErro(e.message) } finally { setBusy(false) }
  }
  const custoDireto = itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.custoUnitario) || 0), 0)

  const gerar = async () => {
    setErro(null); setBusy(true)
    try {
      const base = { ...alvoBody(), descricao: form.descricao.trim(), bdiPct: Number(form.bdiPct) || 0, metodo, grupo: grupo || undefined }
      const body = metodo === 'bottom_up'
        ? { ...base, itens: itens.filter((i) => Number(i.quantidade) > 0 && Number(i.custoUnitario) > 0) }
        : { ...base, obraIds: [...sel] }
      const r = await api.createEstimativa(body)
      setResultado(r)
      setGrupo(r.grupo) // passa a versionar este cenário
      await carregarBase()
    } catch (e) { setErro(e.message) } finally { setBusy(false) }
  }

  const calibrar = async (id, valor) => { await api.registrarRealizado(id, valor); await carregarBase() }

  const MetodoBtn = ({ id, children }) => (
    <button className={`btn btn-sm ${metodo === id ? 'btn-primary' : 'btn-ghost'}`}
      onClick={() => { setMetodo(id); setResultado(null) }}>{children}</button>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 'var(--sp-4)', alignItems: 'start' }}>
      <div className="card" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 'var(--sp-3)' }}>
        <div className="eyebrow">Projeto a estimar</div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <MetodoBtn id="parametrica">Paramétrica</MetodoBtn>
          <MetodoBtn id="bottom_up">Bottom-up</MetodoBtn>
        </div>
        <div className="field"><label>Cenário</label>
          <select className="control" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">Novo cenário</option>
            {cenarios.map((c) => <option key={c.grupo} value={c.grupo}>{c.descricao} (próx. v{c.ultimaVersao + 1})</option>)}
          </select></div>
        <div className="field"><label>Descrição *</label>
          <input className="control" value={form.descricao} onChange={set('descricao')} placeholder="Edifício comercial X" /></div>
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
        <div className="field"><label>Área-alvo (m²){metodo === 'parametrica' ? ' *' : ''}</label>
          <input className="control" type="number" min="0" step="0.01" value={form.areaAlvoM2} onChange={set('areaAlvoM2')} /></div>
        <div className="field"><label>Data-base</label>
          <input className="control" type="month" value={form.dataBase} onChange={set('dataBase')} /></div>
        <div className="field"><label>BDI (%)</label>
          <input className="control" type="number" min="0" step="0.1" value={form.bdiPct} onChange={set('bdiPct')} /></div>

        {metodo === 'parametrica' && (
          <button className="btn btn-secondary" disabled={busy || !form.areaAlvoM2} onClick={buscar}>
            {busy ? '…' : '1. Buscar análogas'}
          </button>
        )}
        <button className="btn btn-primary"
          disabled={busy || !form.descricao || (metodo === 'parametrica' ? (!form.areaAlvoM2 || sel.size === 0) : custoDireto <= 0)}
          onClick={gerar}>
          {grupo ? 'Salvar nova versão' : (metodo === 'parametrica' ? '2. Gerar e salvar' : 'Gerar e salvar (bottom-up)')}
        </button>
        {erro && <div className="login-error">{erro}</div>}
      </div>

      <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        {resultado && (
          <section className="card" style={{ padding: 'var(--sp-4)' }}>
            <div className="eyebrow">Estimativa gerada — {resultado.metodo} · v{resultado.versao}</div>
            <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap', marginTop: 8 }}>
              <div><div style={{ color: 'var(--fg-3)', fontSize: 12 }}>Custo provável</div>
                <strong style={{ fontSize: 20 }}>{brl(resultado.custo.esperado)}</strong></div>
              <div><div style={{ color: 'var(--fg-3)', fontSize: 12 }}>Faixa (O–P)</div>
                <div>{brl(resultado.custo.O)} — {brl(resultado.custo.P)}</div></div>
              <div><div style={{ color: 'var(--fg-3)', fontSize: 12 }}>Preço c/ BDI {resultado.bdiPct}%</div>
                <div>{brl(resultado.preco)}</div></div>
              <div><div style={{ color: 'var(--fg-3)', fontSize: 12 }}>Prazo provável</div>
                <div>{resultado.prazo?.esperado != null ? `${num(resultado.prazo.esperado)} dias` : '—'}</div></div>
              {resultado.metodo === 'parametrica' && (
                <div><div style={{ color: 'var(--fg-3)', fontSize: 12 }}>Confiança</div>
                  <span className="chip" style={{ background: corConf(resultado.rotulo), color: '#fff' }}>
                    {resultado.rotulo} ({resultado.nivelConfianca}%)</span></div>
              )}
              {resultado.metodo === 'bottom_up' && (
                <div><div style={{ color: 'var(--fg-3)', fontSize: 12 }}>Custo direto / aderência</div>
                  <div>{brl(resultado.custoDireto)} · ×{resultado.aderencia.fator} (±{resultado.aderencia.desvio})</div></div>
              )}
              <div><button className="btn btn-secondary btn-sm" onClick={() => abrirPdf(resultado.id)}>Exportar PDF</button></div>
            </div>
          </section>
        )}

        {metodo === 'parametrica' && analogas && (
          <section className="card" style={{ padding: 'var(--sp-4)' }}>
            <div className="eyebrow">Obras análogas ({analogas.length}) — selecione as referências</div>
            {analogas.length === 0 ? (
              <p className="empty">Nenhuma obra elegível. Cadastre obras com custo, área e datas, marcadas como referência.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
                  <th></th><th>Código</th><th>Nome</th><th>Padrão</th><th>Área</th><th>Custo/m²</th><th>Similar.</th>
                </tr></thead>
                <tbody>
                  {analogas.map((a) => (
                    <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td><input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} /></td>
                      <td>{a.codigo}</td><td>{a.nome}</td><td>{a.padrao || '—'}</td>
                      <td>{a.areaConstruidaM2} m²</td><td>{brl(a.custoM2)}</td>
                      <td><strong>{escorePct(a.escore)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {metodo === 'bottom_up' && (
          <section className="card" style={{ padding: 'var(--sp-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="eyebrow">Composição (itens) — custo direto: {brl(custoDireto)}</div>
              <button className="btn btn-ghost btn-sm" onClick={conciliarSinapi} disabled={busy}>Conciliar SINAPI</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
                <th>Serviço</th><th>Descrição</th><th>Un.</th><th>Qtd.</th><th>Custo unit.</th><th>Total</th><th></th>
              </tr></thead>
              <tbody>
                {itens.map((it, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td>
                      <select className="control" value={it.servicoRefId || ''} onChange={(e) => escolherServico(i, e.target.value)} style={{ minWidth: 120 }}>
                        <option value="">—</option>
                        {servicos.map((s) => <option key={s.id} value={s.id}>{s.descricao}</option>)}
                      </select>
                    </td>
                    <td><input className="control" value={it.descricao} onChange={(e) => setItem(i, 'descricao', e.target.value)} /></td>
                    <td><input className="control" value={it.unidade} onChange={(e) => setItem(i, 'unidade', e.target.value)} style={{ width: 60 }} /></td>
                    <td><input className="control" type="number" min="0" step="0.01" value={it.quantidade} onChange={(e) => setItem(i, 'quantidade', e.target.value)} style={{ width: 80 }} /></td>
                    <td><input className="control" type="number" min="0" step="0.01" value={it.custoUnitario} onChange={(e) => setItem(i, 'custoUnitario', e.target.value)} style={{ width: 100 }} /></td>
                    <td>{brl((Number(it.quantidade) || 0) * (Number(it.custoUnitario) || 0))}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => delItem(i)} disabled={itens.length === 1}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--sp-2)' }} onClick={addItem}>+ Adicionar item</button>
          </section>
        )}

        <section className="card" style={{ padding: 'var(--sp-4)' }}>
          <div className="eyebrow">Estimativas salvas ({estimativas.length})</div>
          {estimativas.length === 0 ? (
            <p className="empty">Nenhuma estimativa salva ainda.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
                <th>Descrição</th><th>Método</th><th>Custo provável</th><th>Confiança</th><th>PDF</th><th>Calibração</th>
              </tr></thead>
              <tbody>
                {estimativas.map((e) => <LinhaEstimativa key={e.id} e={e} onCalibrar={calibrar} />)}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}
