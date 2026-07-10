import React, { useEffect, useState } from 'react'
import { api } from '../data/api.js'
import { brl, num, pct } from '../data/format.js'

const desvioPct = (orc, real) => {
  const o = Number(orc) || 0
  const r = Number(real) || 0
  if (o <= 0 || r <= 0) return '—' // sem realizado lançado → não mostra "-100%"
  return `${r > o ? '+' : ''}${Math.round((r / o - 1) * 100)}%`
}
const classeCor = (c) => (c === 'A' ? 'var(--danger)' : c === 'B' ? 'var(--prio-medium)' : 'var(--fg-3)')

// Ordena etapas por código EAP de forma natural (1, 1.1, 2, 10, 10.1...).
const cmpEap = (a, b) => {
  const pa = (a.codigoEap || '').split('.').map(Number)
  const pb = (b.codigoEap || '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}
const profEap = (cod) => (cod || '').split('.').length - 1
const corta = (s, n) => { const t = s || ''; return t.length > n ? `${t.slice(0, n)}…` : t }
const fmtBytes = (b) => {
  const n = Number(b)
  if (!(n > 0)) return '—'
  return n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
}

const ITEM_VAZIO = { servicoRefId: '', descricao: '', unidade: '', quantidade: '', custoUnitario: '', categoriaId: '' }

// RF-D01 — Atualização monetária: leva os custos da obra a uma data-base alvo via índice.
function AtualizacaoMonetaria({ obra }) {
  const [indices, setIndices] = useState([])
  const [form, setForm] = useState({ indice: 'SINAPI', dataBase: '' })
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.indices().then((xs) => { setIndices(xs); if (xs[0]) setForm((f) => ({ ...f, indice: xs[0].indice })) }).catch(() => {})
  }, [])
  // Ao trocar de obra (mesma instância do componente), descarta o resultado anterior.
  useEffect(() => { setResultado(null); setErro(null); setForm((f) => ({ ...f, dataBase: '' })) }, [obra.id])

  const atualizar = async () => {
    if (!form.dataBase) return
    setBusy(true); setErro(null)
    try { setResultado(await api.obraAtualizacao(obra.id, form)) }
    catch (e) { setErro(e.message); setResultado(null) }
    finally { setBusy(false) }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-3)', marginTop: 'var(--sp-3)' }}>
      <strong style={{ fontSize: 13 }}>Atualização monetária</strong>
      <span style={{ color: 'var(--fg-3)', fontSize: 12, marginLeft: 8 }}>data-base da obra: {obra.dataBaseCusto || '—'}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
        <select className="control" style={{ width: 120 }} value={form.indice} onChange={(e) => setForm((f) => ({ ...f, indice: e.target.value }))}>
          {indices.length === 0 && <option value="SINAPI">SINAPI</option>}
          {indices.map((x) => <option key={x.indice} value={x.indice}>{x.indice}</option>)}
        </select>
        <input className="control" style={{ width: 150 }} type="month" value={form.dataBase} onChange={(e) => setForm((f) => ({ ...f, dataBase: e.target.value }))} />
        <button className="btn btn-secondary btn-sm" onClick={atualizar} disabled={busy || !form.dataBase}>Atualizar para esta data-base</button>
      </div>
      {erro && <div className="login-error" style={{ marginTop: 6 }}>{erro}</div>}
      {resultado && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
              <th>Custo</th><th>Histórico ({resultado.dataBaseOrigem || '—'})</th><th>Atualizado ({resultado.dataBaseAlvo})</th>
            </tr></thead>
            <tbody>
              <tr style={{ borderTop: '1px solid var(--border)' }}><td>Orçado</td><td>{brl(resultado.custoOrcado.historico)}</td><td>{brl(resultado.custoOrcado.atualizado)}</td></tr>
              <tr style={{ borderTop: '1px solid var(--border)' }}><td>Real</td><td>{brl(resultado.custoReal.historico)}</td><td>{brl(resultado.custoReal.atualizado)}</td></tr>
            </tbody>
          </table>
          {resultado.semIndice
            ? <div style={{ color: 'var(--prio-medium)', fontSize: 12, marginTop: 4 }}>Sem índice {resultado.indice} para {resultado.dataBaseOrigem || '?'} → {resultado.dataBaseAlvo}: valor mantido (fator 1).</div>
            : <div style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 4 }}>Fator {resultado.indice}: {resultado.fator} ({resultado.dataBaseOrigem} → {resultado.dataBaseAlvo})</div>}
        </>
      )}
    </div>
  )
}

// RF-B05 — Cronograma físico-financeiro / Curva S de previsto × realizado.
// A curva é computada no backend (função pura curvaS.js); aqui só desenhamos (SVG inline).
const MED_VAZIA = { competencia: '', avancoFisicoPct: '', desembolso: '', avancoPlanPct: '', desembolsoPlan: '' }
const FONTE_PREV = { baseline: 'linha de base', linear: 'linear (datas de plano)' }
const FONTE_FIN = { custos_realizados: 'custos realizados', medicoes: 'desembolso das medições' }

function CurvaS({ obra }) {
  const [curva, setCurva] = useState(null)
  const [medicoes, setMedicoes] = useState([])
  const [dim, setDim] = useState('fisico') // 'fisico' | 'financeiro'
  const [form, setForm] = useState(MED_VAZIA)
  const [comBase, setComBase] = useState(false)
  const [editId, setEditId] = useState(null)
  const [erro, setErro] = useState(null)
  const [busy, setBusy] = useState(false)

  const carregar = async () => {
    try {
      const [c, m] = await Promise.all([api.curvaS(obra.id), api.obraMedicoes(obra.id)])
      setCurva(c); setMedicoes(m)
    } catch (e) { setErro(e.message) }
  }
  useEffect(() => {
    setCurva(null); setMedicoes([]); setEditId(null); setErro(null); setComBase(false); setForm(MED_VAZIA)
    carregar()
  }, [obra.id])

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const limpar = () => { setEditId(null); setForm(MED_VAZIA) }
  const editar = (m) => {
    setEditId(m.id)
    setForm({
      competencia: m.competencia || '',
      avancoFisicoPct: m.avancoFisicoPct ?? '', desembolso: m.desembolso ?? '',
      avancoPlanPct: m.avancoPlanPct ?? '', desembolsoPlan: m.desembolsoPlan ?? '',
    })
    if (m.avancoPlanPct != null || m.desembolsoPlan != null) setComBase(true)
  }
  const numOr = (v) => (String(v).trim() === '' ? null : Number(v))
  const temValor = [form.avancoFisicoPct, form.desembolso, comBase ? form.avancoPlanPct : '', comBase ? form.desembolsoPlan : '']
    .some((v) => String(v).trim() !== '')
  const podeSalvar = (editId || form.competencia) && temValor

  const salvar = async () => {
    if (busy || !podeSalvar) return
    setErro(null); setBusy(true)
    try {
      const dados = {
        competencia: form.competencia,
        avancoFisicoPct: numOr(form.avancoFisicoPct), desembolso: numOr(form.desembolso),
        avancoPlanPct: comBase ? numOr(form.avancoPlanPct) : null,
        desembolsoPlan: comBase ? numOr(form.desembolsoPlan) : null,
      }
      if (editId) await api.updMedicao(editId, dados)
      else await api.addMedicao(obra.id, dados)
      limpar(); await carregar()
    } catch (e) { setErro(e.message) } finally { setBusy(false) }
  }
  const remover = async (m) => {
    if (!window.confirm(`Excluir a medição de ${m.competencia}?`)) return
    setErro(null)
    try { await api.delMedicao(m.id); if (editId === m.id) limpar(); await carregar() }
    catch (e) { setErro(e.message) }
  }

  const pontos = curva?.pontos || []
  const temBaseFin = curva && curva.custoOrcadoTotal != null && Number(curva.custoOrcadoTotal) > 0
  const isFin = dim === 'financeiro'
  // Série e escala do eixo Y conforme a dimensão selecionada.
  const prevKey = !isFin ? 'prevFisicoPct' : (temBaseFin ? 'prevFinanceiroPct' : 'prevFinanceiro')
  const realKey = !isFin ? 'realFisicoPct' : (temBaseFin ? 'realFinanceiroPct' : 'realFinanceiro')
  const emPct = !isFin || temBaseFin
  const yMax = emPct
    ? (curva?.yMaxPct || 100)
    : Math.max(1, ...pontos.map((p) => Math.max(Number(p.prevFinanceiro) || 0, Number(p.realFinanceiro) || 0)))
  const estouro = isFin && temBaseFin && pontos.some((p) => p.realFinanceiroPct != null && p.realFinanceiroPct > 100)
  const corReal = estouro ? 'var(--danger)' : 'var(--brand)'

  // Geometria do SVG.
  const W = 720, H = 260, ML = 52, MR = 12, MT = 12, MB = 30
  const PW = W - ML - MR, PH = H - MT - MB
  const n = pontos.length
  const px = (i) => ML + (n <= 1 ? PW / 2 : (i / (n - 1)) * PW)
  const py = (v) => MT + PH * (1 - (Number(v) / yMax))
  const pathOf = (key) => pontos.map((p, i) => (p[key] == null ? null : `${px(i).toFixed(1)},${py(p[key]).toFixed(1)}`)).filter(Boolean).join(' ')
  const prevPath = pathOf(prevKey)
  const realPath = pathOf(realKey)
  const níveis = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax)
  const rotuloY = (v) => (emPct ? `${Math.round(v)}%` : num(v, 0))
  const passoX = n <= 8 ? 1 : Math.ceil(n / 7)

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-3)', marginTop: 'var(--sp-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <strong style={{ fontSize: 13 }}>Cronograma físico-financeiro (Curva S)</strong>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`btn btn-sm ${!isFin ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDim('fisico')}>Físico</button>
          <button className={`btn btn-sm ${isFin ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDim('financeiro')}>Financeiro</button>
        </div>
      </div>
      {erro && <div className="login-error" style={{ marginTop: 6 }}>{erro}</div>}

      {pontos.length === 0 ? (
        <p className="empty" style={{ marginTop: 8 }}>Sem dados. Cadastre medições ou defina as datas de plano da obra.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ marginTop: 8, maxWidth: '100%' }} role="img" aria-label="Curva S">
            {níveis.map((v, k) => (
              <g key={k}>
                <line x1={ML} y1={py(v)} x2={W - MR} y2={py(v)} stroke="var(--border)" strokeWidth="1" />
                <text x={ML - 6} y={py(v) + 3} textAnchor="end" fontSize="10" fill="var(--fg-3)">{rotuloY(v)}</text>
              </g>
            ))}
            {pontos.map((p, i) => (i % passoX === 0 || i === n - 1) && (
              <text key={i} x={px(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="var(--fg-3)">{p.competencia}</text>
            ))}
            {prevPath && <polyline points={prevPath} fill="none" stroke="var(--fg-3)" strokeWidth="1.5" strokeDasharray="5 4" />}
            {realPath && <polyline points={realPath} fill="none" stroke={corReal} strokeWidth="2" />}
            {pontos.map((p, i) => (p[realKey] != null ? <circle key={i} cx={px(i)} cy={py(p[realKey])} r="2.5" fill={corReal} /> : null))}
          </svg>

          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', fontSize: 12, color: 'var(--fg-3)', marginTop: 4 }}>
            <span><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--fg-3)" strokeWidth="1.5" strokeDasharray="5 4" /></svg> Previsto</span>
            <span><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke={corReal} strokeWidth="2" /></svg> Realizado{estouro ? ' (estouro > 100%)' : ''}</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
              <th>Competência</th><th>Físico prev.</th><th>Físico real.</th><th>Financ. prev.</th><th>Financ. real.</th>
            </tr></thead>
            <tbody>
              {pontos.map((p) => (
                <tr key={p.competencia} style={{ borderTop: '1px solid var(--border)' }}>
                  <td>{p.competencia}</td>
                  <td>{p.prevFisicoPct == null ? '—' : pct(p.prevFisicoPct)}</td>
                  <td>{p.realFisicoPct == null ? '—' : pct(p.realFisicoPct)}</td>
                  <td>{brl(p.prevFinanceiro)}</td>
                  <td>{brl(p.realFinanceiro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Origem do previsto / financeiro realizado (transparência) */}
      <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 6 }}>
        {curva && (curva.previstoFonte
          ? `Previsto: ${FONTE_PREV[curva.previstoFonte] || curva.previstoFonte}`
          : 'Previsto: sem base — defina datas de plano da obra ou registre a linha de base.')}
        {curva?.fonteFinanceiroRealizado && ` · Financeiro realizado: ${FONTE_FIN[curva.fonteFinanceiroRealizado]}`}
        {curva?.semBaseFinanceira && ' · sem custo orçado → financeiro em R$ (sem %)'}
        <br />Avanço físico = % acumulado · Desembolso = valor do mês · % financeiro = desembolso acumulado ÷ orçado.
      </div>

      {/* Mini-CRUD de medições */}
      <div style={{ marginTop: 'var(--sp-3)' }}>
        <strong style={{ fontSize: 12 }}>Medições {editId ? '· editando' : ''}</strong>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
            <th>Competência</th><th>Fís. real %</th><th>Desemb. R$</th><th>Fís. prev %</th><th>Desemb. prev R$</th><th></th>
          </tr></thead>
          <tbody>
            {medicoes.map((m) => (
              <tr key={m.id} style={{ borderTop: '1px solid var(--border)', background: editId === m.id ? 'var(--bg-subtle)' : 'transparent' }}>
                <td>{m.competencia}</td>
                <td>{m.avancoFisicoPct == null ? '—' : pct(m.avancoFisicoPct)}</td>
                <td>{brl(m.desembolso)}</td>
                <td>{m.avancoPlanPct == null ? '—' : pct(m.avancoPlanPct)}</td>
                <td>{brl(m.desembolsoPlan)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-ghost btn-sm" title="Editar" onClick={() => editar(m)}>✎</button>
                  <button className="btn btn-ghost btn-sm" title="Excluir" onClick={() => remover(m)}>×</button>
                </td>
              </tr>
            ))}
            {medicoes.length === 0 && <tr><td colSpan="6" className="empty">Sem medições.</td></tr>}
          </tbody>
        </table>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, alignItems: 'center' }}>
          <input className="control" style={{ width: 130 }} type="month" value={form.competencia} onChange={setF('competencia')} disabled={!!editId} title={editId ? 'Competência não editável (exclua e recrie)' : 'Competência'} />
          <input className="control" style={{ width: 96 }} type="number" min="0" max="100" step="0.01" placeholder="fís. %" value={form.avancoFisicoPct} onChange={setF('avancoFisicoPct')} />
          <input className="control" style={{ width: 110 }} type="number" min="0" step="0.01" placeholder="desemb. R$" value={form.desembolso} onChange={setF('desembolso')} />
          <label style={{ fontSize: 12, color: 'var(--fg-3)', display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={comBase} onChange={(e) => setComBase(e.target.checked)} /> linha de base (previsto)
          </label>
          {comBase && <input className="control" style={{ width: 96 }} type="number" min="0" max="100" step="0.01" placeholder="prev. fís. %" value={form.avancoPlanPct} onChange={setF('avancoPlanPct')} />}
          {comBase && <input className="control" style={{ width: 120 }} type="number" min="0" step="0.01" placeholder="prev. desemb. R$" value={form.desembolsoPlan} onChange={setF('desembolsoPlan')} />}
          <button className="btn btn-secondary btn-sm" onClick={salvar} disabled={busy || !podeSalvar}>{editId ? 'Salvar' : '+'}</button>
          {editId && <button className="btn btn-ghost btn-sm" title="Cancelar" onClick={limpar}>✕</button>}
        </div>
      </div>
    </div>
  )
}

export function ObraDetalhe({ obra, onClose, onChanged }) {
  const [etapas, setEtapas] = useState([])
  const [servicos, setServicos] = useState([])
  const [abc, setAbc] = useState([])
  const [anexos, setAnexos] = useState([])
  const [sel, setSel] = useState(null)
  const [itens, setItens] = useState([])
  const [realizados, setRealizados] = useState([])
  const [novaEtapa, setNovaEtapa] = useState({ descricao: '', codigoEap: '' })
  const [novoItem, setNovoItem] = useState(ITEM_VAZIO)
  const [novoReal, setNovoReal] = useState({ competencia: '', valor: '' })
  const [editEtapaId, setEditEtapaId] = useState(null)
  const [editItemId, setEditItemId] = useState(null)
  const [editRealId, setEditRealId] = useState(null)
  const [erro, setErro] = useState(null)

  const recarregar = async () => {
    try {
      const [e, a] = await Promise.all([api.obraEtapas(obra.id), api.curvaAbc(obra.id)])
      setEtapas(e); setAbc(a)
      onChanged && onChanged()
    } catch (ex) { setErro(ex.message) }
  }
  const recarregarEtapa = async (etapaId) => {
    if (!etapaId) { setItens([]); setRealizados([]); return }
    const [i, r] = await Promise.all([api.etapaItens(etapaId), api.etapaRealizados(etapaId)])
    setItens(i); setRealizados(r)
  }
  useEffect(() => {
    api.servicos().then(setServicos).catch(() => {})
    api.obraAnexos(obra.id).then(setAnexos).catch(() => setAnexos([]))
    recarregar()
  }, [obra.id])
  // Ao trocar de etapa, cancela qualquer edição de item/realizado da etapa anterior.
  useEffect(() => {
    cancelarItem(); cancelarReal()
    recarregarEtapa(sel).catch((e) => setErro(e.message))
  }, [sel])

  const acao = async (fn) => { setErro(null); try { await fn() } catch (e) { setErro(e.message) } }

  // ----- Etapas (adicionar/editar) -----
  const cancelarEtapa = () => { setEditEtapaId(null); setNovaEtapa({ descricao: '', codigoEap: '' }) }
  const editarEtapa = (e) => { setEditEtapaId(e.id); setNovaEtapa({ descricao: e.descricao || '', codigoEap: e.codigoEap || '' }) }
  const salvarEtapa = () => acao(async () => {
    if (!novaEtapa.descricao.trim()) return
    const dados = { descricao: novaEtapa.descricao.trim(), codigoEap: novaEtapa.codigoEap.trim() || null }
    if (editEtapaId) await api.updEtapa(editEtapaId, dados)
    else await api.addEtapa(obra.id, dados)
    cancelarEtapa(); await recarregar()
  })

  // ----- Itens (adicionar/editar) -----
  const cancelarItem = () => { setEditItemId(null); setNovoItem(ITEM_VAZIO) }
  const editarItem = (i) => {
    setEditItemId(i.id)
    setNovoItem({
      servicoRefId: i.servicoRefId || '', descricao: i.descricao || '', unidade: i.unidade || '',
      quantidade: String(i.quantidade ?? ''), custoUnitario: String(i.custoUnitario ?? ''), categoriaId: i.categoriaId || '',
    })
  }
  const salvarItem = () => acao(async () => {
    const dados = {
      servicoRefId: novoItem.servicoRefId || null, descricao: novoItem.descricao || null, unidade: novoItem.unidade || null,
      quantidade: Number(novoItem.quantidade), custoUnitario: Number(novoItem.custoUnitario), categoriaId: novoItem.categoriaId || null,
    }
    if (editItemId) await api.updItem(editItemId, dados)
    else await api.addItem(sel, dados)
    cancelarItem(); await recarregarEtapa(sel); await recarregar()
  })
  const escolherServico = (id) => {
    const s = servicos.find((x) => x.id === id)
    setNovoItem((f) => ({ ...f, servicoRefId: id, descricao: s ? s.descricao : f.descricao, unidade: s ? s.unidade : f.unidade }))
  }

  // ----- Realizados (adicionar/editar) -----
  const cancelarReal = () => { setEditRealId(null); setNovoReal({ competencia: '', valor: '' }) }
  const editarReal = (r) => { setEditRealId(r.id); setNovoReal({ competencia: r.competencia || '', valor: String(r.valor ?? '') }) }
  const salvarReal = () => acao(async () => {
    const dados = { competencia: novoReal.competencia, valor: Number(novoReal.valor) }
    if (editRealId) await api.updRealizado(editRealId, dados)
    else await api.addRealizado(sel, dados)
    cancelarReal(); await recarregarEtapa(sel); await recarregar()
  })

  return (
    <section className="card" style={{ padding: 'var(--sp-4)', marginTop: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="eyebrow">EAP e custos — {obra.codigo} · {obra.nome}</div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Fechar</button>
      </div>
      {erro && <div className="login-error">{erro}</div>}

      <AtualizacaoMonetaria obra={obra} />
      <CurvaS obra={obra} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginTop: 'var(--sp-3)' }}>
        {/* Etapas */}
        <div>
          <strong style={{ fontSize: 13 }}>Etapas (EAP)</strong>
          <div style={{ maxHeight: 340, overflow: 'auto', marginTop: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
              <th>Etapa</th><th>Orçado</th><th>Realizado</th><th>Desvio</th><th></th>
            </tr></thead>
            <tbody>
              {[...etapas].sort(cmpEap).map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--border)', background: sel === e.id || editEtapaId === e.id ? 'var(--bg-subtle)' : 'transparent' }}>
                  <td style={{ paddingLeft: 4 + profEap(e.codigoEap) * 16 }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontWeight: profEap(e.codigoEap) === 0 ? 600 : 400 }} onClick={() => setSel(e.id)}>
                      <span style={{ color: 'var(--fg-3)', marginRight: 6 }}>{e.codigoEap}</span>{e.descricao}
                    </button>
                  </td>
                  <td>{brl(e.custoOrcado)}</td><td>{brl(e.custoReal)}</td>
                  <td>{desvioPct(e.custoOrcado, e.custoReal)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" title="Editar" onClick={() => editarEtapa(e)}>✎</button>
                    <button className="btn btn-ghost btn-sm" title="Excluir" onClick={() => acao(async () => { await api.delEtapa(e.id); if (sel === e.id) setSel(null); if (editEtapaId === e.id) cancelarEtapa(); await recarregar() })}>×</button>
                  </td>
                </tr>
              ))}
              {etapas.length === 0 && <tr><td colSpan="5" className="empty">Sem etapas. Adicione abaixo.</td></tr>}
            </tbody>
          </table>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <input className="control" placeholder={editEtapaId ? 'Descrição da etapa' : 'Nova etapa'} value={novaEtapa.descricao} onChange={(e) => setNovaEtapa((f) => ({ ...f, descricao: e.target.value }))} />
            <input className="control" placeholder="cód. EAP" style={{ width: 90 }} value={novaEtapa.codigoEap} onChange={(e) => setNovaEtapa((f) => ({ ...f, codigoEap: e.target.value }))} />
            <button className="btn btn-secondary btn-sm" onClick={salvarEtapa} disabled={!novaEtapa.descricao.trim()}>{editEtapaId ? 'Salvar' : '+'}</button>
            {editEtapaId && <button className="btn btn-ghost btn-sm" title="Cancelar" onClick={cancelarEtapa}>✕</button>}
          </div>
        </div>

        {/* Curva ABC */}
        <div>
          <strong style={{ fontSize: 13 }}>Curva ABC</strong>
          <div style={{ maxHeight: 340, overflow: 'auto', marginTop: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
              <th>Item</th><th>Custo</th><th>%</th><th>Acum.</th><th>Classe</th>
            </tr></thead>
            <tbody>
              {abc.map((i) => (
                <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td title={i.descricao || ''}>{corta(i.descricao || '—', 46)}</td><td>{brl(i.custoTotal)}</td><td>{i.pct}%</td><td>{i.pctAcumulado}%</td>
                  <td><span className="chip" style={{ background: classeCor(i.classe), color: '#fff' }}>{i.classe}</span></td>
                </tr>
              ))}
              {abc.length === 0 && <tr><td colSpan="5" className="empty">Sem itens orçados ainda.</td></tr>}
            </tbody>
          </table>
          </div>

          {/* Anexos (RF-B06 / US-18) — download via ?token= (ver api.anexoUrl) */}
          <strong style={{ fontSize: 13, display: 'block', marginTop: 'var(--sp-4)' }}>Anexos</strong>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
              <th>Arquivo</th><th>Tamanho</th><th>Data</th><th></th>
            </tr></thead>
            <tbody>
              {anexos.map((a) => (
                <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td title={a.filename || ''}>{corta(a.filename || '—', 42)}</td>
                  <td>{fmtBytes(a.sizeBytes)}</td><td>{a.createdAt || '—'}</td>
                  <td><a className="btn btn-ghost btn-sm" href={api.anexoUrl(a.id)}>Baixar</a></td>
                </tr>
              ))}
              {anexos.length === 0 && <tr><td colSpan="4" className="empty">Sem anexos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Itens + realizados da etapa selecionada */}
      {sel && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginTop: 'var(--sp-4)' }}>
          <div>
            <strong style={{ fontSize: 13 }}>Itens de custo (orçado)</strong>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
                <th>Descrição</th><th>Un.</th><th>Qtd.</th><th>C. unit.</th><th>Total</th><th></th>
              </tr></thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id} style={{ borderTop: '1px solid var(--border)', background: editItemId === i.id ? 'var(--bg-subtle)' : 'transparent' }}>
                    <td>{i.descricao || '—'}</td><td>{i.unidade || '—'}</td><td>{i.quantidade}</td>
                    <td>{brl(i.custoUnitario)}</td><td>{brl(i.custoTotal)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" title="Editar" onClick={() => editarItem(i)}>✎</button>
                      <button className="btn btn-ghost btn-sm" title="Excluir" onClick={() => acao(async () => { await api.delItem(i.id); if (editItemId === i.id) cancelarItem(); await recarregarEtapa(sel); await recarregar() })}>×</button>
                    </td>
                  </tr>
                ))}
                {itens.length === 0 && <tr><td colSpan="6" className="empty">Sem itens.</td></tr>}
              </tbody>
            </table>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 60px 80px auto', gap: 4, marginTop: 6 }}>
              <select className="control" value={novoItem.servicoRefId} onChange={(e) => escolherServico(e.target.value)}>
                <option value="">{novoItem.descricao ? novoItem.descricao : 'serviço…'}</option>{servicos.map((s) => <option key={s.id} value={s.id}>{s.descricao}</option>)}
              </select>
              <input className="control" placeholder="un." value={novoItem.unidade} onChange={(e) => setNovoItem((f) => ({ ...f, unidade: e.target.value }))} />
              <input className="control" type="number" placeholder="qtd" value={novoItem.quantidade} onChange={(e) => setNovoItem((f) => ({ ...f, quantidade: e.target.value }))} />
              <input className="control" type="number" placeholder="R$/un" value={novoItem.custoUnitario} onChange={(e) => setNovoItem((f) => ({ ...f, custoUnitario: e.target.value }))} />
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-secondary btn-sm" onClick={salvarItem} disabled={!(Number(novoItem.quantidade) > 0 && Number(novoItem.custoUnitario) > 0)}>{editItemId ? 'Salvar' : '+'}</button>
                {editItemId && <button className="btn btn-ghost btn-sm" title="Cancelar" onClick={cancelarItem}>✕</button>}
              </div>
            </div>
          </div>

          <div>
            <strong style={{ fontSize: 13 }}>Custos realizados</strong>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
                <th>Competência</th><th>Valor</th><th></th>
              </tr></thead>
              <tbody>
                {realizados.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)', background: editRealId === r.id ? 'var(--bg-subtle)' : 'transparent' }}>
                    <td>{r.competencia}</td><td>{brl(r.valor)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" title="Editar" onClick={() => editarReal(r)}>✎</button>
                      <button className="btn btn-ghost btn-sm" title="Excluir" onClick={() => acao(async () => { await api.delRealizado(r.id); if (editRealId === r.id) cancelarReal(); await recarregarEtapa(sel); await recarregar() })}>×</button>
                    </td>
                  </tr>
                ))}
                {realizados.length === 0 && <tr><td colSpan="3" className="empty">Sem lançamentos.</td></tr>}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              <input className="control" type="date" value={novoReal.competencia} onChange={(e) => setNovoReal((f) => ({ ...f, competencia: e.target.value }))} />
              <input className="control" type="number" placeholder="valor R$" value={novoReal.valor} onChange={(e) => setNovoReal((f) => ({ ...f, valor: e.target.value }))} />
              <button className="btn btn-secondary btn-sm" onClick={salvarReal} disabled={!(novoReal.competencia && Number(novoReal.valor) > 0)}>{editRealId ? 'Salvar' : '+'}</button>
              {editRealId && <button className="btn btn-ghost btn-sm" title="Cancelar" onClick={cancelarReal}>✕</button>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
