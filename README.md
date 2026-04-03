# Code Fusion Support Backoffice

Painel interno em HTML/CSS/JS com Firebase Hosting + Firebase Functions para dar suporte operacional ao time dos apps. Esta revisao da base inclui:

- login via Google com Firebase Auth no frontend
- allowlist de acesso via `SUPPORT_ALLOWED_EMAILS` e/ou `SUPPORT_ALLOWED_DOMAIN`
- busca de cliente no RevenueCat por `projectId` + `app_user_id`
- consulta de assinatura, entitlements e historico derivado de compras
- acoes administrativas controladas no Firestore
- trilha simples de auditoria

## Estrutura

- `web/`: frontend estatico
- `functions/`: backend protegido para RevenueCat, Firestore e auditoria
- `docs/firestore-admin-mapping.md`: template para mapear collections/campos antes de producao

## Arquitetura Firebase

- `code-fusion-backoffice`: projeto do painel, com Hosting, Google Sign-In, Auth e Functions
- `rifa-73864`: projeto de dados fixo, usado apenas para as operacoes administrativas no Firestore
- a auditoria continua gravada no projeto do backoffice

## Pre-requisitos

- Node.js 20+
- JDK 21+ para Firestore Emulator e demais emuladores do Firebase CLI atual
- Firebase CLI
- projeto Firebase com Auth, Firestore e Hosting habilitados

## Setup

1. Instale as dependencias das Functions:

```bash
cd functions
npm install
```

2. Configure as variaveis comuns do backend:

```bash
cp functions/.env.example functions/.env
```

Em `functions/.env`, preencha pelo menos:

- `SUPPORT_ALLOWED_DOMAIN` ou `SUPPORT_ALLOWED_EMAILS`
- `TARGET_FIRESTORE_PROJECT_ID`
- `FIRESTORE_USERS_COLLECTION`
- `FIRESTORE_CREDIT_FIELD`
- `FIRESTORE_ALLOWED_UPDATE_FIELDS`
- `REVENUECAT_PROMOTIONAL_PRO_ENTITLEMENT` se quiser trocar o entitlement manual padrao `pro`

3. Configure os secrets locais do Emulator em `functions/.secret.local` quando rodar localmente:

```dotenv
REVENUECAT_PROJECTS_JSON=[{"projectId":"ios-main","label":"iOS Main","secretKey":"rc_live_xxx"},{"projectId":"android-main","label":"Android Main","secretKey":"rc_live_yyy"}]
TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON=
```

O Firebase Functions Emulator tenta ler esses valores do Secret Manager porque a Function declara
`REVENUECAT_PROJECTS_JSON` e `TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON` como `secrets`. Sem acesso ao
Secret Manager no projeto, `functions/.secret.local` e o override local esperado.

O modulo RevenueCat do painel busca a lista do dropdown no backend. O nome exibido no select vem de
`label`, o identificador interno usado pela rota vem de `projectId` e a credencial privada usada
na consulta vem de `secretKey`.

Se as Functions do `code-fusion-backoffice` nao tiverem permissao IAM no projeto `rifa-73864`, configure tambem:

- `TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON` em `functions/.secret.local` para desenvolvimento local
- `TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON` no Secret Manager para deploy, se nao for usar IAM entre projetos

Exemplo de `REVENUECAT_PROJECTS_JSON`:

```json
[
  {
    "projectId": "ios-main",
    "label": "iOS Main",
    "secretKey": "rc_live_xxx"
  },
  {
    "projectId": "android-main",
    "label": "Android Main",
    "secretKey": "rc_live_yyy"
  }
]
```

Esse JSON tambem pode ser informado como objeto, caso voce prefira usar o `projectId` como chave:

```json
{
  "ios-main": {
    "label": "iOS Main",
    "secretKey": "rc_live_xxx"
  },
  "android-main": {
    "label": "Android Main",
    "secretKey": "rc_live_yyy"
  }
}
```

4. Configure o frontend:

```bash
cp web/config.example.js web/config.js
```

Preencha o objeto `firebase` com a configuracao publica do projeto `code-fusion-backoffice`.
Esse projeto e o responsavel por Hosting, Auth e Google Sign-In do painel.
O projeto `rifa-73864` fica apenas no backend, como Firestore alvo das operacoes administrativas.

5. No Firebase Console do `code-fusion-backoffice`:

- habilite `Authentication > Sign-in method > Google`
- confira se `localhost` e `127.0.0.1` estao autorizados em `Authentication > Settings > Authorized domains`

6. Para deploy com Secret Manager, crie os secrets necessarios:

```bash
firebase functions:secrets:set REVENUECAT_PROJECTS_JSON
firebase functions:secrets:set TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON
```

Se voce for usar apenas IAM entre projetos, pode manter `TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON` vazio so para satisfazer o deploy da Function.

Ambiente local recomendado:

- Node.js 20+; Node 22 tambem funciona bem para desenvolvimento local
- `functions/package.json` continua com runtime alvo `node: 20` para deploy
- `npm run serve` agora valida Java antes de subir os emuladores; use JDK 21+ com `JAVA_HOME` e `PATH` apontando para essa instalacao
- os scripts deste repo usam explicitamente o projeto Firebase `code-fusion-backoffice`, sem depender do projeto ativo global do CLI

## Rodando localmente

Na raiz do projeto:

```bash
npm run serve
```

Se o comando falhar na validacao de Java, um fluxo comum no macOS com Homebrew e:

```bash
brew install openjdk@21
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
```

Abra o app pela URL do Hosting local, por exemplo:

```text
http://127.0.0.1:5002
```

Nao abra `web/index.html` por `file://`. O app depende de Hosting para servir os assets e reescrever `/api/*` para a Function `api`.

O fluxo local recomendado desta v1 e:

- Hosting, Functions e Firestore em emuladores
- `functions/.env` para configuracoes nao secretas e `functions/.secret.local` para overrides de secrets
- Google Sign-In no projeto real `code-fusion-backoffice`, configurado em `web/config.js`
- Firestore administrativo apontando para o projeto fixo `rifa-73864`

## Como funciona a allowlist

- O suporte faz login com Google no frontend.
- O backend recebe o Firebase ID token e valida o e-mail em [functions/src/auth.js](/Users/antonioreis/Desktop/Projetos/Apps/Code%20Fusion/codefusion-backoffice/functions/src/auth.js).
- Esse token precisa ser emitido pelo projeto `code-fusion-backoffice`, que e o projeto do painel.
- Se `SUPPORT_ALLOWED_EMAILS` estiver preenchido, apenas os e-mails da lista entram.
- Se `SUPPORT_ALLOWED_DOMAIN` estiver preenchido, qualquer conta daquele dominio entra.
- Se ambos estiverem preenchidos, basta satisfazer uma das duas regras.

Exemplo:

```text
SUPPORT_ALLOWED_EMAILS=ana@empresa.com,bruno@empresa.com
SUPPORT_ALLOWED_DOMAIN=empresa.com
```

## Deploy

Faca login no Firebase CLI, se necessario:

```bash
firebase login
```

Depois:

```bash
npm run deploy
```

Esse deploy publica no Hosting principal do projeto `code-fusion-backoffice` e sobe as Functions no mesmo ambiente.

## Endpoints principais

- `GET /auth/session`
- `GET /revenuecat/projects`
- `GET /revenuecat/projects/:projectId/customer/:appUserId`
- `GET /revenuecat/projects/:projectId/customer/:appUserId/history`
- `POST /revenuecat/projects/:projectId/customer/:appUserId/promotional-access`
- `GET /firestore/admin-config`
- `POST /firestore/users/:userId/credit`
- `POST /firestore/users/:userId/debit`
- `POST /firestore/users/:userId/update-fields`
- `GET /audit/logs`

## Seguranca e modelagem

- O frontend nunca acessa RevenueCat nem Firestore Admin diretamente.
- Todas as rotas administrativas exigem `Authorization: Bearer <Firebase ID Token>`.
- O suporte entra com Google no projeto `code-fusion-backoffice`; o backend bloqueia quem estiver fora da allowlist.
- O backend usa uma conexao Admin secundaria para ler e escrever no Firestore do projeto `rifa-73864`.
- O Firestore administrativo e orientado por allowlist, nao por edicao generica.
- As regras de cliente do Firestore estao fechadas por padrao; acessos operacionais passam pelo backend.

## Observacoes importantes

- O modulo Firestore assume, por padrao, uma colecao `users` com campo numerico `credits`. Ajuste isso antes de ir para producao.
- Se `TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON` nao for usado, a conta de servico das Functions do `code-fusion-backoffice` precisa ter permissao no projeto `rifa-73864`.
- O historico do RevenueCat e derivado dos dados retornados pelo endpoint de subscriber, entao ele mostra os eventos principais disponiveis nessa resposta.
- A busca multi-projeto do RevenueCat ignora subscribers que parecem ter sido criados pela propria consulta; `first_seen` sozinho so conta quando nao coincide com o `request_date` e nao ha sinais de subscriber fantasma.
- O modulo RevenueCat exige escolha manual do projeto antes da consulta.
- O entitlement promocional manual usado pelo backoffice vem de `REVENUECAT_PROMOTIONAL_PRO_ENTITLEMENT`; se nao for informado, o backend usa `pro`.
- O backoffice pode conceder acesso manual Pro direto no RevenueCat para clientes ja encontrados na busca, sempre por projeto, com atalhos semanal, mensal, anual ou data final especifica.
- Se o dropdown do RevenueCat aparecer sem opcoes, revise `REVENUECAT_PROJECTS_JSON` em `functions/.secret.local` no ambiente local; a interface agora exibe um aviso direto quando essa configuracao estiver ausente ou invalida.
- O template em `docs/firestore-admin-mapping.md` deve ser preenchido antes de liberar o modulo de escrita para o time.
