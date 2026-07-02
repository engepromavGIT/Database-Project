# 02 — Requisitos Funcionais

Cada requisito tem um identificador (**RF-xxx**), uma prioridade e um critério de
aceite resumido. Prioridade segue MoSCoW:

- **E** = Essencial (MVP) · **I** = Importante · **D** = Desejável (evolução)

> Convenção: requisitos do MVP são os marcados como **E**. Os demais entram nas fases
> seguintes (ver [roadmap](./06-arquitetura-integracao.md#7-roadmap-de-implantacao)).

---

## Módulo A — Cadastros de referência

| ID | Requisito | Prio. | Critério de aceite |
|----|-----------|:-----:|--------------------|
| RF-A01 | Cadastrar e manter **clientes** (CRUD). Reutilizar o cadastro do sistema atual quando disponível. | E | Cliente criado/editado/inativado; vínculo com obras preservado. |
| RF-A02 | Cadastrar e manter **tipos de obra** (ex.: residencial, comercial, industrial, reforma, infraestrutura). | E | Tipo disponível para classificar obras e filtrar estimativas. |
| RF-A03 | Cadastrar e manter **padrões de acabamento** (ex.: popular, normal, alto). | E | Padrão aplicável a obras e usado como critério de similaridade. |
| RF-A04 | Cadastrar e manter **categorias de custo** (material, mão de obra, equipamento, terceiros, indiretos). | E | Categorias usadas na composição e nos indicadores. |
| RF-A05 | Cadastrar e manter **serviços/composições de referência**, com unidade e vínculo opcional a código **SINAPI/SICRO**. | I | Serviço reutilizável em várias obras; busca por código/descrição. |
| RF-A06 | Cadastrar **índices econômicos** (ex.: INCC, índice SINAPI) por mês/ano para atualização monetária. | E | Série de índices consultável; usada na normalização (RF-D01). |
| RF-A07 | Cadastrar **parâmetros de BDI e encargos sociais** por período/tipo de obra. | I | Parâmetros versionados por vigência. |
| RF-A08 | Cadastrar **localidades** (município/UF) e, opcionalmente, fator de ajuste regional. | I | Localidade aplicável à obra e à estimativa. |

## Módulo B — Cadastro de obras históricas

| ID | Requisito | Prio. | Critério de aceite |
|----|-----------|:-----:|--------------------|
| RF-B01 | Cadastrar uma **obra** com dados gerais: código, nome, cliente, tipo, padrão, localidade, área construída (m²), área de terreno, nº de pavimentos, datas planejadas e reais, status. | E | Obra salva com validação dos campos obrigatórios. |
| RF-B02 | Registrar a **EAP** da obra (etapas e subetapas hierárquicas). | E | Árvore de etapas criada, editável e ordenável. |
| RF-B03 | Lançar **itens de custo orçado** por etapa (serviço, unidade, quantidade, custo unitário, categoria). | E | Custo total da etapa e da obra calculado automaticamente. |
| RF-B04 | Lançar **custos realizados** por etapa/período (apropriação). | E | Comparativo orçado × realizado disponível por etapa e total. |
| RF-B05 | Registrar **cronograma físico-financeiro** (avanço e desembolso por período). | I | Curva S de previsto × realizado exibível. |
| RF-B06 | Anexar documentos à obra (orçamento original, fotos, contrato). | D | Arquivos anexados e baixáveis, respeitando permissões. |
| RF-B07 | Marcar a obra como **elegível para referência** (apta a alimentar estimativas) ou excluí-la (ex.: dados incompletos/atípicos). | E | Apenas obras elegíveis entram no motor de estimativa. |
| RF-B08 | Manter **histórico de alterações** (quem alterou o quê e quando). | I | Trilha de auditoria consultável por registro. |

## Módulo C — Importação de dados

| ID | Requisito | Prio. | Critério de aceite |
|----|-----------|:-----:|--------------------|
| RF-C01 | Importar obras/orçamentos a partir de **PDF, CSV ou Excel**, com mapeamento de colunas. | E | Pré-visualização antes de confirmar; linhas inválidas sinalizadas. PDF (menos estruturado) extrai tabelas com revisão manual. |
| RF-C02 | Validar dados na importação (campos obrigatórios, tipos, unidades, totais). | E | Relatório de erros/avisos; importação parcial controlada. |
| RF-C03 | Mapear serviços importados a **composições de referência/SINAPI** (automático por código + ajuste manual). | I | Itens conciliados; pendências destacadas. |
| RF-C04 | Reimportar/atualizar uma obra já importada sem duplicar registros (idempotência por chave). | I | Atualização identifica registros existentes. |

## Módulo D — Normalização e indicadores

| ID | Requisito | Prio. | Critério de aceite |
|----|-----------|:-----:|--------------------|
| RF-D01 | **Atualizar custos** de qualquer obra para uma data-base escolhida, aplicando índice (ex.: INCC). | E | Valor atualizado exibido junto ao valor histórico. |
| RF-D02 | Calcular **custo por m²** (total e por etapa/categoria), na data histórica e na data-base. | E | Indicador disponível por obra e comparável entre obras. |
| RF-D03 | Calcular **desvio de custo** (realizado ÷ orçado) e **desvio de prazo** (real ÷ planejado). | E | Percentuais por etapa e por obra. |
| RF-D04 | Gerar **curva ABC** de serviços/insumos da obra. | I | Itens ordenados por participação acumulada no custo. |
| RF-D05 | Calcular **produtividade/indicadores** por serviço (ex.: R$/m², h/m²) quando os dados permitirem. | D | Indicador exibido quando houver dados suficientes. |

## Módulo E — Busca de obras análogas

| ID | Requisito | Prio. | Critério de aceite |
|----|-----------|:-----:|--------------------|
| RF-E01 | Buscar/filtrar obras por tipo, padrão, faixa de área, localidade, cliente e período. | E | Resultados filtrados e ordenáveis. |
| RF-E02 | Sugerir obras **mais similares** a um conjunto de parâmetros informados (escore de similaridade). | I | Lista ordenada por similaridade, com os critérios usados. |
| RF-E03 | Comparar lado a lado 2+ obras (custo/m², prazos, desvios, composição). | I | Tabela comparativa exportável. |

## Módulo F — Motor de estimativa de novos projetos

| ID | Requisito | Prio. | Critério de aceite |
|----|-----------|:-----:|--------------------|
| RF-F01 | Criar uma **estimativa** para um projeto novo informando seus parâmetros (tipo, padrão, área, localidade, data-base). | E | Estimativa registrada e recuperável. |
| RF-F02 | Selecionar o **método**: análoga, paramétrica (R$/m²), bottom-up por EAP, ou combinação. | E | Método e premissas ficam gravados na estimativa. |
| RF-F03 | Selecionar manualmente ou aceitar as **obras de referência** sugeridas (RF-E02). | E | Conjunto de referência exibido e editável. |
| RF-F04 | Gerar **custo estimado** com faixa **otimista / mais provável / pessimista** e **nível de confiança**. | E | Faixa e premissas exibidas; cálculo rastreável (ver [doc 05](./05-regras-estimativa.md)). |
| RF-F05 | Gerar **prazo estimado** com faixa, a partir do histórico de prazos das obras análogas. | E | Prazo em faixa, coerente com porte/tipo. |
| RF-F06 | Aplicar **BDI/encargos** para apresentar custo direto e preço de referência. | I | Decomposição custo direto → preço exibida. |
| RF-F07 | **Versionar** estimativas (salvar cenários e comparar). | I | Histórico de versões com diferenças entre cenários. |
| RF-F08 | Quando a obra for executada, **vincular o realizado** à estimativa para medir o acerto. | I | Erro estimado × realizado calculado e arquivado (realimenta calibração). |

## Módulo G — Relatórios, dashboards e exportação

| ID | Requisito | Prio. | Critério de aceite |
|----|-----------|:-----:|--------------------|
| RF-G01 | Dashboard com indicadores-chave (nº de obras, custo/m² médio por tipo, desvios médios). | I | Painel com filtros por período/tipo. |
| RF-G02 | Relatório detalhado de uma estimativa (premissas, referências, faixas, decomposição). | E | Exportável em PDF. |
| RF-G03 | Exportar dados/listas em Excel/CSV. | I | Exportação respeita filtros e permissões. |

## Módulo H — Integração e administração

| ID | Requisito | Prio. | Critério de aceite |
|----|-----------|:-----:|--------------------|
| RF-H01 | Autenticar via **SSO/login do sistema existente**; não criar uma base de senhas paralela. | E | Usuário entra com a credencial corporativa. |
| RF-H02 | Controlar acesso por **perfis e permissões** (ver perfis no [doc 01](./01-visao-escopo.md#4-stakeholders-e-perfis-de-usuario)). | E | Ações restritas conforme o perfil. |
| RF-H03 | Expor/consumir dados por **API** (ex.: enviar custo de referência para o módulo comercial). | I | Endpoints documentados e autenticados. |
| RF-H04 | Reaproveitar o **cadastro de clientes/usuários** do sistema atual (sem duplicidade). | I | Cliente/usuário único entre os módulos. |
| RF-H05 | Registrar **log de auditoria** das ações sensíveis (criação/edição/exclusão, exportações). | I | Logs consultáveis por administrador. |

---

## Rastreabilidade (resumo)

| Objetivo (doc 01) | Requisitos que o atendem |
|-------------------|--------------------------|
| Centralizar histórico | RF-B01..B08, RF-C01..C04 |
| Estimar mais rápido | RF-E01..E03, RF-F01..F05 |
| Estimar com mais precisão | RF-D01..D04, RF-F03..F08 |
| Padronizar critérios | RF-F02, RF-F04, RF-A05..A07 |
| Aprender com o histórico | RF-D03, RF-F08, RF-G01 |

---

⬅️ Anterior: [01 — Visão e Escopo](./01-visao-escopo.md) · ➡️ Próximo: [03 — Requisitos Não Funcionais](./03-requisitos-nao-funcionais.md)
