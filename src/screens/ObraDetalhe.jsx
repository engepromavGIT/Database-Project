import React, { useEffect, useState } from 'react'
import { api } from '../data/api.js'
import { brl } from '../data/format.js'

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

export function ObraDetalhe({ obra, onClose, onChanged }) {
  const [etapas, setEtapas] = useState([])
  const [servicos, setServicos] = useState([])
  const [abc, setAbc] = useState([])
  const [sel, setSel] = useState(null)
  const [itens, setItens] = useState([])
  const [realizados, setRealizados] = useState([])
  const [novaEtapa, setNovaEtapa] = useState({ descricao: '', codigoEap: '' })
  const [novoItem, setNovoItem] = useState({ servicoRefId: '', descricao: '', unidade: '', quantidade: '', custoUnitario: '' })
  const [novoReal, setNovoReal] = useState({ competencia: '', valor: '' })
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
  useEffect(() => { api.servicos().then(setServicos).catch(() => {}); recarregar() }, [obra.id])
  useEffect(() => { recarregarEtapa(sel).catch((e) => setErro(e.message)) }, [sel])

  const acao = async (fn) => { setErro(null); try { await fn() } catch (e) { setErro(e.message) } }

  const addEtapa = () => acao(async () => {
    if (!novaEtapa.descricao.trim()) return
    await api.addEtapa(obra.id, { descricao: novaEtapa.descricao.trim(), codigoEap: novaEtapa.codigoEap.trim() || null })
    setNovaEtapa({ descricao: '', codigoEap: '' }); await recarregar()
  })
  const addItem = () => acao(async () => {
    await api.addItem(sel, {
      servicoRefId: novoItem.servicoRefId || null, descricao: novoItem.descricao || null, unidade: novoItem.unidade || null,
      quantidade: Number(novoItem.quantidade), custoUnitario: Number(novoItem.custoUnitario),
    })
    setNovoItem({ servicoRefId: '', descricao: '', unidade: '', quantidade: '', custoUnitario: '' })
    await recarregarEtapa(sel); await recarregar()
  })
  const addReal = () => acao(async () => {
    await api.addRealizado(sel, { competencia: novoReal.competencia, valor: Number(novoReal.valor) })
    setNovoReal({ competencia: '', valor: '' }); await recarregarEtapa(sel); await recarregar()
  })
  const escolherServico = (id) => {
    const s = servicos.find((x) => x.id === id)
    setNovoItem((f) => ({ ...f, servicoRefId: id, descricao: s ? s.descricao : f.descricao, unidade: s ? s.unidade : f.unidade }))
  }

  return (
    <section className="card" style={{ padding: 'var(--sp-4)', marginTop: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="eyebrow">EAP e custos — {obra.codigo} · {obra.nome}</div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Fechar</button>
      </div>
      {erro && <div className="login-error">{erro}</div>}

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
                <tr key={e.id} style={{ borderTop: '1px solid var(--border)', background: sel === e.id ? 'var(--bg-subtle)' : 'transparent' }}>
                  <td style={{ paddingLeft: 4 + profEap(e.codigoEap) * 16 }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontWeight: profEap(e.codigoEap) === 0 ? 600 : 400 }} onClick={() => setSel(e.id)}>
                      <span style={{ color: 'var(--fg-3)', marginRight: 6 }}>{e.codigoEap}</span>{e.descricao}
                    </button>
                  </td>
                  <td>{brl(e.custoOrcado)}</td><td>{brl(e.custoReal)}</td>
                  <td>{desvioPct(e.custoOrcado, e.custoReal)}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => acao(async () => { await api.delEtapa(e.id); if (sel === e.id) setSel(null); await recarregar() })}>×</button></td>
                </tr>
              ))}
              {etapas.length === 0 && <tr><td colSpan="5" className="empty">Sem etapas. Adicione abaixo.</td></tr>}
            </tbody>
          </table>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <input className="control" placeholder="Nova etapa" value={novaEtapa.descricao} onChange={(e) => setNovaEtapa((f) => ({ ...f, descricao: e.target.value }))} />
            <input className="control" placeholder="cód. EAP" style={{ width: 90 }} value={novaEtapa.codigoEap} onChange={(e) => setNovaEtapa((f) => ({ ...f, codigoEap: e.target.value }))} />
            <button className="btn btn-secondary btn-sm" onClick={addEtapa}>+</button>
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
                  <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td>{i.descricao || '—'}</td><td>{i.unidade || '—'}</td><td>{i.quantidade}</td>
                    <td>{brl(i.custoUnitario)}</td><td>{brl(i.custoTotal)}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => acao(async () => { await api.delItem(i.id); await recarregarEtapa(sel); await recarregar() })}>×</button></td>
                  </tr>
                ))}
                {itens.length === 0 && <tr><td colSpan="6" className="empty">Sem itens.</td></tr>}
              </tbody>
            </table>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 60px 80px auto', gap: 4, marginTop: 6 }}>
              <select className="control" value={novoItem.servicoRefId} onChange={(e) => escolherServico(e.target.value)}>
                <option value="">serviço…</option>{servicos.map((s) => <option key={s.id} value={s.id}>{s.descricao}</option>)}
              </select>
              <input className="control" placeholder="un." value={novoItem.unidade} onChange={(e) => setNovoItem((f) => ({ ...f, unidade: e.target.value }))} />
              <input className="control" type="number" placeholder="qtd" value={novoItem.quantidade} onChange={(e) => setNovoItem((f) => ({ ...f, quantidade: e.target.value }))} />
              <input className="control" type="number" placeholder="R$/un" value={novoItem.custoUnitario} onChange={(e) => setNovoItem((f) => ({ ...f, custoUnitario: e.target.value }))} />
              <button className="btn btn-secondary btn-sm" onClick={addItem} disabled={!(Number(novoItem.quantidade) > 0 && Number(novoItem.custoUnitario) > 0)}>+</button>
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
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td>{r.competencia}</td><td>{brl(r.valor)}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => acao(async () => { await api.delRealizado(r.id); await recarregarEtapa(sel); await recarregar() })}>×</button></td>
                  </tr>
                ))}
                {realizados.length === 0 && <tr><td colSpan="3" className="empty">Sem lançamentos.</td></tr>}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              <input className="control" type="date" value={novoReal.competencia} onChange={(e) => setNovoReal((f) => ({ ...f, competencia: e.target.value }))} />
              <input className="control" type="number" placeholder="valor R$" value={novoReal.valor} onChange={(e) => setNovoReal((f) => ({ ...f, valor: e.target.value }))} />
              <button className="btn btn-secondary btn-sm" onClick={addReal} disabled={!(novoReal.competencia && Number(novoReal.valor) > 0)}>+</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
