# 08 — Setup de desenvolvimento (branch do Neon)

Como rodar o módulo localmente **sem risco** para o sistema em produção: todo o
desenvolvimento acontece em uma **branch do Neon** (cópia isolada do banco).

## Pré-requisitos

- Node.js 18+ e npm.
- Acesso ao projeto do banco no **Neon** (console).
- (Opcional) `psql` para aplicar as migrations pela linha de comando.

## Passo 1 — Criar a branch de dev no Neon

No console do Neon: **Branches → New branch** (a partir da branch principal/produção).
A branch é uma cópia *copy-on-write* — já vem com todos os dados, **incluindo
`public.users`**, então o login funciona com as contas Promav existentes.

Copie a **connection string com pooler** (recomendada): `...-pooler...neon.tech...`.

> Por que branch: nada do que você fizer aqui afeta a produção. Você só promove as
> mudanças quando quiser, rodando as mesmas migrations no banco principal.

## Passo 2 — Configurar variáveis

```bash
cp .env.example .env
```

No `.env`:

- `DATABASE_URL` → a connection string **da branch** (com `-pooler` e `?sslmode=require`).
- `JWT_SECRET` → **o mesmo segredo do app Promav** (assim o login é compatível).
- `PORT=3001`, `CORS_ORIGIN=http://localhost:5173`, `VITE_API_URL=` (vazio em dev).

## Passo 3 — Aplicar as migrations na branch

Pelo terminal:

```bash
psql "$DATABASE_URL" -f db/migrations/001_orcamento_schema.sql
psql "$DATABASE_URL" -f db/migrations/002_seeds_referencia.sql
```

Ou cole o conteúdo dos arquivos no **SQL Editor** do Neon (com a branch selecionada).
As migrations criam **apenas** o schema `orcamento` — não alteram nenhuma tabela do app.

## Passo 4 — Rodar

```bash
npm install
npm run dev
```

- Web (Vite): http://localhost:5173 — abre automaticamente.
- API (Express): http://localhost:3001 — o Vite faz proxy de `/api`.
- Faça login com uma **conta Promav existente** (presente na branch).

Teste rápido da API:

```bash
curl http://localhost:3001/api/health      # { ok: true, now: ... }
```

## Segurança (resumo)

- **Nunca** use a `DATABASE_URL` de produção no `.env` de dev.
- Mantenha o pool pequeno (o `pg` já usa pool; o serviço é leve).
- Backup/rollback: a própria branch serve de isolamento; o Neon ainda oferece
  *restore* por ponto no tempo no banco principal.

## Promover para produção (quando o MVP estiver pronto)

1. Rodar `001` e `002` no **banco principal** (criam só o schema `orcamento`).
2. Criar no **Render** um novo **Web Service** (API) e **Static Site** (front),
   com `DATABASE_URL` de produção, o **mesmo `JWT_SECRET`** e `CORS_ORIGIN` do domínio.
3. Apontar `VITE_API_URL` do front para a URL da API.

> Detalhes de arquitetura e integração: [doc 06](./06-arquitetura-integracao.md).

---

⬅️ [07 — Backlog do MVP](./07-backlog-mvp.md) · 🏠 [Índice](../README.md)
