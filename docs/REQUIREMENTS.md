# Requirements — Verzel Elite Dev Technical Test

Source: `Teste tecnico Elite Dev - Verzel.pdf`. This file is the single source of truth for scope.
Every requirement has an ID so code, tests and commits can reference it (e.g. `feat(bids): reject self-outbid [BID-03]`).
The original Portuguese text is preserved verbatim in the appendix. If this translation and the appendix ever disagree, the appendix wins.

Legend: **MUST** = mandatory, **OPTIONAL** = not required but evaluated, **OUT** = explicitly out of scope.

---

## 1. The challenge

Build an online Auction House where an auctioneer puts items up for auction and bidders compete for each lot with live bids.

| ID     | Level | Requirement                                                                                                                                                                                |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GEN-01 | MUST  | The auctioned items can be of any theme, but they **must come from a public API**.                                                                                                         |
| GEN-02 | MUST  | The auctioneer builds a lot from an item fetched from the chosen external API, defining starting bid, minimum increment, start time, end time and other relevant fields.                   |
| GEN-03 | MUST  | The bidder deposits a simulated balance in their wallet, follows lots live, places bids and, if they win, receives a hammer receipt (comprovante de arremate) that can be shared via link. |
| GEN-04 | MUST  | Anyone, **even without login**, can audit the bid history of a lot and verify it was not tampered with.                                                                                    |
| GEN-05 | MUST  | **Deployment is mandatory.** A public link of the running application is part of the delivery.                                                                                             |

### 1.1 Users and authentication

The platform has two distinct roles:

| ID      | Role                | Rule                                                           |
| ------- | ------------------- | -------------------------------------------------------------- |
| AUTH-01 | Auctioneer (seller) | Creates and manages **their own** lots. **Cannot place bids.** |
| AUTH-02 | Bidder (client)     | Deposits balance, places bids and wins items.                  |

References (use as a starting point, do not copy): catawiki.com/pt, liveauctioneers.com, superbid.net.

---

## 2. Front-end

| ID    | Screen            | Requirement                                                                                                                                                                                      |
| ----- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FE-01 | Lot showcase      | Displays auctioned items, separating **live**, **scheduled** and **closed** lots. **Cancelled lots do not appear in the showcase.**                                                              |
| FE-02 | Auctioneer panel  | Search items in the chosen API and create a lot from them (with image, title, item attributes, start/end date and minimum value).                                                                |
| FE-03 | Auctioneer panel  | Cancel a lot that **has not received any bids yet**.                                                                                                                                             |
| FE-04 | Auctioneer panel  | See the result of each closed lot (whether it was sold and for how much) and the **total received**.                                                                                             |
| FE-05 | Live lot room     | Shows current bid, bid history, the user's position in the bids, countdown, and a clear "you are winning" / "you have been outbid" indicator. **Everything updates without reloading the page.** |
| FE-06 | Bidder wallet     | Shows **total balance**, **committed balance**, **available balance** and a simulated deposit option.                                                                                            |
| FE-07 | My wins           | Shows the items the user bid on and the lots they won, each with its receipt and share link.                                                                                                     |
| FE-08 | Audit page        | **Public and without login.** Shows the full bid history of a lot and states whether it is **intact or tampered**.                                                                               |
| FE-09 | Feedback messages | A clear message for every rejected bid, stating the reason: **below minimum**, **insufficient balance**, **you are already winning**, **lot not started yet**, or **lot closed**.                |

---

## 3. Back-end

### 3.1 External API management

| ID     | Level | Requirement                                                                                                  |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------ |
| EXT-01 | MUST  | APIs have limits and instabilities. The application cannot become unusable because of that.                  |
| EXT-02 | MUST  | The **showcase, the rooms, the audit and the receipt must keep working even if the external API goes down.** |

### 3.2 Bid rules

| ID     | Level | Requirement                                                                                                  |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------ |
| BID-01 | MUST  | Bids are only accepted on **live** lots (between start and end).                                             |
| BID-02 | MUST  | The **first bid must be ≥ the starting bid**. Subsequent bids must be **≥ current bid + minimum increment**. |
| BID-03 | MUST  | The **leading bidder cannot outbid their own bid**.                                                          |

### 3.3 Business rules

| ID        | Topic                    | Requirement                                                                                                                |
| --------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| BAL-01    | Committed balance        | **Available balance = total balance − committed balance.**                                                                 |
| BAL-02    | Committed balance        | When the bidder is leading, the bid amount becomes committed.                                                              |
| BAL-03    | Committed balance        | If outbid, the amount returns to available **immediately**.                                                                |
| BAL-04    | Committed balance        | A bid is only accepted if it **fits in the available balance**.                                                            |
| SNIPE-01  | Extension (anti-sniping) | A bid accepted in the **last 2 minutes** extends the lot end to **+2 minutes**.                                            |
| SETTLE-01 | Settlement               | On closing, the winner's amount is **debited** and the auctioneer is **credited**, generating the receipt.                 |
| SETTLE-02 | Settlement               | Lots without bids close **without a winner**.                                                                              |
| AUDIT-01  | Tamper-evident history   | Any change, removal or later insertion into the history (**even directly in the database**) must be detected by the audit. |
| AUDIT-02  | Tamper-evident history   | The technique is our choice and **must be explained** (README).                                                            |
| PRIV-01   | Privacy                  | The audit and the receipt identify bidders **without exposing personal data**.                                             |

---

## 4. Technologies and requirements

### 4.1 Mandatory technologies

| ID      | Layer     | Requirement                                                                                                                      |
| ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| TECH-01 | Front-end | React, with or without a framework (Next.js, Vite, Remix, ...).                                                                  |
| TECH-02 | Back-end  | Node.js or Python, any framework (NestJS, Express, FastAPI, Django, ...).                                                        |
| TECH-03 | Database  | PostgreSQL, MySQL or a NoSQL database (e.g. MongoDB). The README must include clear instructions on how to configure and use it. |

### 4.2 Non-functional requirements

| ID     | Topic         | Requirement                                                                                                                                                                   |
| ------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-01 | Deadline      | 7 calendar days from receiving the challenge.                                                                                                                                 |
| NFR-02 | Seed data     | Seed **one auctioneer**, **two clients** and **at least one published lot with open bids**, so evaluators can walk through the flow without building everything from scratch. |
| NFR-03 | Documentation | A detailed README explaining step by step how to configure and run the application.                                                                                           |
| NFR-04 | Documentation | Features with **unexpected behavior must be mentioned** in the README.                                                                                                        |
| NFR-05 | Documentation | Missing explanations negatively impact the final grade.                                                                                                                       |

---

## 5. Optional items

None is mandatory, but **all are considered in the evaluation**.

| ID     | Item                                                   |
| ------ | ------------------------------------------------------ |
| OPT-01 | Lot search and filtering.                              |
| OPT-02 | Lot cancellation with automatic refund.                |
| OPT-03 | Docker Compose.                                        |
| OPT-04 | Automated tests.                                       |
| OPT-05 | Dark mode: interface supporting light and dark themes. |

### 5.1 Out of scope (do NOT build)

| ID     | Item                    |
| ------ | ----------------------- |
| OUT-01 | Invoices (nota fiscal). |
| OUT-02 | Resale between users.   |
| OUT-03 | Native app.             |
| OUT-04 | Password recovery.      |

---

## 6. Delivery

Submit through https://elitedev.verzel.com.br/?elite-dev-2026-2 with:

| ID     | Field                     | Content                                                                           |
| ------ | ------------------------- | --------------------------------------------------------------------------------- |
| DEL-01 | Full name and e-mail      | Contact data.                                                                     |
| DEL-02 | Repository                | Public GitHub repository link.                                                    |
| DEL-03 | More than one repository? | If front and back are separate, provide both.                                     |
| DEL-04 | Deploy                    | Public application link (**mandatory**).                                          |
| DEL-05 | AI usage                  | Where and how AI was used and what was reviewed or adjusted. If not used, say so. |

---

## Appendix — original text (pt-BR, verbatim)

### 01 O desafio

> Você deve criar uma Casa de Leilões online, onde um leiloeiro coloca itens em leilão e licitantes disputam cada lote com lances ao vivo. O que será leiloado é escolha sua: obras de arte, carros, cartas colecionáveis, discos, livros raros, o que você quiser, desde que os itens venham de uma API pública.
>
> O leiloeiro monta um lote a partir de um item buscado na API externa que você escolheu, definindo lance inicial, incremento mínimo, horário de início e fim, e outros campos relevantes. O licitante deposita um saldo simulado na sua carteira, acompanha os lotes ao vivo, dá lances e, se vencer, recebe um comprovante de arremate que pode compartilhar por link. Qualquer pessoa, mesmo sem login, pode auditar o histórico de lances de um lote e verificar que ele não foi adulterado.

**Requisitos funcionais base**

> DEPLOY — O deploy da aplicação é obrigatório.
>
> Usuários e Autenticação: A plataforma possui dois papéis distintos:
> - LEILOEIRO (VENDEDOR): Cria e gerencia os próprios lotes. Não pode dar lances.
> - LICITANTE (CLIENTE): Deposita saldo, dá lances e arremata itens.
>
> REFERÊNCIAS — Para ver como esses fluxos costumam ser resolvidos. Não copie; use como ponto de partida: https://www.catawiki.com/pt, https://www.liveauctioneers.com/, https://www.superbid.net/

### 02 Front-End

> - **Vitrine de lotes:** Interface que exibe os itens leiloados, separando lotes ao vivo, agendados e encerrados. Lotes cancelados não aparecem na vitrine.
> - **Painel do leiloeiro:** Permite buscar itens na API escolhida e criar um lote a partir deles (com imagem, título, atributos do item, data de início/fim e valor mínimo); cancelar um lote que ainda não recebeu lances; e ver o resultado de cada lote encerrado (se foi arrematado e por quanto) e o total recebido.
> - **Sala do lote ao vivo:** Exibe o lance atual, histórico de lances, posição do usuário nos lances, contagem regressiva e um indicador claro de "você está ganhando" / "você foi superado". Tudo atualizado sem recarregar a página.
> - **Carteira do licitante:** Mostra saldo total, saldo comprometido, saldo disponível e opção de depósito simulado.
> - **Meus arremates:** Interface onde o usuário vê os itens em que deu lance e os lotes vencidos, com o respectivo comprovante e link de compartilhamento.
> - **Página de auditoria:** Pública e sem login, mostra o histórico completo de lances de um lote e informa se ele está íntegro ou foi adulterado.
> - **Mensagens de feedback:** Mensagem clara para cada lance recusado, dizendo o motivo (abaixo do mínimo, saldo insuficiente, você já está ganhando, lote ainda não iniciado ou lote encerrado).

### 03 Back-End

> **GESTÃO DA API EXTERNA** — APIs têm limites e instabilidades. Sua aplicação não pode ficar inutilizável por causa disso. A vitrine, as salas, a auditoria e o comprovante devem continuar funcionando mesmo que a API caia.
>
> **REGRAS DE LANCE**
> - Só são aceitos em lotes ao vivo (entre início e fim).
> - O primeiro lance deve ser ≥ ao lance inicial. Os seguintes devem ser ≥ ao lance atual + incremento mínimo.
> - O licitante líder não pode cobrir o próprio lance.

> - **Saldo comprometido:** Saldo disponível = saldo total - comprometido. Quando o licitante lidera, o valor fica comprometido; se superado, volta ao disponível imediatamente. O lance só é aceito se couber no disponível.
> - **Prorrogação (anti-sniping):** Lance aceito nos últimos 2 minutos estende o fim do lote para +2 minutos.
> - **Liquidação:** Ao encerrar, debita-se o valor do vencedor e credita-se ao leiloeiro, gerando o comprovante. Lotes sem lances fecham sem vencedor.
> - **Histórico à prova de adulteração:** Qualquer alteração, remoção ou inserção posterior no histórico (mesmo direto no banco de dados) deve ser detectada pela auditoria. A técnica é escolha sua; explique-a.
> - **Privacidade:** A auditoria e o comprovante identificam licitantes sem expor dados pessoais.

### 04 Tecnologias e requisitos

> **Tecnologias obrigatórias**
> - Front-End: React, com ou sem framework (Next.js, Vite, Remix ou o que preferir).
> - Back-End: NodeJS ou Python. Fique à vontade com o framework (NestJS, Express, FastAPI, Django, etc.).
> - Banco de Dados: PostgreSQL, MySQL ou um banco NoSQL (como MongoDB). Certifique-se de incluir no README instruções claras sobre como configurar e utilizá-lo.
>
> **Requisitos não funcionais**
> - PRAZO: Você tem 7 dias corridos a partir do recebimento deste desafio para completá-lo.
> - DADOS DE TESTE: Deixe semeados um leiloeiro, dois clientes e ao menos um lote publicado com lances abertos, para que possamos percorrer o fluxo sem montar tudo do zero.
> - DOCUMENTAÇÃO: O projeto deve incluir um README detalhado explicando o passo a passo para configurar e executar a aplicação. Funcionalidades com comportamento inesperado devem ser mencionadas. A ausência de explicações impactará negativamente na nota final.

### 05 Opcionais

> Nenhum dos itens abaixo é obrigatório, mas todos são considerados na avaliação.
> - Busca e filtro de lotes.
> - Cancelamento de lote com estorno automático.
> - Docker Compose.
> - Testes automatizados.
> - Dark Mode: Interface com suporte a tema claro e escuro.
>
> **NÃO PRECISA FAZER:** Nota fiscal, revenda entre usuários, aplicativo nativo ou recuperação de senha.

### 06 Como enviar

> Envie pelo formulário https://elitedev.verzel.com.br/?elite-dev-2026-2 preenchendo os campos assim:
> - Nome completo e E-mail: seus dados de contato.
> - Repositório: o link do repositório público no GitHub com a aplicação.
> - Tem mais de um repositório?: se front e back estiverem separados, informe os dois.
> - Deploy: o link público da aplicação (obrigatório).
> - Onde e como você usou IA: usar IA é permitido. Conte onde e como usou e o que revisou ou ajustou. Se não usou, conte isso também.
