# UrbanTalk

Plataforma para registrar, visualizar e acompanhar problemas urbanos e de mobilidade em Sorocaba (SP): buracos, iluminação pública, calçadas, lixo, sinalização e pontos de ônibus.

Projeto de extensão da disciplina UPX, grupo **EcoGestor**, Centro Universitário Facens, 2026.

O cidadão registra o problema com foto e local, outras pessoas confirmam, e a equipe consolida tudo em relatórios PDF por bairro, categoria e período para **encaminhamento manual** aos órgãos responsáveis. O sistema **não tem integração automática com a Prefeitura**.

Cada reclamação diz **onde se aplica**: na **cidade toda** (sem bairro) ou em um **bairro digitado livremente**, sem lista fechada. Além das reclamações, o UrbanTalk tem **Ideias e Propostas** com voto único, uma **Comunidade** com feed e **fóruns criados pelas próprias pessoas** (votos, respostas em árvore, tags e seguidores), **notificações** dentro da plataforma, uma **Fila de Análise** para a equipe com priorização transparente, **histórico completo com evidências de resolução**, **moderação** com auditoria, **mapa de concentração**, **relatórios comparativos** (PDF e CSV) e a página **Explorar** com busca global.

---

## Como rodar

### Requisitos

- **Node.js 22.13 ou mais novo** (LTS 22 ou 24). Confira com `node -v`.
- Nada mais: o banco é o SQLite que já vem dentro do Node (um arquivo criado automaticamente, sem compilar nada) e o mapa usa OpenStreetMap, sem chave.

### Passo a passo

Na pasta do projeto:

```bash
npm run setup
```

Isso instala as dependências da API e do site, cria `api/.env` com um segredo de sessão gerado na hora e cria o banco com as categorias, os status e os 9 fóruns oficiais. Bairros não são cadastrados: cada pessoa digita o nome.

Crie a primeira conta de **administrador** da equipe (a senha é gerada e mostrada uma vez):

```bash
npm run admin:create -- --email seu@email.com --name "Seu nome"
```

Para criar um **funcionário** comum (vê e administra reclamações, mas não mexe na lista de status nem na equipe):

```bash
npm run staff:create -- --email pessoa@email.com --name "Nome"
```

Para promover uma conta que já foi cadastrada pelo site, acrescente `--promote` (e `--role admin` se for administrador). Depois do primeiro administrador, o caminho normal é pela tela **Equipe**: a pessoa cria uma conta de cliente no site e o administrador libera o acesso. Não existe cadastro aberto de funcionário nem senha padrão.

Na tela de login, quem é da equipe escolhe **Funcionário** no seletor. O seletor só confere o papel que já está no banco; escolher "Funcionário" com uma conta de cliente é recusado pela API.

Opcional, para apresentar o sistema com o mapa preenchido:

```bash
npm run demo:seed
```

Cria 64 ocorrências **fictícias** (algumas com rua, algumas em "Outros", algumas resolvidas e com prioridade), anotações da equipe, 2 reclamações da cidade toda, conversas no feed, 4 propostas com apoios, 2 fóruns criados por moradores e 3 discussões com votos, 8 contas de cidadão (`cidadao1@demo.urbantalk.local` até `cidadao8@...`, senha `Demo1234`), um administrador (`administrador@gmail.com`) e um funcionário (`funcionario@gmail.com`), com senhas mostradas no terminal. Tudo fica marcado como demonstração na interface, nos indicadores e no PDF. Para apagar: `npm run demo:reset` (remove também o que as contas de demonstração criaram pelo site).

Agora rode:

```bash
npm start
```

e abra **http://localhost:3000**. Esse comando compila o site e sobe a API servindo tudo no mesmo endereço.

### Modo desenvolvimento

```bash
npm run dev
```

Sobe a API em `localhost:3000` (recarrega ao salvar) e o Angular em **http://localhost:4200** (recarrega ao salvar). O Angular encaminha `/api` para a API pelo `web/proxy.conf.json`. Ctrl+C encerra os dois.

### Testes

```bash
npm test
```

Roda os testes da API (Vitest + Supertest, banco em memória) e do front (Vitest via `ng test`).

### Comandos úteis

| Comando | O que faz |
| --- | --- |
| `npm run setup` | Instala tudo, cria `api/.env` e o banco |
| `npm start` | Compila o site e abre em `localhost:3000` |
| `npm run serve` | Sobe só a API, servindo o último build do site |
| `npm run dev` | API + Angular com recarga automática (`localhost:4200`) |
| `npm test` | Testes da API e do front |
| `npm run start:cloud` | Início para hospedagem na nuvem (com `AUTO_DEMO=true` insere os dados de demonstração antes de subir) |
| `npm run migrate` | Aplica migrações pendentes no banco |
| `npm --prefix api run migrate:rollback` | Desfaz o último lote de migrações (a de localização e Comunidade não tem volta automática: use a cópia em `api/data/backups/`) |
| `npm run admin:create -- --email ...` | Cria ou promove administrador |
| `npm run staff:create -- --email ...` | Cria ou promove funcionário |
| `npm run demo:seed` / `npm run demo:reset` | Insere / remove os dados fictícios |

Para começar o banco do zero: pare o servidor, apague a pasta `api/data/` e rode `npm run migrate`.

**Atualizando de uma versão anterior:** basta rodar `npm start` (ou `npm run migrate`). Antes de aplicar migrações pendentes, o sistema grava uma cópia completa do banco em `api/data/backups/` (o caminho aparece no terminal). Para voltar atrás, pare o servidor e coloque essa cópia no lugar de `api/data/urbantalk.sqlite`.

**Ícone do navegador:** o favicon agora é a placa azul do UrbanTalk. Se a aba ainda mostrar o ícone laranja antigo, é cache do navegador: recarregue com Ctrl+F5 (Cmd+Shift+R no Mac) ou abra uma aba anônima. Os arquivos de ícone são servidos com revalidação (`no-cache`) e com `?v=2` no endereço, então isso só acontece na primeira visita depois da atualização.

---

## Publicar na internet (Render)

O projeto já vem com o arquivo `render.yaml`. Fluxo: subir o código para o GitHub e conectar o repositório ao Render, que instala, compila e gera um link público (`https://nome.onrender.com`).

Variáveis usadas na nuvem (já preenchidas no `render.yaml`, exceto as duas senhas):

| Variável | Para que serve |
| --- | --- |
| `JWT_SECRET` | segredo das sessões, gerado pelo Render |
| `COOKIE_SECURE=true` | cookie só por HTTPS |
| `TRUST_PROXY=1` | confia no proxy do Render para ler o IP real (limite de requisições) |
| `AUTO_DEMO=true` | a cada início insere os dados de demonstração, se ainda não existirem |
| `DEMO_ADMIN_PASSWORD` / `DEMO_STAFF_PASSWORD` | senhas do administrador e do funcionário de demonstração (mínimo 8 caracteres, com letra e número) |

No plano gratuito do Render o serviço dorme após 15 minutos sem acesso (a primeira abertura depois disso leva cerca de 1 minuto) e o disco é apagado a cada reinício, o que inclui o banco e as fotos enviadas. Por isso `AUTO_DEMO=true` recria os dados de exemplo a cada início. Para guardar dados de verdade é preciso disco persistente (plano pago) ou outro banco.

## Tecnologias e decisões

| Parte | Escolha | Por quê |
| --- | --- | --- |
| Front-end | Angular 21 (componentes standalone, signals, formulários reativos) | Tecnologia definida no projeto acadêmico. Escolhido em vez do 22 por aceitar o Node 22 LTS a partir da 22.12 |
| Back-end | Node.js + Express 5 + TypeScript | O repositório estava vazio, então não havia stack a preservar. TypeScript dos dois lados deixa o projeto em uma só linguagem para o grupo. ASP.NET Core foi considerado, mas não pôde ser compilado e testado no ambiente em que este código foi produzido; preferimos entregar algo efetivamente testado |
| Banco | SQLite embutido no Node (`node:sqlite`) via Knex, com migrações versionadas | Relacional, persistente em arquivo e sem instalação nem compilação de módulos nativos (que costuma falhar no Windows). Um adaptador em `api/src/db/node-sqlite-client.ts` liga o Knex ao driver. O Knex permite trocar para PostgreSQL ou SQL Server mudando a configuração em `api/src/db/knex.ts` |
| Mapa | Leaflet + tiles do OpenStreetMap | Gratuito e sem chave. Todo o código do mapa fica em `web/src/app/shared/map.component.ts` e a URL dos tiles em `web/src/environments/` |
| PDF | PDFKit | Gera o arquivo no servidor, com os mesmos números dos indicadores |
| Fotos | Disco local (`api/data/uploads`), referência no banco | Imagens são revalidadas, reduzidas para até 1600 px e regravadas em JPEG sem metadados (EXIF, modelo do celular) |

### Identidade visual

Visual simples, inspirado na sinalização de rua: fundo cinza **concreto**, textos em tom de **asfalto**, cor principal azul de **placa de rua** (botões, marca, ícone do navegador e bairros, que aparecem como pequenas placas) e o **amarelo de faixa de sinalização** no foco do teclado e nos destaques. Títulos em **Barlow Semi Condensed** e texto em **Barlow**. Cantos retos, sem sombras nem enfeites.

Os status têm cor, ícone e texto próprios, então nunca dependem só da cor: Registrada (laranja, círculo com ponto), Encaminhada (azul, seta), Resolvida (verde, check). Status criados pela equipe escolhem uma cor de uma paleta fixa e ganham o ícone conforme o tipo (andamento ou encerramento). No mapa, a cor do marcador indica o status e o ícone dentro dele indica a categoria. A paleta de status foi verificada para daltonismo.

---

## Estrutura

```
urbantalk/
├── package.json            comandos da raiz (setup, dev, start, test...)
├── scripts/                setup.mjs e dev.mjs
├── api/
│   ├── .env.example        variáveis de ambiente, sem segredos
│   ├── src/
│   │   ├── server.ts       inicialização
│   │   ├── app.ts          Express, segurança (helmet/CSP, CORS), rotas, tratamento de erros
│   │   ├── config.ts       leitura do .env
│   │   ├── db/             conexão, migrações (com cópia de segurança antes) e dados base (categorias, status e fóruns oficiais)
│   │   ├── middleware/     sessão, permissões, proteção CSRF
│   │   ├── modules/        rotas e regras: auth, catálogo, ocorrências, status, admin, comunidade, indicadores, PDF,
│   │   │                   acompanhamento (tracking), notificações, fóruns, discussões, propostas, fila (queue), bairros digitados (places),
│   │   │                   moderação, categorias, configurações, insights (mapa de concentração, comparativos, CSV, Explorar, busca)
│   │   ├── lib/            senhas, datas no fuso de Sorocaba, fotos, erros, textos, limites e envio de arquivos
│   │   └── scripts/        migrate, create-admin, seed-demo
│   └── tests/              testes de API
└── web/
    ├── proxy.conf.json     /api → localhost:3000 no modo dev
    ├── public/             favicon (SVG e ICO), ícone da tela inicial e manifesto
    └── src/
        ├── environments/   URL da API e configuração do mapa
        ├── styles.css      tokens de cor, tipografia e componentes base
        └── app/
            ├── core/       modelos, serviço da API, sessão, guards, interceptor, formatação
            ├── shared/     mapa, filtros, gráficos, ícones, badges, paginação, estados vazios
            ├── layout/     barra lateral, cabeçalho público, avisos
            └── pages/      telas
```

---

## Telas

Há dois perfis (e o funcionário pode ser administrador). A navegação muda conforme quem entrou, e cada rota é protegida também na API (a guarda do Angular só evita mostrar telas inúteis).

**Públicas (também para visitantes)**

| Rota | Tela |
| --- | --- |
| `/` | Página inicial |
| `/explorar` | Explorar: reclamações recentes, problemas perto de você (localização do navegador ou bairro digitado), discussões populares, propostas com mais apoio, bairros com mais atividade e resoluções recentes. **Busca global** em reclamações (inclusive pelo código UT-00012), propostas, discussões, fóruns e, para quem está logado, publicações, com filtros de categoria e bairro (sem diferenciar acentos e maiúsculas) e paginação |
| `/mapa` | Três modos: **Mapa** (marcadores com ícone da categoria e cor do status; ao clicar, painel com foto, descrição, data, status e confirmações; camada **Concentração** com quadrados de ~500 m), **Lista** e **Por bairro** (rankings de mais pendentes e mais resolvidas, resumo do bairro com categorias recorrentes). Filtros de abrangência (cidade toda ou bairro), bairro digitado (com sugestões), rua, categoria, status e período em todos os modos. Reclamações da cidade toda sem ponto aparecem na lista e são contadas à parte |
| `/ocorrencias/:id` | Detalhe com linha do tempo completa, resolução (três níveis separados), avaliação "parece resolvido / continua", confirmações e conversas |
| `/propostas`, `/propostas/:id` | Ideias e Propostas: lista com ordenação (mais apoiadas, em alta, recentes), filtros (categoria, bairro, cidade toda, fase), detalhe com imagens, link, reclamações relacionadas, histórico de fases, comentários e compartilhar |
| `/comunidade` | **Comunidade**, com abas internas: **Feed** (publicações rápidas; visitante vê convite para entrar), **Fóruns**, **Explorar** e **Minhas participações**. Não há item separado de fóruns no menu |
| `/comunidade/foruns` | Fóruns oficiais e criados por pessoas: busca por nome, tema, tag ou bairro (sem diferenciar acentos), filtros de tema, bairro citado e tipo, "só os que sigo", ordenação e destaque dos fóruns que citam os bairros de interesse |
| `/comunidade/f/:slug` | Página do fórum: finalidade, tema, bairro, tags, regras, discussões (ativas, populares, novas, mais respondidas), busca e filtro por tag, seguir, editar (quem criou), denunciar, números reais de discussões, participantes e seguidores |
| `/comunidade/discussoes/:id` | Discussão: voto de "útil" (um por pessoa, separado de confirmações e de apoio a propostas), tags, reclamação ligada pelo código, respostas em árvore com voto, ordenação por mais úteis, acompanhar, denunciar |
| `/comunidade/explorar` | Em alta nos últimos 30 dias, discussões novas, temas, fóruns criados recentemente e tags mais usadas |
| `/foruns`, `/foruns/:slug`, `/topicos/:id` | Endereços antigos: redirecionam para as páginas novas da Comunidade |

**Cliente (cidadão)**

| Rota | Tela |
| --- | --- |
| `/painel` | Início: resumo pessoal, reclamações recentes, mapa da cidade e convite para a Comunidade |
| `/registrar` | Registro em 3 etapas: **onde se aplica** (Cidade toda ou Bairro; em Bairro, campo "Nome do bairro" com sugestões de nomes já usados, mapa obrigatório, rua e referência; em Cidade toda, nada de bairro e ponto de exemplo opcional), problema (categoria, "Outros" com especificação, descrição, foto) e revisão. Trocar de Bairro para Cidade toda apaga o bairro, a rua e o ponto digitados |
| `/minhas-ocorrencias` | Minhas reclamações com filtros, status e endereço |
| `/propostas/nova` | Nova proposta: título, descrição, categoria, onde se aplica (cidade toda ou bairro digitado), até 3 imagens, link e códigos de reclamações relacionadas |
| `/comunidade/foruns/novo` | Criar fórum: nome, finalidade, tema, bairro (opcional, livre), tags e regras |
| `/comunidade/minhas` | Fóruns criados e seguidos, discussões abertas e comentadas |
| `/notificacoes` | Central de notificações: todas ou não lidas, marcar como lida, abrir o conteúdo |
| `/perfil` | Nome, senha, **bairros de interesse** digitados (privados, até 5) e como a pessoa aparece para os outros |

**Funcionário**

| Rota | Tela |
| --- | --- |
| `/admin` | Painel administrativo |
| `/admin/fila` | **Fila de Análise**: pontuação explicada item a item, ordenação (pontuação, antigas, recentes, confirmações, sem movimentação, categoria, bairro e rua, status), abas Todas / **Minhas tarefas** / Sem responsável, atalhos Atrasadas, Sem movimentação, Reavaliação pedida, Aguardando cidadão e Duplicatas, filtro de prioridade e os filtros comuns |
| `/admin/reclamacoes` | Todas as reclamações |
| `/ocorrencias/:id` | Bloco **Gestão da equipe**: responsável (atribuir, a mim, remover), prioridade com motivo obrigatório, possíveis duplicatas (mesma categoria, até 200 m, até 90 dias), mudar status (reabrir exige justificativa), anotações internas ou públicas, pedir informação ao cidadão, registrar resolução com fotos de antes e depois, anexar evidências, corrigir endereço e abrangência (bairro ↔ cidade toda; virar cidade toda apaga bairro, rua e referência) |
| `/admin/moderacao` | Denúncias agrupadas por conteúdo, inclusive fóruns (ocultar com motivo padronizado ou manter), **fóruns novos aguardando aprovação** (aprovar ou recusar, quando a aprovação está ligada), conteúdo oculto (restaurar), sinais de spam (texto repetido, rajadas) e atividade da comunidade em 7 e 30 dias |
| `/admin/relatorios` | PDF com prévia (agora com comparação de períodos, tempo de resolução, reabertas e propostas) e **CSV** |
| `/admin/indicadores` | Indicadores com comparação com o período anterior, tempo médio e mediano de resolução, reabertas, propostas mais apoiadas, evolução por dia, semana ou mês |
| `/admin/status` | Status das reclamações (administrador edita; agora com a opção "conta como resolvida") |

**Somente administrador**

| Rota | Tela |
| --- | --- |
| `/admin/equipe` | Liberar ou remover acesso de funcionário |
| `/admin/configuracoes` | Pesos da priorização, categorias (criar, renomear, desativar), fóruns (ligar ou desligar a aprovação prévia de fóruns criados por pessoas, criar fórum oficial, desativar qualquer fórum, publicar tópico de apoio nos oficiais) e fases das propostas |
| `/admin/auditoria` | Histórico de ações administrativas, filtrável por tipo |

Contas de funcionário não registram reclamações, não confirmam, não votam em propostas e não avaliam resoluções: o apoio e a avaliação refletem só os moradores. Elas podem comentar e aparecem com o selo "Equipe".

---

## API

Todas as rotas ficam sob `/api`. Requisições que alteram dados (POST, PUT, PATCH, DELETE) precisam do cabeçalho `X-Requested-With: UrbanTalk`; o site envia automaticamente. A sessão é um cookie `httpOnly`.

Erros seguem sempre o formato:

```json
{ "error": { "code": "invalid_request", "message": "Revise os campos destacados.", "fields": { "email": "Informe um e-mail válido." } } }
```

| Método e rota | Acesso | Descrição |
| --- | --- | --- |
| `GET /health` | Público | Verificação de funcionamento |
| `POST /auth/register` | Público | Cadastro `{ name, email, password }`. Sempre cria usuário comum |
| `POST /auth/login` | Público | Login `{ email, password, profile }`, com `profile` `cliente` ou `funcionario`. Só confere o papel do banco |
| `PATCH /auth/me` | Logado | Altera o nome |
| `POST /auth/password` | Logado | Troca a senha `{ current, next }` |
| `POST /auth/logout` | Público | Encerra a sessão |
| `GET /auth/me` | Público | Usuário logado ou `{ user: null }` |
| `GET /categories` | Público | Categorias ativas, com `requiresDetail` (verdadeiro para "Outros") |
| `GET /neighborhoods?q=` | Público | Sugestões de bairros já digitados `{ key, name, uses }` (grafia mais usada de cada chave). Não é cadastro: qualquer nome é aceito |
| `GET /statuses` | Público | Todos os status configurados (inclusive desativados, para o histórico) |
| `GET /occurrences` | Público | Lista paginada. Filtros: `category`, `neighborhood` (texto; compara sem acentos nem maiúsculas, nome inteiro), `scope` (`cidade`/`bairro`), `status`, `situation` (`abertas`/`encerradas`), `street`, `from`, `to` (AAAA-MM-DD), `q` (busca na descrição, rua, especificação e referência). Paginação: `page`, `pageSize` (até 50), `sort` (`recent`, `oldest`, `confirmations`) |
| `GET /occurrences/map` | Público | Marcadores para o mapa (mesmos filtros, até 2.000) |
| `GET /occurrences/:id` | Público | Detalhe com histórico de status e atualizações públicas. Nunca traz anotações internas nem dados de quem registrou |
| `POST /occurrences` | Cliente | Cria reclamação (multipart): `categoryId`, `categoryDetail` (obrigatório em "Outros"), `scope` (`cidade` ou `bairro`), `neighborhoodName` (obrigatório em bairro, ignorado em cidade toda), `street` (opcional), `description`, `latitude`/`longitude` (obrigatórios em bairro, opcionais e sempre juntos em cidade toda), `reference` (opcional), `photo` (opcional, JPG/PNG/WebP, até 5 MB). Cabeçalho opcional `X-Idempotency-Key`: o mesmo envio repetido devolve a reclamação já criada |
| `POST /occurrences/:id/confirmations` | Cliente | Confirma ocorrência de outra pessoa (uma vez por pessoa) |
| `GET /me/occurrences` | Logado | Histórico pessoal, mesmos filtros e paginação |
| `GET /me/summary` | Logado | Totais pessoais por status e confirmações |
| `GET /photos/:arquivo` | Público | Foto de uma ocorrência |
| `GET /admin/overview` | Funcionário | Números do painel administrativo |
| `GET /admin/occurrences` | Funcionário | Lista com os mesmos filtros (inclui `street`) e `latestId` para destacar as novas |
| `GET /admin/occurrences/:id` | Funcionário | Detalhe completo: quem registrou, anotações internas e públicas, autores do histórico |
| `PATCH /admin/occurrences/:id/status` | Funcionário | `{ status, note }`; só status ativos; grava status anterior, novo, data, funcionário e mensagem |
| `POST /admin/occurrences/:id/notes` | Funcionário | `{ visibility: 'interna' \| 'publica', body }` |
| `DELETE /admin/occurrences/:id` | Administrador | Exclui a reclamação de vez (histórico, anotações, confirmações, evidências e fotos); publicações e propostas que a citavam ficam sem a ligação; grava resumo na auditoria e remove os avisos que apontavam para ela |
| `PATCH /admin/occurrences/:id/address` | Funcionário | Corrige `scope`, `neighborhoodName`, `street`, `reference` (fica na auditoria; `cidade` apaga o bairro) |
| `GET /admin/statuses` | Funcionário | Status com contagem de uso e `canManage` |
| `POST /admin/statuses` | Administrador | Cria `{ name, description, color, isClosed }` |
| `PATCH /admin/statuses/:id` | Administrador | Edita, ativa/desativa, `isInitial: true` |
| `PUT /admin/statuses/order` | Administrador | Nova ordem `{ ids }` |
| `DELETE /admin/statuses/:id` | Administrador | Só status nunca usados |
| `GET/POST/PATCH /admin/team` | Administrador | Lista, libera acesso a uma conta existente, muda o papel (nunca o próprio) |
| `GET /admin/indicators` | Funcionário | Totais (em aberto, encerradas), distribuições por status, categoria e bairro, série temporal |
| `GET /admin/reports/occurrences.pdf` | Funcionário | Relatório PDF. `from` e `to` obrigatórios, demais filtros opcionais |
| `GET /community/posts` | Logado | Feed paginado por cursor: `filter` (`recentes`, `ocorrencias`, `minhas`), `occurrence`, `before`, `limit` |
| `POST /community/posts` | Logado | `{ body, occurrenceId? }` (3 a 500 caracteres, até 2 links, sem repetir a mesma mensagem em 10 min) |
| `DELETE /community/posts/:id` | Autor ou funcionário | Remove (funcionário remove por moderação, com auditoria) |
| `PUT` / `DELETE /community/posts/:id/like` | Logado | Apoia ou retira o apoio; uma curtida por pessoa; a primeira curtida de cada pessoa avisa o autor |
| `GET /community/posts/:id` | Logado | Uma publicação (usada pelo link dos avisos) |
| `GET/POST /community/posts/:id/comments` | Logado | Lista e cria comentários (até 300 caracteres) |
| `DELETE /community/comments/:id` | Autor ou funcionário | Remove comentário |

**Acompanhamento**

| Método e rota | Acesso | Descrição |
| --- | --- | --- |
| `POST /occurrences/:id/info-requests/:rid/answer` | Quem registrou | Responde ao pedido da equipe (multipart: `answer`, `photo` opcional) |
| `POST /occurrences/:id/feedback` | Cliente | `{ verdict: 'resolvido' \| 'persiste', comment }` sobre a resolução atual; uma vez por resolução; "persiste" exige comentário e pede reavaliação |
| `POST /admin/occurrences/:id/info-requests` | Funcionário | `{ question }`; um pedido aberto por vez; avisa quem registrou |
| `DELETE /admin/occurrences/:id/info-requests/:rid` | Funcionário | Cancela o pedido |
| `POST /admin/occurrences/:id/resolution` | Funcionário | Multipart `status` (que conta como resolvido), `description`, `antes[]`, `depois[]` (até 3 cada) |
| `POST /admin/occurrences/:id/evidence` | Funcionário | Multipart `kind` (`antes`, `depois`, `acompanhamento`), `caption`, `photos[]` |
| `GET /notifications` | Logado | `filter` (`todas`, `nao-lidas`), `before`; só as próprias |
| `GET /notifications/unread-count` | Logado | Contador |
| `GET /notifications/stream` | Logado | Tempo real (Server-Sent Events): evento `notificacoes` com `{ unread, latest }` sempre que um aviso da pessoa é criado, lido ou removido |
| `POST /notifications/:id/read`, `POST /notifications/read-all` | Logado | Marcar como lida |

**Participação**

| Método e rota | Acesso | Descrição |
| --- | --- | --- |
| `GET /forums` | Público | Fóruns ativos: `q` (nome, descrição, tags, bairro), `theme`, `neighborhood`, `kind` (`oficial`/`comunidade`), `following=1`, `sort` (atividade, populares, novos, nome), `page`; traz também os temas |
| `POST /forums` | Logado | Cria fórum `{ name, description, theme, tags[], neighborhoodName?, rules? }`; nome único (sem diferenciar acentos), até 3 por dia; fica `pendente` se a aprovação estiver ligada |
| `GET/PATCH /forums/:slug` | Público / Quem criou ou administrador | Detalhe com números reais e permissões; edição de descrição, tema, tags, bairro e regras (nome e ativação só administrador) |
| `PUT/DELETE /forums/:slug/follow` | Logado | Seguir fórum (avisos agrupados de novas discussões) |
| `GET /community-explore`, `GET /me/participation` | Público / Logado | Descoberta da Comunidade e Minhas participações |
| `PUT/DELETE /topics/:id/vote`, `PUT/DELETE /discussions/comments/:id/vote` | Logado | Voto de "útil", um por pessoa, nunca no próprio conteúdo |
| `GET/POST /forums/:slug/topics` | Público / Logado | Lista (`sort` atividade, populares, recentes, respostas; `q`, `tag`, `page`) e cria discussão `{ title, body, tags[], occurrenceId? }` |
| `GET/DELETE /topics/:id` | Público / Autor ou funcionário | Detalhe e remoção (oculta, sem apagar) |
| `PATCH /topics/:id/flags` | Funcionário ou quem criou o fórum | `{ pinned, locked }` |
| `GET/POST /topics/:id/comments`, `GET/POST /proposals/:id/comments` | Público / Logado | Comentários com `parentId` opcional (resposta a comentário) |
| `PUT/DELETE /topics/:id/follow`, `PUT/DELETE /proposals/:id/follow` | Logado | Acompanhar |
| `DELETE /discussions/comments/:id` | Autor ou funcionário | Remove comentário |
| `GET /proposal-statuses` | Público | Fases das propostas |
| `GET /proposals`, `GET /proposals/:id` | Público | Lista (`sort` votos, em-alta, recentes; `category`, `neighborhood` (texto) ou `cidade`, `status`, `situation` abertas/finais, `q`, `mine`, `page`) e detalhe |
| `POST /proposals` | Cliente | Multipart `title`, `body`, `categoryId`, `neighborhoodName` (vazio = cidade toda), `referenceUrl`, `occurrenceIds`, `images[]` (até 3) |
| `PUT/DELETE /proposals/:id/vote` | Cliente | Apoia ou retira; bloqueado em fase final |
| `PATCH /proposals/:id/status` | Funcionário | `{ status, note }`; fase final exige explicação |
| `PUT/DELETE /proposals/:id/occurrences/:occ` | Autor ou funcionário | Relaciona reclamações |
| `DELETE /proposals/:id` | Autor ou administrador | Autor remove a própria; administrador remove qualquer uma por moderação (auditada, restaurável na Moderação) |
| `GET/PUT /me/interests` | Logado | Bairros de interesse `{ neighborhoods: string[] }` (até 5, grafias iguais contam uma vez) |
| `POST /reports` | Logado | Denúncia `{ targetType, targetId, reason, details }` (inclui `forum`; fóruns oficiais não são denunciáveis); uma por pessoa e conteúdo |

**Visualização e busca**

| Método e rota | Acesso | Descrição |
| --- | --- | --- |
| `GET /occurrences/heat` | Público | Grade de concentração (mesmos filtros), com `reliable` falso abaixo de 20 registros |
| `GET /occurrences/neighborhoods` | Público | Resumo por bairro (grafias iguais somadas pela chave normalizada), total da cidade toda à parte e rankings (mínimo de 3 registros) |
| `GET /explore` | Público | Conteúdo da página Explorar; `lat`/`lng` ou `neighborhood` para "perto de você" |
| `GET /search` | Público | `q`, `type`, `category`, `neighborhood`, `page`; publicações só para quem está logado |
| `GET /admin/reports/occurrences.csv` | Funcionário | Planilha CSV com os mesmos filtros |
| `GET /admin/indicators` | Funcionário | Agora inclui `extra` (comparação, tempo de resolução, reabertas, propostas) e aceita `granularity` (`dia`, `semana`, `mes`) |

**Equipe e administração**

| Método e rota | Acesso | Descrição |
| --- | --- | --- |
| `GET /admin/queue` | Funcionário | Fila de Análise com `view`, `priority`, `flag`, `sort`, `situation` e os filtros comuns |
| `GET /admin/staff-members` | Funcionário | Funcionários para atribuição |
| `GET /admin/occurrences/:id/similar` | Funcionário | Possíveis duplicatas |
| `PATCH /admin/occurrences/:id/assignee` | Funcionário | `{ userId \| null }` |
| `PATCH /admin/occurrences/:id/priority` | Funcionário | `{ priority \| null, reason }` |
| `PATCH /admin/occurrences/:id/duplicate` | Funcionário | `{ of \| null, note }`; não apaga nem mescla |
| `GET /admin/moderation/reports`, `POST /admin/moderation/decide` | Funcionário | Fila de denúncias e decisão (ocultar com motivo ou manter) |
| `POST /admin/moderation/visibility`, `GET /admin/moderation/hidden` | Funcionário | Ocultar ou restaurar; lista do que está oculto |
| `GET /admin/moderation/spam`, `GET /admin/moderation/activity` | Funcionário | Sinais de spam e atividade |
| `GET /admin/settings/priority` / `PUT` | Funcionário / Administrador | Pesos da priorização |
| `GET /admin/audit` | Administrador | Histórico administrativo |
| `GET/POST/PATCH /admin/categories` | Administrador | Categorias |
| `GET/POST/PATCH /admin/forums`, `POST /admin/forums/:slug/institutional-topics` | Administrador | Todos os fóruns (inclusive pendentes e ocultos), fórum oficial e tópicos de apoio |
| `GET /admin/forums-pending`, `POST /admin/forums/:id/review` | Funcionário | Fila de aprovação de fóruns `{ decision: 'aprovar' \| 'recusar' }` |
| `GET /admin/settings/forums` / `PUT` | Funcionário / Administrador | Aprovação prévia de fóruns `{ approvalRequired }` |
| `GET/POST/PATCH /admin/proposal-statuses` | Funcionário (leitura) / Administrador | Fases das propostas |

---

## Banco de dados

Migrações versionadas em `api/src/db/migrations/`; `npm run migrate` aplica as pendentes (o servidor também aplica ao iniciar):

- `20261014000001_initial.ts`: estrutura original.
- `20261015000001_perfis_status_feed.ts`: perfis, status configuráveis, rua, "Outros", anotações, comunidade e auditoria. Recria `users` e `occurrences` pelo procedimento oficial do SQLite (tabela nova, cópia, troca de nome) para mudar restrições sem perder nada; ao final confere todas as chaves estrangeiras. Reclamações antigas ficam com rua e especificação vazias e mantêm status e histórico.
- `20261016000001_expansao.ts`: só acrescenta (nenhuma tabela é recriada). Novas colunas em `occurrences` (prioridade e motivo, responsável, duplicata, reaberturas, pedido de reavaliação), `statuses` (conta como resolvida; "Resolvida" já vem marcada), `posts` e `post_comments` (ocultação). Novas tabelas listadas abaixo. As 8 fases de proposta são criadas aqui. Os 9 fóruns e os tópicos de apoio são criados por `seed-base.ts` sem duplicar (os grupos de bairro que existiam até esta versão foram retirados na migração seguinte).

- `20261017000001_localizacao_comunidade.ts`: localização livre e Comunidade. **Antes de rodar, o sistema copia o banco para `api/data/backups/`** (esta migração não tem volta automática). Recria `occurrences` com `scope` (`cidade`/`bairro`), `neighborhood_name` (como a pessoa digitou) e `neighborhood_key` (sem acentos, minúsculas, espaços únicos), latitude e longitude opcionais e restrições no banco: cidade toda não tem bairro; bairro exige nome e ponto; latitude e longitude andam juntas. As reclamações existentes viram `bairro` com o nome que tinham na lista (nada é perdido). `proposals` ganha `neighborhood_name`/`neighborhood_key` copiados do bairro antigo. `forums` é recriada com dono, tema, tags, bairro livre, regras e situação (`ativo`/`pendente`/`recusado`): os 9 temáticos viram fóruns **oficiais**; grupos de bairro **com discussões** viram fóruns da comunidade com o mesmo endereço, discussões e respostas; grupos vazios são descartados. Novas tabelas de votos de discussão e de comentário, seguidores de fórum e `user_places` (bairros de interesse em texto, migrados da tabela antiga). Denúncias passam a aceitar fórum. Ao final, todas as chaves estrangeiras são conferidas.

| Tabela | Conteúdo | Regras |
| --- | --- | --- |
| `users` | nome, e-mail, hash da senha, papel | e-mail único; papel `user` (cliente), `staff` (funcionário) ou `admin` (funcionário que gerencia status e equipe) |
| `statuses` | slug, nome, descrição, cor, encerra?, inicial?, ativo?, ordem | slug e nome únicos; **só um inicial** (índice parcial único) |
| `categories` | slug, nome, descrição, ícone, ordem, ativa, exige especificação | slug único; "Outros" tem `requires_detail` |
| `neighborhoods` | lista antiga de bairros | **legado**, sem uso pelo sistema; mantida só para não quebrar referências de bancos antigos |
| `occurrences` | autor, categoria, especificação de "Outros", **abrangência** (`cidade`/`bairro`), **bairro como digitado e chave normalizada**, rua, descrição, referência, latitude e longitude (opcionais na cidade toda), foto, status, chave de envio, demo, datas | CHECKs: cidade toda sem bairro, bairro com nome e ponto, coordenadas sempre em par; índices em status, categoria, chave do bairro, abrangência, rua, data e autor |
| `confirmations` | ocorrência, usuário, data | **único por (ocorrência, usuário)** |
| `status_history` | ocorrência, status anterior e novo, quem alterou, mensagem, data | nunca apagado; criado no registro e em cada mudança |
| `occurrence_notes` | ocorrência, autor, `interna` ou `publica`, texto, data | anotações nunca são sobrescritas, cada uma é um registro |
| `posts` | autor, reclamação ligada (opcional), texto, data, exclusão | exclusão lógica, com quem excluiu |
| `post_comments` | publicação, autor, texto, data, exclusão | exclusão lógica |
| `post_likes` | publicação, usuário, data | **chave primária (publicação, usuário)**: curtida não se repete |
| `post_like_notices` | publicação, usuário, data | **chave primária (publicação, usuário)**: cada pessoa gera no máximo um aviso de curtida por publicação, mesmo descurtindo e curtindo de novo |
| `audit_log` | quem, ação, alvo, detalhes, data | mudanças de status configurados, de equipe, de endereço, atribuição, prioridade, duplicata, moderação, categorias, fóruns, fases e configurações |
| `occurrence_events` | ocorrência, autor, tipo, `interna`/`publica`, texto, dados, data | linha do tempo: atribuição, prioridade, evidência, resolução, avaliação, reabertura, duplicata, endereço |
| `occurrence_info_requests` | ocorrência, quem pediu, pergunta, resposta, foto, datas | só um pedido aberto por vez; resposta só de quem registrou |
| `occurrence_resolutions` | ocorrência, quem resolveu, status, descrição, data, substituída em | reabrir marca como substituída; nunca apaga |
| `occurrence_evidence` | ocorrência, resolução, autor, `antes`/`depois`/`acompanhamento`, foto, legenda | fotos regravadas sem metadados |
| `resolution_feedback` | resolução, pessoa, `resolvido`/`persiste`, comentário | **único por (resolução, pessoa)** |
| `proposal_statuses` | fases das propostas | só uma inicial (índice parcial); `is_final` encerra a votação |
| `proposals`, `proposal_images`, `proposal_occurrences`, `proposal_status_history` | propostas, imagens, reclamações relacionadas, histórico de fases | ocultação lógica |
| `proposal_votes` | proposta, pessoa, data | **chave primária (proposta, pessoa)**: voto único mesmo com cliques simultâneos |
| `forums` | fóruns `oficial` ou `comunidade`: nome e chave do nome, finalidade, tema, tags, bairro livre, regras, quem criou, situação | slug único; nome não se repete (sem diferenciar acentos); nenhum fórum é criado automaticamente; ocultação lógica |
| `topics`, `discussion_comments` | discussões (de morador ou de apoio, sem autor) com tags e reclamação ligada; comentários com resposta | ocultação lógica |
| `topic_votes`, `comment_votes` | voto de "útil" | **chave primária (item, pessoa)**: um voto por pessoa; separados de `confirmations` e `proposal_votes` |
| `forum_follows`, `follows` | quem segue cada fórum e o que cada pessoa acompanha | chaves primárias compostas |
| `user_places` | bairros de interesse em texto | chave primária (pessoa, chave do bairro); nunca aparecem para outros |
| `notifications` | pessoa, tipo, título, texto, link interno, contador, chave de agrupamento, lida em | **índice único parcial**: um aviso não lido por chave; novos eventos aumentam o contador |
| `content_reports` | denúncias com motivo padronizado e decisão | **única por (pessoa, conteúdo)** |
| `settings` | pesos da priorização e aprovação prévia de fóruns | alteração auditada |

Contagens de curtidas e comentários são calculadas nas consultas, não guardadas em colunas, para não poderem ser manipuladas nem ficarem fora de sincronia.

Categorias, status e fóruns oficiais iniciais ficam em `api/src/db/seed-base.ts`. **Não há lista de bairros**: o nome é digitado por quem registra. Filtros, buscas, indicadores e relatórios comparam pela chave normalizada (sem acentos, minúsculas e com espaços únicos), então "Jardim São Conrado", "jardim sao conrado" e "JARDIM  SAO CONRADO" são o mesmo bairro, mas "Jardim Ipê" e "Jardim Ipanema" continuam separados (nunca há junção por semelhança). Nas listas aparece a grafia mais usada; em empate, a que tem acentos e maiúsculas.

Datas são gravadas pelo servidor em UTC e os filtros por dia usam o fuso de Sorocaba (UTC-3).

---

## Segurança e privacidade

- Senhas com **scrypt** e sal aleatório; login com mensagem única para e-mail inexistente ou senha errada.
- **Perfis conferidos no servidor**: o papel vem do banco a cada requisição; rotas da equipe exigem `staff` ou `admin`, gestão de status e equipe exige `admin`, registrar e confirmar exigem conta de cliente. Ninguém vira funcionário pelo cadastro, pelo seletor do login ou mudando a requisição.
- **Anotações internas** só saem pelas rotas `/admin`; a rota pública da reclamação nunca as consulta.
- **Comunidade** mostra só primeiro nome e inicial do sobrenome; e-mail nunca aparece. Limites por pessoa contra spam e bloqueio de mensagem repetida.
- Sessão em cookie `httpOnly`, `SameSite=Lax`, assinada com o `JWT_SECRET` do `.env`. O papel do usuário é lido do banco a cada requisição, nunca do token nem do corpo da requisição.
- Proteção contra CSRF pelo cabeçalho obrigatório em requisições de escrita.
- Permissões verificadas no servidor em cada rota; o front apenas esconde o que a pessoa não pode usar.
- Ocorrências públicas **não exibem nome, e-mail nem id** de quem registrou.
- Fotos validadas pelo conteúdo do arquivo (não pela extensão), limitadas a 5 MB, regravadas sem metadados e servidas apenas por nome aleatório.
- Cabeçalhos de segurança com Helmet e política de conteúdo (CSP) restrita.
- CORS fechado por padrão; liberar origens só via `CORS_ORIGINS`.
- Limite de tentativas no login/cadastro (20 a cada 15 min por IP) e de registros (30 por hora por usuário).
- Erros internos são registrados no terminal sem dados sensíveis e chegam ao usuário como mensagem genérica.
- **Linha do tempo decidida no servidor**: o público vê status, atualizações públicas, evidências e resolução; quem registrou vê também os pedidos de informação; a equipe vê tudo, incluindo notas internas, prioridade, atribuição e nomes. Comentários das avaliações "continua" ficam só com a equipe.
- **Busca e Explorar** só consultam conteúdo público; notas internas nunca são pesquisadas e publicações do feed só aparecem para quem está logado.
- **Moderação sem apagar**: conteúdo ocultado continua no banco com quem ocultou, quando e por qual motivo; restaurar também fica no histórico.
- **Localização**: "perto de você" usa a posição do navegador só naquela consulta, sem salvar; bairros de interesse são privados e não pedem endereço.
- **CSV** neutraliza células que começam com `=`, `+`, `-` ou `@` (evita fórmulas maliciosas no Excel) e não inclui descrição nem dados de quem registrou.
- **Funcionário comum x administrador**: categorias, fóruns oficiais, aprovação prévia de fóruns, fases, pesos da priorização, equipe e histórico administrativo exigem administrador no servidor.
- **Fóruns criados por pessoas**: só quem criou (ou o administrador) edita; nome e desativação só pelo administrador; fórum pendente ou recusado só aparece para quem criou e para a equipe; limite de 3 por pessoa por dia e de 6 tentativas por hora; denúncia e ocultação pela moderação como qualquer conteúdo.

---

## Serviços externos

**Mapa.** Usa os tiles públicos do OpenStreetMap, que não exigem chave, mas pedem uso moderado. Para uma fase acadêmica e de validação, isso basta. Para trocar de provedor (MapTiler, Stadia, Carto etc.):

1. Altere `tileUrl` e `attribution` em `web/src/environments/environment.ts` e `environment.prod.ts`.
2. Inclua o domínio dos tiles em `MAP_TILE_HOSTS` no `api/.env`, para a política de segurança permitir as imagens.
3. Se o provedor exigir chave, coloque-a na URL dos tiles; ela ficará visível no navegador, então use uma chave restrita ao domínio.

Não há nenhuma outra dependência externa.

---

## Testes

Resultados da execução em 15/10/2026 (administração e notificações em tempo real):

- **API: 82 testes, todos passando** (`api/tests`). `admin-notificacoes.test.ts` (5): administrador exclui reclamação de outra pessoa (visitante 401; cidadão, outro cidadão, funcionário comum e chamada sem o cabeçalho da aplicação 403), com confirmações, anotações, foto no disco e avisos removidos, publicação ligada preservada sem a ligação, auditoria e 404 depois; administrador remove publicação do feed e os avisos dela somem; administrador remove proposta (cidadão e funcionário comum 403); curtida e comentário avisam só o autor, sem aviso das próprias ações, sem duplicar ao descurtir e curtir de novo nem em curtidas simultâneas, agrupados, persistidos após novo login; canal em tempo real (401 sem sessão, evento ao curtir, ao comentar e ao ler em outra aba, nada vazando para outra pessoa).
- **Ponta a ponta desta etapa** (Chromium, servidor real, três cidadãos, administrador e funcionário em sessões separadas): **31 verificações passando, sem erros de JavaScript**. Contador sobe sozinho em menos de meio segundo após curtida e comentário de outra pessoa, alerta na tela, central atualiza a lista aberta, clique abre a publicação com comentários, avisos continuam após novo login; administrador remove publicação (com confirmação e cancelamento) e o contador da autora volta sozinho; exclui reclamação pelo detalhe (confirmação com o código, cancelar não exclui), ela some da API, do mapa e da lista; funcionário comum não vê o botão e recebe 403. O canal também foi conferido pelo proxy do `npm run dev`. A suíte anterior de 80 verificações foi repetida sobre um banco antigo (migração nova aplicada com cópia de segurança) e continua passando.

Etapa anterior (refinamento de localização e Comunidade):

- **API: 77 testes** (`api/tests`). Novos ou reescritos naquela etapa:
  - `localizacao.test.ts` (4): reclamação da cidade toda sem bairro e sem ponto (o banco recusa bairro nela); bairro novo digitado aparecendo em detalhes, filtros (com e sem acento, maiúsculas, espaços extras), busca, sugestões, resumo por bairro, indicadores, fila, CSV e PDF, sem misturar "Jardim São Conrado" com "Jardim São Conrado II"; bairro obrigatório e com ponto; nenhum cadastro em tabela fechada; propostas com o mesmo bairro livre.
  - `participacao.test.ts` (8): só os 9 fóruns oficiais e nenhum fórum automático (nem ao registrar reclamação em bairro novo); pessoa cria fórum e outra o encontra (nome, bairro sem acento, tag), segue, abre discussão com tag, é avisada, responde em árvore; só quem criou edita e editar as regras não apaga tags nem bairro; votos de relevância únicos (inclusive simultâneos), nunca no próprio conteúdo, separados de confirmações e apoios, e ordenação por populares; aprovação prévia (só o administrador liga, pendente invisível para outros, aprovação pela equipe com aviso e auditoria); limite diário, denúncia de fórum, remoção de discussão auditada; bairros de interesse em texto, privados e limitados; propostas.
  - `perfis-status-feed.test.ts`: correção de endereço com bairro digitado e troca para cidade toda apagando o bairro no banco; cidadão recebe 403.
  - Os demais testes das etapas anteriores foram ajustados ao novo formato de bairro e continuam passando.
- **Front: 21 testes, todos passando** (`*.spec.ts`), incluindo a normalização de bairro igual à do servidor e a separação de tags.
- **Migração testada numa cópia do banco de demonstração antigo**: cópia de segurança criada, reclamações viraram "bairro" com o nome original, grupos de bairro com discussões viraram fóruns da comunidade, 16 discussões e respostas preservadas, propostas com o bairro copiado.
- **Ponta a ponta no navegador** (Chromium com servidor real e dados de demonstração, feito durante o desenvolvimento e não incluído como teste automatizado): **80 verificações, todas passando e sem erros de JavaScript**. O roteiro cobre:
  - endereços antigos `/foruns` redirecionando; cabeçalho e menu sem item de Fóruns; favicon SVG, ICO e manifesto novos servidos após o build, sem a cor antiga;
  - formulário exigindo "Onde se aplica?", campo "Nome do bairro" só em Bairro, bairro novo digitado salvo e exibido; troca Bairro → Cidade toda sem levar o nome antigo; reclamação da cidade toda sem mapa;
  - proposta com bairro digitado; fóruns oficiais preservados e sem grupos automáticos; criação de fórum, busca sem acento por outra pessoa, seguir, discussão ligada a reclamação existente, voto, comentário e resposta aninhada; Minhas participações e Explorar;
  - equipe corrigindo o bairro, fila, prioridade, pedido de informação, resolução, reavaliação, moderação e histórico administrativo;
  - filtro de bairro sem acento e em maiúsculas no mapa, filtro "Cidade toda", indicadores e relatório filtrados pelo bairro digitado;
  - 15 telas em 390 px sem rolagem horizontal (incluindo registro, fóruns, fórum, discussão, Explorar e Minhas participações da Comunidade).

---

## Critérios de aceitação

| # | Cenário | Como foi verificado |
| --- | --- | --- |
| 1 | Cliente entra e registra uma reclamação | API + navegador |
| 2 | Salva no banco e aparece no histórico do cliente | API + navegador |
| 3 | A mesma reclamação aparece para a equipe | API + navegador |
| 4 | Funcionário abre e atualiza o status | API + navegador |
| 5 | Cliente vê o novo status | API + navegador |
| 6 | Anotação interna não chega ao cliente | API (inclusive acesso direto) + navegador |
| 7 | Atualização pública aparece para o cliente | API + navegador |
| 8 | Histórico registra quem alterou | API + navegador |
| 9 | Criar novos status e desativar | API + navegador |
| 10 | Rua e bairro salvos | API + navegador |
| 11 | "Outros" exige especificação | API + navegador |
| 12 | Categorias antigas continuam funcionando | API (testes da versão anterior) |
| 13 | Cliente não executa operações administrativas pela API | API (11 rotas testadas) |
| 14 | Publicar, comentar e curtir | API + navegador |
| 15 | Dados permanecem após reiniciar | API (banco em arquivo reaberto) + navegador (recarga) |
| 16 | Sem curtidas repetidas | API + navegador |
| 17 | Estados de carregamento, erro e vazio no feed | Navegador (vazio); carregamento e erro implementados, conferidos no código |
| 18 | Layout em desktop e celular | Navegador, sem rolagem horizontal em 390 px |
| 19 | Relatórios com os novos campos e status | API + PDF conferido visualmente |
| 20 | Funcionalidades antigas operacionais | 34 testes antigos passando |

**Expansão**

| # | Critério | Como foi verificado |
| --- | --- | --- |
| E1 | Cidadão cria e acompanha uma ocorrência real | API + navegador (formulário, notificação, resposta, resolução) |
| E2 | Participação em fóruns (os grupos por bairro foram substituídos por fóruns criados pelas pessoas) | API + navegador |
| E3 | Proposta criada, com votos únicos e mudança de fase | API (votos simultâneos) + navegador |
| E4 | Notificações persistidas e levando ao conteúdo certo | API + navegador (clique abre a reclamação) |
| E5 | Mapa de concentração e relatórios com dados reais | API (contagens conferidas) + navegador |
| E6 | Funcionário analisa, atribui e atualiza conforme a permissão | API + navegador |
| E7 | Evidências e histórico de resolução preservados | API (reabertura mantém resolução e foto) |
| E8 | Relatórios comparativos respeitam os filtros | API |
| E9 | Moderação e permissões validadas no servidor | API (403 em rotas de administrador) + navegador |
| E10 | Funcionalidades existentes continuam operando | 52 testes anteriores + 16 de front + navegador |

**Localização e Comunidade**

| # | Critério | Como foi verificado |
| --- | --- | --- |
| L1 | Reclamação da cidade inteira sem bairro | API (inclusive restrição no banco) + navegador |
| L2 | Bairro novo digitado é aceito | API + navegador |
| L3 | Bairro aparece em detalhes, filtros e relatórios | API (detalhe, lista, fila, indicadores, CSV, PDF) + navegador |
| L4 | Busca com maiúsculas e acentos diferentes | API + navegador |
| L5 | Troca de Bairro para Cidade toda fica consistente | API (endereço corrigido pela equipe) + navegador (formulário) |
| L6 | Comunidade mostra fóruns, sem aba própria no menu | Navegador |
| L7 | Nenhum grupo automático de bairro | API + navegador |
| L8 | Pessoa cria fórum e outras encontram e participam | API + navegador |
| L9 | Fóruns, publicações e comentários existentes continuam | Migração testada + API + navegador |
| L10 | Favicon correto após o build, sem referências antigas | Navegador (arquivos servidos) + busca no `dist` |
| L11 | Desktop e celular | Navegador, 15 telas em 390 px |
| L12 | Permissões validadas no back-end | API (403 em edição de fórum, aprovação, configuração e correção de endereço) |

---

## Limitações e pendências

Antes de uma implantação pública:

- **HTTPS**: em produção, sirva atrás de HTTPS e defina `COOKIE_SECURE=true`.
- **Recuperação de senha e verificação de e-mail** não existem; exigiriam um serviço de envio de e-mail.
- **Moderação de reclamações**: reclamações não têm "ocultar"; o administrador pode excluí-las de vez, e a equipe pode marcá-las como duplicata ou encerrá-las com um status próprio (ex.: "Cancelada").
- **Notificações só dentro do site**: avisos aparecem em tempo real na central, no contador da barra lateral e num alerta na tela, por Server-Sent Events (com consulta a cada minuto como reserva). O canal em tempo real vale para um único processo do servidor, como no Render gratuito; com várias instâncias seria preciso um intermediário (ex.: Redis). Envio por e-mail ou push no celular dependeria de um serviço externo.
- **Exclusão de reclamação é definitiva**: não há lixeira; o resumo fica na auditoria. Publicações do feed, discussões e propostas removidas pela moderação continuam guardadas e podem ser restauradas.
- **Avisos de reclamações paradas** são gerados uma vez por dia quando o funcionário abre a central, não por um agendador.
- **Duplicatas** são sugeridas por categoria, distância (200 m) e data (90 dias); não há comparação do texto. Marcar não mescla confirmações nem históricos.
- **Mapa de concentração** em grade de ~500 m desenhada pelo próprio sistema (sem plugin externo); é uma visão aproximada e não considera população nem tamanho dos bairros.
- **Tempo de resolução** conta do registro até a resolução informada pela equipe, não até a execução real do serviço.
- **Comparação de períodos** usa o status atual das reclamações de cada período (uma reclamação do mês passado resolvida hoje conta como resolvida).
- **Busca** usa correspondência simples de texto (sem tolerância a erros de digitação nem ordenação por relevância).
- **Rua digitada pela pessoa**: não há busca automática de endereço (geocodificação). A rua é informada à mão e a equipe pode corrigi-la.
- **Atualização automática por consulta periódica** (20 a 60 s), não em tempo real; suficiente para o volume atual.
- **Edição e exclusão** de ocorrências pelo próprio autor não foram implementadas, para preservar o histórico. A confirmação também não pode ser desfeita. Propostas e discussões podem ser removidas pelo autor (ficam ocultas, não apagadas).
- **Bairro digitado pela pessoa**: não é calculado a partir do ponto no mapa nem conferido com uma base oficial. Grafias que só diferem em acentos, maiúsculas ou espaços são o mesmo bairro ("Vila Hortencia" e "Vila Hortência"); erros de digitação ("Vila Hortensia") viram bairros separados até a equipe corrigir o endereço. Não há junção automática por semelhança, de propósito.
- **Reclamações da cidade toda sem ponto** não aparecem no mapa nem na camada de concentração; aparecem na lista, nos indicadores e nos relatórios.
- **Grupos de bairro antigos** que tinham discussões foram mantidos como fóruns da comunidade sem dono (a equipe pode desativá-los em Configurações).
- **Fotos em disco local**: suficiente para validação. Em hospedagem com vários servidores ou disco temporário, migrar para um armazenamento de objetos.
- **SQLite** atende bem a fase acadêmica e a validação; para muitos acessos simultâneos, migrar para PostgreSQL ou SQL Server via Knex.
- **Limite de tentativas em memória**: reinicia junto com o servidor e não é compartilhado entre várias instâncias.
- **Tiles do OpenStreetMap**: aceitáveis em baixo volume; para uso amplo, contratar um provedor.
- **Dados de demonstração** usam posições aproximadas, apenas para ilustrar o mapa.
- O mapa depende de mouse ou toque para marcar o ponto; como alternativa acessível, a página oferece "Usar minha localização" e o campo de ponto de referência, e todas as ocorrências também aparecem em lista.
