# Handoff (Cowork → Claude Code) — 2026-07-08

Duas mudanças **já aplicadas** por uma análise no Cowork, prontas para você
**verificar e commitar**. Base: commit `9d5c080` (*Fix /api/analogas: NULLIF…*).
Não toquei no app Promav (`public.*`), no schema `orcamento`, nem em migrations.

---

## Contexto (por quê)

Durante a análise de "próximo passo", varri o padrão do bug
`COALESCE(custo_real_total, …)` (o mesmo do fix do `/api/analogas`) e revisei o
tratamento de anexos. Dois achados viraram código:

1. **Bug de exibição no Acervo — mesma família do NULLIF, só que no front.**
   O driver `pg` devolve `numeric` como **string**, então para obras importadas
   `custoRealTotal` chega como `"0.00"` (que é *truthy*). O fallback
   `custoRealTotal || custoOrcadoTotal` **nunca disparava** → a coluna "Custo"
   mostrava **R$ 0,00** nas 4 obras importadas em vez do valor orçado.
   (O servidor já embrulha todo número em `Number(...)` justamente porque sabe
   que vêm como string; o front tinha ficado de fora nesse ponto.)

2. **Anexos eram "só escrita".** Os PDFs vão para `orcamento.anexos` (bytea) no
   ETL, mas **não havia nenhum endpoint de leitura** — nem listar, nem baixar.
   A história US-18 não estava ligada à API.

---

## Mudanças aplicadas

### 1. `src/screens/Acervo.jsx` — fallback numérico na coluna "Custo"

```diff
-                    <td>{brl(o.custoRealTotal || o.custoOrcadoTotal)}</td>
+                    <td>{brl(Number(o.custoRealTotal) > 0 ? o.custoRealTotal : o.custoOrcadoTotal)}</td>
```

`"0.00"` (string) agora cai corretamente no orçado; obra manual com realizado
continua mostrando o realizado; obra manual sem realizado (`null`) já caía no
orçado e continua caindo.

### 2. `server/obraDetalhe.js` — caminho de LEITURA de anexos (2 endpoints)

Adicionados dentro de `registrarObraDetalhe(app)`, no mesmo padrão das demais
rotas (`requireAuth` + `wrap`):

- `GET /api/obras/:id/anexos` — lista os metadados (`id, filename, mimeType,
  sizeBytes, createdAt`), **sem** trazer o binário.
- `GET /api/anexos/:id` — baixa o binário. Seta `Content-Type` e
  `Content-Disposition`; o `requireAuth` já aceita `?token=` (ver `auth.js`),
  então funciona por `<a href="/api/anexos/ID?token=…">`. O `bytea` volta do
  `pg` como Buffer e é enviado com `res.send`.

```diff
@@ export function registrarObraDetalhe(app) {  (após o bloco da curva-abc)
     res.json(curvaABC(itens.map((i) => ({ id: i.id, descricao: i.descricao, custoTotal: Number(i.custoTotal) }))))
   }))
+
+  // ----- Anexos da obra (RF-B06 / US-18): caminho de LEITURA -----
+  // Lista os metadados dos anexos de uma obra (sem trazer o binário).
+  app.get('/api/obras/:id/anexos', requireAuth, wrap(async (req, res) => {
+    res.json(await q(
+      `SELECT id, filename, mime_type AS "mimeType", size_bytes AS "sizeBytes",
+              to_char(created_at, 'YYYY-MM-DD') AS "createdAt"
+       FROM orcamento.anexos WHERE obra_id = $1 ORDER BY created_at`, [req.params.id]))
+  }))
+
+  // Baixa o binário de um anexo. O requireAuth aceita ?token= (ver auth.js),
+  // então funciona por <a href="/api/anexos/ID?token=...">. O bytea volta como Buffer.
+  app.get('/api/anexos/:id', requireAuth, wrap(async (req, res) => {
+    const [a] = await q(
+      'SELECT filename, mime_type AS "mimeType", data FROM orcamento.anexos WHERE id = $1',
+      [req.params.id])
+    if (!a) return res.status(404).json({ error: 'Anexo não encontrado.' })
+    const nome = (a.filename || 'anexo').replace(/["\r\n]/g, '')
+    res.setHeader('Content-Type', a.mimeType || 'application/octet-stream')
+    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`)
+    res.send(a.data)
+  }))
 }
```

---

## Como verificar (offline — não precisa de banco)

```
npm install
npm run check   # sintaxe dos 11 módulos (inclui obraDetalhe.js)
npm test        # 6 suítes — esperado: 79 passou, 0 falhou
npm run build   # Vite compila o JSX (inclui Acervo.jsx) — 25 módulos
```

Já rodei os quatro no sandbox do Cowork: **check OK · 79/79 testes · build OK
(25 módulos)**. Sem regressão.

## Como verificar (live — opcional; precisa de `.env` com `DATABASE_URL` da branch dev)

```
npm run dev
# obtenha um JWT (login) — o front guarda em localStorage 'promav-orc-token'
TOKEN=<jwt>
# uma obra com anexos (5602, 6239 e 6220 têm 3 cada):
curl -s "http://localhost:3001/api/obras/<OBRA_ID>/anexos?token=$TOKEN"
curl -s "http://localhost:3001/api/anexos/<ANEXO_ID>?token=$TOKEN" -o anexo.pdf
```

> MAPP-6219 (07 Praças) tem **0 anexos** (o PDF de 38 MB estourou o cap — ver
> pendências). No Acervo, confira que as 4 importadas agora mostram o custo
> orçado (ex.: 5602 ≈ R$ 442.678, 6219 ≈ R$ 785.959) em vez de R$ 0,00.

---

## Como commitar

```
git add src/screens/Acervo.jsx server/obraDetalhe.js HANDOFF_2026-07-08_acervo-anexos.md
git commit -m "Acervo: fallback de custo p/ obras importadas + leitura de anexos (GET /api/obras/:id/anexos e /api/anexos/:id)"
git push origin main
```

> Se aparecer erro de `.git/config.lock`: apague `.git\config.lock` (resíduo de
> um clone que falhou no Cowork; inofensivo, mas trava operações de `git config`).

---

## Não incluído aqui (follow-ups sugeridos)

- **UI de anexos:** ligar os endpoints numa aba de `ObraDetalhe.jsx` (listar +
  link de download com `?token=`). Sugestão de cliente em `src/data/api.js`:
  `listAnexos(id)` e um helper `anexoUrl(anexoId)` que anexe o token atual.
- **Anexos grandes (>25 MB) no ETL:** hoje `ANEXO_MAX_MB=25` porque o **pooler
  do Neon** derruba INSERT de bytea grande. Recomendação: gravar anexos grandes
  por **conexão direta** do Neon (host sem `-pooler`) e subir o cap; ou mover os
  binários para **object storage** e guardar só a referência (tornando
  `anexos.data` opcional). O 07 Praças (38 MB) segue só local.
- **Migrations pendentes:** confirmar/aplicar `006`, `007`, `008` na branch dev
  (`npm run migrate`) + F5, para custo/m² no Painel/Acervo. Não dá para checar
  do Cowork (sem `.env`).
- **Cosmético (ETL):** a mensagem final do `--commit` conta anexos da lista, não
  os efetivamente gravados.
- **Opcional (`Comparar.jsx`):** "Custo real" mostra R$ 0,00 para importadas;
  considerar exibir "—".

## Depois

Atualize o `build-check-log.md` com o resultado — é por ele que o Cowork
acompanha o estado entre sessões.
