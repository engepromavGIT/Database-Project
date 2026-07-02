// Curva ABC (RF-D04): ordena itens por participação no custo e classifica.
// Função PURA. Classe por percentual ACUMULADO ANTES do item:
//   A: até 80% · B: 80–95% · C: acima de 95%.

export function curvaABC(itens) {
  const validos = (Array.isArray(itens) ? itens : [])
    .filter((i) => Number(i.custoTotal) > 0)
    .sort((a, b) => Number(b.custoTotal) - Number(a.custoTotal))
  const total = validos.reduce((s, i) => s + Number(i.custoTotal), 0)
  let acc = 0
  return validos.map((i) => {
    const pct = total > 0 ? (Number(i.custoTotal) / total) * 100 : 0
    const inicio = acc
    acc += pct
    const classe = inicio < 80 ? 'A' : inicio < 95 ? 'B' : 'C'
    return {
      ...i,
      pct: Math.round(pct * 100) / 100,
      pctAcumulado: Math.round(acc * 100) / 100,
      classe,
    }
  })
}
