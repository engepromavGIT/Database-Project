# 03 — Requisitos Não Funcionais

RNF descrevem **como** o sistema deve se comportar (qualidade), não o que ele faz.
Onde possível, há uma **meta mensurável**. As metas marcadas como *(a calibrar)* devem
ser confirmadas pela PROMAV conforme o volume real de dados e a infraestrutura.

---

## 1. Desempenho e capacidade

| ID | Requisito | Meta |
|----|-----------|------|
| RNF-01 | Tempo de resposta das telas de consulta/cadastro. | ≤ 2 s para 95% das requisições. |
| RNF-02 | Tempo para gerar uma estimativa (com busca de análogas). | ≤ 5 s para a operação completa. |
| RNF-03 | Volume suportado sem degradação relevante. | Milhares de obras e dezenas de milhares de itens de custo. |
| RNF-04 | Importação de planilha. | Processar uma obra típica (centenas de itens) em segundos; lotes grandes em background. |

## 2. Segurança e privacidade

| ID | Requisito |
|----|-----------|
| RNF-05 | Autenticação **integrada ao sistema atual** (SSO); sem base de senhas paralela. |
| RNF-06 | Autorização baseada em **perfis/papéis** (RBAC); cada ação valida permissão no servidor, não só na interface. |
| RNF-07 | Tráfego sempre por **HTTPS/TLS**; dados sensíveis em repouso protegidos conforme política da empresa. |
| RNF-08 | **Trilha de auditoria** imutável para ações sensíveis (criação/edição/exclusão, exportação, geração de estimativa). |
| RNF-09 | Conformidade com a **LGPD**: tratar dados pessoais de clientes/colaboradores com base legal, mínimo necessário, e suportar exclusão/anonimização quando aplicável. |
| RNF-10 | Segregação de ambientes (desenvolvimento, homologação, produção) e dados de produção não usados em testes sem anonimização. |

## 3. Disponibilidade e confiabilidade

| ID | Requisito | Meta |
|----|-----------|------|
| RNF-11 | Disponibilidade do módulo alinhada à do sistema corporativo. | 99,5% em horário comercial. |
| RNF-12 | **Backup** automatizado da base, com teste periódico de restauração. | Backup diário; RPO ≤ 24 h, RTO ≤ 4 h. |
| RNF-13 | Tratamento de erros previsível: falhas não corrompem dados; operações de carga são transacionais (tudo ou nada por lote). |

## 4. Escalabilidade e manutenção

| ID | Requisito |
|----|-----------|
| RNF-14 | Arquitetura **modular**, permitindo crescer (mais obras, novos métodos de estimativa) sem reescrever o núcleo. |
| RNF-15 | Parâmetros de negócio (índices, BDI, encargos, pesos de similaridade) **configuráveis** sem alteração de código. |
| RNF-16 | Código versionado, com testes automatizados para as regras de cálculo (estimativa e normalização). |
| RNF-17 | Documentação técnica e de API mantidas atualizadas (a base versionada junto ao código — daí a escolha de Markdown). |

## 5. Usabilidade e acessibilidade

| ID | Requisito |
|----|-----------|
| RNF-18 | Interface **responsiva** (desktop e tablet), coerente com o padrão visual do sistema atual. |
| RNF-19 | Fluxos principais (cadastrar obra, importar, estimar) em poucos passos, com validação clara e mensagens em **pt-BR**. |
| RNF-20 | Valores monetários em **BRL**, datas e números no formato brasileiro. |
| RNF-21 | Boas práticas de acessibilidade (contraste, navegação por teclado, rótulos) — referência WCAG 2.1 AA quando viável. |

## 6. Integração e interoperabilidade

| ID | Requisito |
|----|-----------|
| RNF-22 | Integração via **API REST/JSON** (ou o padrão já adotado pelo sistema atual — *a confirmar*). |
| RNF-23 | Reuso dos serviços de **autenticação e cadastro de clientes/usuários** existentes, evitando duplicidade de dados. |
| RNF-24 | Importação/exportação em formatos abertos (Excel/CSV) para conviver com as planilhas atuais. |

## 7. Qualidade de dados

| ID | Requisito |
|----|-----------|
| RNF-25 | Validações de consistência na entrada (totais batem com a soma dos itens; unidades coerentes; datas plausíveis). |
| RNF-26 | Identificação e sinalização de **obras atípicas/outliers** para revisão antes de entrarem como referência. |
| RNF-27 | Cada custo carrega sua **data-base** e moeda, para permitir atualização monetária correta. |
| RNF-28 | Rastreabilidade da origem do dado (manual, importado, conciliado com SINAPI). |

## 8. Conformidade e padrões técnicos

| ID | Requisito |
|----|-----------|
| RNF-29 | Critérios de custo de construção alinhados às boas práticas e normas aplicáveis (ex.: **ABNT NBR 12721** para avaliação de custos; SINAPI/SICRO como referência de preços). |
| RNF-30 | Aderência às políticas internas de TI da PROMAV (infra, segurança, retenção de logs). |

## 9. Portabilidade

| ID | Requisito |
|----|-----------|
| RNF-31 | Banco de dados relacional padrão (sem dependência proprietária desnecessária) — *escolha final atrelada ao sistema atual*. |
| RNF-32 | Configuração por ambiente externalizada (variáveis/parametrização), facilitando implantação. |

---

> **Metas aceitas como alvo inicial** (tempo de resposta, disponibilidade, RPO/RTO e a
> faixa de erro de ±15% do [doc 01](./01-visao-escopo.md#2-objetivos-e-indicadores-de-sucesso)).
> Os números podem ser refinados conforme o volume real de dados e a infraestrutura do Neon/Render.

---

⬅️ Anterior: [02 — Requisitos Funcionais](./02-requisitos-funcionais.md) · ➡️ Próximo: [04 — Modelo de Dados](./04-modelo-dados.md)
