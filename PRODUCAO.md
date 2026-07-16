# PRODUCAO.md — runbook para levar o módulo à produção

> **Regra de ouro: nunca escrever num banco sem sondar antes.** Uma connection string de
> **produção** já circulou aqui como se fosse de dev; um `npm run migrate` teria criado o schema
> inteiro no banco do app Promav. Este runbook e as travas abaixo existem para que isso não
> possa se repetir.

**Estado hoje:** migrations **001→013** aplicadas **só na branch de dev** (`ep-restless-dawn…`).
**A produção nunca foi migrada.** O módulo nunca foi publicado.

---

## Ferramentas de segurança (já no repo)

| Comando | O que faz |
|---|---|
| `npm run sonda` | **Somente leitura.** Diz para qual host/db a `DATABASE_URL` aponta, se o schema `orcamento` existe, se `public.users` (o app) existe, quantas obras/usuários há e quais migrations já passaram. Termina com um **veredito**. Nunca escreve. |
| `DB_BRANCH_ESPERADA` (no `.env`) | **Trava do `npm run migrate`.** Trecho que precisa aparecer no host da `DATABASE_URL`. Se não bater, o migrate **recusa rodar**. Apontar para o banco errado deixa de ser "improvável" e passa a exigir uma edição consciente do `.env`. |

O veredito da sonda que **exige parar e pensar**:

```
⚠️  ATENÇÃO: tem o app (public.users) e NÃO tem o schema do módulo.
    Isto tem CARA DE PRODUÇÃO (ou de uma branch nova ainda não migrada).
```

---

## Passo a passo

### 0. Backup (2 min, e é o seu rollback)

No console do Neon, **crie uma branch a partir da produção** (`main`). No Neon isso é instantâneo
e serve tanto de snapshot quanto de ambiente de ensaio. Anote o nome — ex.: `pre-migracao-modulo`.
(Alternativa: confirmar que o PITR/restore da prod está ativo e qual é a janela.)

> ⚠️ Para a **migração real**, crie uma branch de backup **nova e intocada**. A branch do ensaio de
> 15/07 **não serve de rollback** — ela já foi migrada (tem o schema `orcamento`), então restaurar a
> partir dela reintroduziria as tabelas. O rollback tem que ser um retrato da prod **antes** de
> qualquer migração.

### 1. Ensaio geral na cópia da produção (obrigatório)

Não migre a produção direto. **Migre primeiro a cópia** — ela tem exatamente os dados reais do
app, que a dev não tem.

```bash
# .env apontando para a BRANCH-CÓPIA da produção.
# NUNCA cole a senha real aqui — este arquivo é versionado. Pegue a string no Neon
# (branch → Connect → Pooled) e mantenha-a só no .env, que é ignorado pelo git.
DATABASE_URL=<connection string da branch de backup/ensaio>   # ex.: postgresql://neondb_owner:<SENHA>@ep-xxxx-yyyy-pooler.<região>.aws.neon.tech/neondb?sslmode=require
DB_BRANCH_ESPERADA=<trecho do host dessa branch>              # ex.: ep-xxxx-yyyy

npm run sonda        # deve dizer: tem app, NÃO tem schema do módulo  → é o cenário da prod
npm run migrate      # 001→013
npm run sonda        # agora deve dizer: schema do módulo presente, 013 = sim
```

Confira que **nada do app foi tocado**: `public.users` com a mesma contagem de antes, e o app
subindo normalmente contra essa branch. As migrations do módulo só criam/alteram objetos em
`orcamento` — elas **não escrevem em `public`** (a identidade é lida em modo somente-leitura).

### 2. Migrar a produção

Só depois que o ensaio passou:

```bash
DATABASE_URL=<connection string da PRODUÇÃO>
DB_BRANCH_ESPERADA=<trecho do host de PRODUÇÃO>    # edição CONSCIENTE — é a trava

npm run sonda        # leia o veredito. Confirme que é o banco que você quer.
npm run migrate
npm run sonda        # confirme: 19 objetos em orcamento, 013 = sim
```

Janela: fora do horário de uso. As migrations são rápidas (criam schema vazio), mas 006/007/009
fazem `UPDATE`/dedup em `orcamento.obras` — que na produção estará **vazia**, então são no-op.

### 3. Rollback

Se algo der errado: no Neon, **restaure a produção a partir da branch de backup** (passo 0) ou
use PITR. Como o módulo vive num schema isolado, o pior caso também aceita
`DROP SCHEMA orcamento CASCADE;` — o app Promav não referencia nada lá dentro.

---

## Checklist de JWT (SSO com o app) — pendente

O `render.yaml` do app usa `JWT_SECRET: generateValue: true` → **o segredo de produção existe só
no dashboard do Render**, não no código.

1. Render → serviço **`promav-api`** → **Environment** → copiar o valor de `JWT_SECRET`.
2. No serviço do **módulo**, definir **o mesmo valor**.
3. **Nunca** usar `generateValue: true` no módulo — geraria um segredo diferente e o login do app
   não valeria no módulo. Use `sync: false` e cole o valor.
4. Em dev, o `.env` do módulo **já está alinhado** com o `.env` do app (feito em 13/07), então os
   logins locais já são compatíveis.

> O formato do token já é compatível: os dois assinam `{ sub: user.id }` e leem `payload.sub`.
> Só o segredo precisava bater.

## Rotação da credencial do Neon — ✅ feita em 2026-07-15 (runbook para as próximas)

A senha do banco havia circulado em texto claro (em `.env` e handoffs). A rotação da **produção**
foi feita em 15/07; a senha vazada **não abre mais a prod**. Guia para repetir (ou rotacionar
outras branches):

> ⚠️ **RESETAR A SENHA DERRUBA O APP AO VIVO.** É uma operação **coordenada, em janela** — não a
> faça no meio do expediente. No momento em que a senha muda no Neon, o serviço que ainda usa a
> senha antiga (o `promav-api` no Render) **para de conectar** e o app cai (visto em 15/07:
> `/api/health` deu `UND_ERR_SOCKET`, **não** era cold start). O app **só volta** depois que você
> atualiza a `DATABASE_URL` no Render — aí o `/api/health` responde `200 {ok:true}` de novo (o
> `SELECT now()` reconectou). Tenha o novo valor **em mãos** antes de resetar, para o intervalo de
> queda ser de segundos.

1. Neon → **Roles** → resetar a senha do role da aplicação (`neondb_owner`). **Copie a nova senha.**
2. **Imediatamente** atualizar a `DATABASE_URL` (com a senha nova) no **Render → `promav-api` →
   Environment** — é isso que reergue o app. Depois, atualizar também: `.env` local do app,
   e — quando o módulo estiver publicado — a `DATABASE_URL` do serviço do módulo no Render.
3. Confirmar: `/api/health` do app → `200 {ok:true}`, e `npm run sonda` conecta.

> **O reset é por branch.** Medido em 15/07: resetar a senha da `main` (prod) **não** derrubou a
> conexão da branch de **dev** (`ep-restless-dawn`) — ela seguiu com a senha antiga. Rotacionar a
> dev é opcional (branch interna); se fizer, atualize o `.env` local do módulo também.

## Publicar o módulo — `render.yaml` (pronto)

O `render.yaml` do módulo **já está no repositório**. Render → **New +** → **Blueprint** →
conecte este repositório. Ele cria dois serviços:

| Serviço | O quê |
|---|---|
| `promav-orcamento-api` | Web Service Node · `node server/index.js` · health `/api/health` · região **oregon** (mesma do Neon) |
| `promav-orcamento-web` | Static Site · `npm install --include=dev && npm run build` → `./dist` · rewrite SPA |

O Render vai pedir os 4 valores marcados como `sync: false`:

1. **`DATABASE_URL`** (na API) — **o MESMO banco do app**, não um separado. O módulo vive no schema
   isolado `orcamento` e **lê `public.users`** (só leitura) para reaproveitar o login. Use a string
   com `-pooler`. **Migre o banco antes do primeiro deploy** (passos 0–2 acima).
2. **`JWT_SECRET`** (na API) — **cole o mesmo valor do serviço `promav-api`** (Render → promav-api →
   Environment). **Não** use `generateValue: true`: geraria um segredo diferente e o token do app
   não valeria no módulo.
3. **`CORS_ORIGIN`** (na API) — a URL do site, ex.: `https://promav-orcamento-web.onrender.com`.
4. **`VITE_API_URL`** (no site) — a URL da API, ex.: `https://promav-orcamento-api.onrender.com`.
   O Vite **embute** isso no bundle em tempo de build — mudar depois exige rebuild.

Detalhes já resolvidos no arquivo (verificados rodando):

- **Não define `API_PORT`** de propósito: o código usa `API_PORT || PORT || 3001`, e o Render injeta
  `PORT`. Definir `API_PORT` faria o serviço subir na porta errada e o deploy falharia. *(Testado:
  sem `API_PORT`, o servidor sobe na porta injetada.)*
- **`/api/health` é público** (fica antes do gate de autenticação) — o health check do Render passa
  sem token, enquanto `/api/obras` devolve 401. *(Testado.)*
- **`NODE_ENV=production` + `JWT_SECRET` ausente → o servidor ABORTA no boot** (guard fatal). É
  proposital: sem isso o `auth.js` cairia num segredo padrão público. *(Testado.)*
- **As migrations NÃO rodam no deploy** (`buildCommand` é só `npm install`). Aplicar migration em
  build escreveria no banco sem sonda e sem janela — migre à mão pelos passos acima.

---

## Variáveis de ambiente (valores exatos)

Os 4 valores que o Render pede (`sync: false`). Defina-os no serviço indicado:

| Variável | Serviço | Valor exato (exemplo) | Cuidado |
|---|---|---|---|
| `DATABASE_URL` | `promav-orcamento-api` | `postgresql://<user>:<senha>@<host>-pooler.<região>.aws.neon.tech/neondb?sslmode=require` | **O MESMO banco do app** (schema `orcamento` + lê `public.users`). Use o host **com** `-pooler`. Migre 001→013 antes do 1º deploy. |
| `JWT_SECRET` | `promav-orcamento-api` | *(copie de Render → `promav-api` → Environment → `JWT_SECRET`)* | **Idêntico ao do app**, senão o SSO quebra. **Nunca** `generateValue: true` aqui. |
| `CORS_ORIGIN` | `promav-orcamento-api` | `https://promav-orcamento-web.onrender.com` | A URL do site (sem barra no fim). Vazio = libera todas as origens. |
| `VITE_API_URL` | `promav-orcamento-web` | `https://promav-orcamento-api.onrender.com` | Embutido no bundle **no build** → mudar depois exige **rebuild** do site. |

Fixos/automáticos (não precisa mexer): `NODE_ENV=production` (já no `render.yaml`), `PORT` (o Render
injeta — **não** defina `API_PORT`). Opcionais: `INTEGRACAO_API_KEY` (liga `/api/integracao/*`),
`ANEXO_UPLOAD_MAX_MB` (default 25).

> **Ordem que evita retrabalho:** os dois serviços referenciam a URL um do outro. Faça o **deploy da
> API primeiro** para saber a URL dela → preencha `VITE_API_URL` no site → quando o site tiver URL,
> volte e preencha `CORS_ORIGIN` na API. (Ou deixe `CORS_ORIGIN` vazio no 1º deploy e trave depois.)

## Smoke-test pós-deploy (`npm run smoke`)

Assim que publicar, rode contra as **URLs públicas** para ter certeza de que subiu certo. O script
(`scripts/smoke_deploy.mjs`) **não usa o `.env` local** e **nunca imprime senha/token**:

```bash
API_URL=https://promav-orcamento-api.onrender.com \
WEB_URL=https://promav-orcamento-web.onrender.com \
SMOKE_EMAIL=engenharia.promav@gmail.com \
SMOKE_PASSWORD='<sua senha do app>' \
APP_API_URL=https://promav-api.onrender.com \
npm run smoke
```

O que ele verifica (o que faltar credencial é **pulado**, não falha):

1. `GET /api/health` → `200 {ok:true, now}` — a API subiu e o **banco responde**. (Espera até 90s pelo
   *cold start* do plano free.)
2. `GET /api/obras` sem token → **401** — o gate de autenticação está ativo.
3. **CORS** reflete a origem do site.
4. **Login real** (`SMOKE_EMAIL`/`SMOKE_PASSWORD`) → `me` → lista de obras: prova auth + banco + hash.
5. **SSO** (se `APP_API_URL`): faz login **no app** e usa esse token **no módulo** — prova que o
   `JWT_SECRET` dos dois bate. É o teste que confirma o passo do JWT.
6. O **site** responde `200` com o HTML da SPA.

Sai com código ≠ 0 se qualquer check falhar (dá para usar em CI). *(Já testei o script contra um
servidor local: health/gate/CORS passam e uma URL inacessível vira um `✗` limpo, sem derrubar o
script.)*

---

## Ordem recomendada

1. ~~**Rotacionar a credencial do Neon**~~ — ✅ **feito em 15/07** (a senha vazada não abre mais a prod).
2. ~~**Ensaio da migração** numa cópia real da prod~~ — ✅ **feito em 15/07** (001→013 limpa +
   idempotente, `public.users` intacto). A migração está **validada**.
3. **Migrar a produção de verdade** (passos 0–2): backup **novo** → `.env` na prod (senha **nova**)
   → `sonda` → `migrate` → `sonda`. *(Falta.)*
4. **Publicar** o módulo (`render.yaml` + os 4 `sync:false`, JWT **idêntico** ao do app) → **`npm run
   smoke`** para confirmar. *(Falta.)*
5. Só então: carregar mais orçamentos e a série SINAPI — com o módulo no ar, cada obra nova já
   melhora a estimativa para quem usa.
