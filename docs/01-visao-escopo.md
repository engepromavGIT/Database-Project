# 01 — Visão, Escopo e Glossário

## 1. Visão do produto

A PROMAV executa obras de construção civil e precisa estimar **custo** e **prazo** de
novos projetos com rapidez e consistência. Hoje essa estimativa depende de planilhas
dispersas e da experiência individual do orçamentista.

A **Base de Dados de Projetos** é um módulo do sistema web da empresa que:

1. **Registra** o histórico de obras concluídas (custos orçados × realizados, prazos
   planejados × reais, características da obra e estrutura de serviços/EAP).
2. **Normaliza** esses dados para que obras de épocas, portes e locais diferentes
   possam ser comparadas (atualização monetária e ajustes).
3. **Estima** custo e prazo de obras novas a partir das obras análogas do acervo,
   entregando uma faixa de valores e um nível de confiança.

> **Para quem:** orçamento, engenharia e diretoria da PROMAV.
> **O quê:** uma base histórica confiável + um motor de estimativa.
> **Por quê:** orçar melhor, mais rápido e com justificativa baseada em dados.

## 2. Objetivos e indicadores de sucesso

| Objetivo | Como medir o sucesso |
|----------|----------------------|
| Centralizar o histórico de obras | 100% das obras concluídas dos últimos N anos cadastradas |
| Estimar mais rápido | Tempo para gerar uma estimativa inicial reduzido (meta: minutos, não dias) |
| Estimar com mais precisão | Erro médio entre estimado e realizado dentro de uma faixa-alvo (ex.: ±15%) |
| Padronizar critérios | Estimativas usando método e premissas registrados e auditáveis |
| Aprender com o histórico | Desvios de custo/prazo analisados por tipo de obra |

> Os valores-alvo (N anos, faixa de erro) devem ser definidos pela PROMAV; os números
> acima são apenas referência inicial.

## 3. Escopo

### 3.1 Dentro do escopo

- Cadastro e manutenção de **obras históricas** (concluídas ou em andamento com dados
  consolidados): dados gerais, EAP/etapas, custos orçados e realizados, cronograma.
- **Importação** de orçamentos e medições a partir de arquivos (**PDF, CSV e Excel**).
- **Cadastros de referência:** clientes, tipos de obra, categorias de custo,
  composições/serviços de referência (inclusive vínculo a códigos SINAPI), índices
  econômicos para atualização monetária, parâmetros de BDI e encargos.
- **Normalização** dos custos: atualização para uma data-base por índice (ex.: INCC) e
  ajustes por padrão de acabamento, porte e localidade.
- **Indicadores**: custo por m², desvio orçado × realizado, desvio de prazo,
  produtividade, curva ABC de serviços.
- **Busca de obras análogas** por filtros (tipo, padrão, área, localidade, período).
- **Motor de estimativa** de novos projetos: seleção de método, obras de referência,
  geração de custo e prazo com faixa (otimista/provável/pessimista) e nível de confiança;
  versionamento das estimativas.
- **Relatórios e dashboards** com exportação (PDF/Excel).
- **Integração** com o sistema web existente: autenticação/SSO, reuso do cadastro de
  clientes/usuários e exposição/consumo de dados via API.

### 3.2 Fora do escopo (nesta fase)

- Substituir o ERP, o sistema financeiro ou contábil da empresa.
- Gestão operacional da execução da obra (diário de obra, apontamento de ponto,
  compras/suprimentos em tempo real).
- Emissão de proposta comercial com cálculo tributário/legal definitivo (o módulo
  fornece a **base de custo**; a proposta final é responsabilidade do processo comercial).
- Integração com BIM/modelagem 3D (pode ser avaliada em fase futura).

### 3.3 Premissas

- O sistema web atual fornece **autenticação** e um **cadastro de usuários/clientes**
  reutilizáveis.
- A PROMAV dispõe de orçamentos e medições de obras passadas em formato digital
  (**PDF, CSV e Excel**) para a carga inicial, com cerca de **3 anos** de histórico.
- Há um responsável (engenharia/orçamento) para validar a qualidade dos dados carregados.
- Moeda padrão **BRL** e idioma **pt-BR**.

### 3.4 Restrições

- Deve **integrar-se** ao sistema existente (não é um sistema isolado) — *stack a confirmar*.
- Deve respeitar a **LGPD** quanto a dados de clientes e colaboradores.
- Orçamento e prazo de desenvolvimento internos da PROMAV (a definir).

<a id="4-stakeholders-e-perfis-de-usuario"></a>

## 4. Stakeholders e perfis de usuário

| Perfil | Interesse / uso principal |
|--------|---------------------------|
| **Diretoria** | Visão consolidada, margens, desvios por tipo de obra; decisão de propostas. |
| **Orçamentista** | Gera estimativas, busca obras análogas, ajusta premissas. |
| **Engenheiro de planejamento** | Cadastra EAP, cronograma, alimenta custos realizados. |
| **Administrador do sistema** | Cadastros de referência, índices, usuários e permissões. |
| **Consultor de dados (opcional)** | Audita qualidade e calibra parâmetros de estimativa. |

## 5. Glossário do domínio

| Termo | Significado |
|-------|-------------|
| **EAP** | Estrutura Analítica de Projeto — decomposição da obra em etapas/serviços. Base para orçar e medir. |
| **Composição de custo unitário** | Conjunto de insumos (material, mão de obra, equipamento) que forma o custo de uma unidade de um serviço (ex.: 1 m² de alvenaria). |
| **Insumo** | Recurso elementar: material, mão de obra (hora) ou equipamento (hora). |
| **SINAPI** | Sistema Nacional de Pesquisa de Custos e Índices da Construção Civil — tabela de referência de custos e composições (CAIXA/IBGE). Usada como referência para preços. |
| **SICRO** | Sistema de Custos Referenciais de Obras (DNIT) — referência para obras de infraestrutura/rodoviárias. |
| **CUB/m²** | Custo Unitário Básico por m² — indicador de custo de edificações publicado pelos Sinduscons; útil como benchmark. |
| **INCC** | Índice Nacional de Custo da Construção — índice usado para **atualizar custos** entre datas. |
| **BDI** | Benefícios e Despesas Indiretas — percentual aplicado sobre o custo direto para chegar ao preço (administração, lucro, impostos, riscos etc.). |
| **Encargos sociais** | Percentual sobre a mão de obra referente a obrigações trabalhistas/previdenciárias. |
| **Curva ABC** | Ordenação dos serviços/insumos por participação no custo (poucos itens concentram a maior parte do valor). |
| **Cronograma físico-financeiro** | Distribuição do avanço físico e do desembolso ao longo do tempo. |
| **Custo direto** | Custo dos serviços/insumos aplicados na obra, antes do BDI. |
| **Orçado × Realizado** | Comparação entre o que foi previsto e o que de fato custou/durou. |
| **Padrão de acabamento** | Classificação do nível da obra (ex.: popular, normal, alto), que afeta fortemente o custo/m². |
| **Estimativa paramétrica** | Estimar usando uma taxa histórica (ex.: R$/m²) multiplicada por um parâmetro da obra nova. |
| **Estimativa análoga** | Estimar por comparação direta com uma obra semelhante já concluída. |
| **Faixa (3 pontos / PERT)** | Estimativa expressa como otimista, mais provável e pessimista, em vez de um valor único. |

---

➡️ Próximo: [02 — Requisitos Funcionais](./02-requisitos-funcionais.md)
