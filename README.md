# Code Fusion Support Backoffice

Painel interno em HTML/CSS/JS com Firebase Hosting + Firebase Functions para dar suporte operacional ao time dos apps. Esta revisão da base inclui:

- login via Google com Firebase Auth no frontend
- allowlist de acesso via `SUPPORT_ALLOWED_EMAILS` e/ou `SUPPORT_ALLOWED_DOMAIN`
- busca segura de cliente no RevenueCat por `projectId` + `app_user_id`
- consulta de assinatura, entitlements e histórico derivado de compras
- ações administrativas controladas no Firestore
- trilha simples de auditoria

## Estrutura

- `web/`: frontend estático
- `functions/`: backend protegido para RevenueCat, Firestore e auditoria
- `docs/firestore-admin-mapping.md`: template para mapear collections/campos antes de produção

## Arquitetura Firebase

- `code-fusion-backoffice`: projeto do painel, com Hosting, Google Sign-In, Auth e Functions
- `rifa-73864`: projeto de dados do Rifa Facil, usado nas operações administrativas de rifa
- `rifa-digital-f21e7`: projeto de dados do Rifa Digital, usado nas operações administrativas de rifa
- a auditoria continua gravada no projeto do backoffice

## Pré-requisitos

- Node.js 22
- JDK 21+ para Firestore Emulator e demais emuladores do Firebase CLI atual
- Firebase CLI
- projeto Firebase com Auth, Firestore e Hosting habilitados

## Setup

1. Instale as dependências das Functions:

```bash
cd functions
npm install
```

2. Configure as variáveis comuns do backend:

```bash
cp functions/.env.example functions/.env
```

Em `functions/.env`, preencha pelo menos:

- `SUPPORT_ALLOWED_DOMAIN` ou `SUPPORT_ALLOWED_EMAILS`
- `TARGET_FIRESTORE_PROJECT_ID`
- `FIRESTORE_USERS_COLLECTION`
- `FIRESTORE_CREDIT_FIELD`
- `FIRESTORE_ALLOWED_UPDATE_FIELDS`
- `REVENUECAT_PROMOTIONAL_PRO_ENTITLEMENT` se quiser trocar o entitlement manual padrão `pro`; projetos em `REVENUECAT_PROJECTS_JSON` podem sobrescrever com `entitlementId`

3. Configure os secrets locais do Emulator em `functions/.secret.local` quando rodar localmente:

```dotenv
REVENUECAT_PROJECTS_JSON=[{"projectId":"rifa-facil","label":"Rifa Fácil","secretKey":"sk_xxx","revenueCatProjectId":"proj_xxx","v2SecretKey":"sk_xxx","entitlementId":"pro"},{"projectId":"rifa-digital","label":"Rifa Digital","secretKey":"sk_xxx","revenueCatProjectId":"proj_xxx","v2SecretKey":"sk_xxx","entitlementId":"pro"},{"projectId":"controle-estoque","label":"Controle de Estoque","secretKey":"sk_xxx","revenueCatProjectId":"proj_xxx","v2SecretKey":"sk_xxx","entitlementId":"pro"},{"projectId":"gerador-contratos","label":"Gerador de Contratos","secretKey":"sk_xxx","revenueCatProjectId":"proj_xxx","v2SecretKey":"sk_xxx","entitlementId":"pro"}]
TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON=
```

O Firebase Functions Emulator tenta ler esses valores do Secret Manager porque a Function declara
`REVENUECAT_PROJECTS_JSON` e `TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON` como `secrets`. Sem acesso ao
Secret Manager no projeto, `functions/.secret.local` é o override local esperado.

O módulo RevenueCat primeiro usa a API V2 para localizar o cliente sem criá-lo e só então usa a
API V1 para carregar o histórico e realizar ações manuais no projeto confirmado. O nome exibido
vem de `label`, o identificador interno usado pela rota vem de `projectId`, o ID real do projeto
RevenueCat vem de `revenueCatProjectId`, e o entitlement promocional vem de `entitlementId`.
`secretKey` é a chave V1, enquanto `v2SecretKey` deve ser uma chave V2 com apenas a permissão
**Customer information: Read**. O frontend recebe apenas metadados públicos, nunca as chaves.

Se as Functions do `code-fusion-backoffice` não tiverem permissão IAM nos projetos de rifa (`rifa-73864` e `rifa-digital-f21e7`), configure também:

- `TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON` em `functions/.secret.local` para desenvolvimento local
- `TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON` no Secret Manager para deploy, se não for usar IAM entre projetos

Exemplo de `REVENUECAT_PROJECTS_JSON`:

```json
[
  {
    "projectId": "rifa-facil",
    "label": "Rifa Fácil",
    "secretKey": "sk_xxx",
    "revenueCatProjectId": "proj_xxx",
    "v2SecretKey": "sk_xxx",
    "entitlementId": "pro"
  },
  {
    "projectId": "rifa-digital",
    "label": "Rifa Digital",
    "secretKey": "sk_xxx",
    "revenueCatProjectId": "proj_xxx",
    "v2SecretKey": "sk_xxx",
    "entitlementId": "pro"
  },
  {
    "projectId": "controle-estoque",
    "label": "Controle de Estoque",
    "secretKey": "sk_xxx",
    "revenueCatProjectId": "proj_xxx",
    "v2SecretKey": "sk_xxx",
    "entitlementId": "pro"
  },
  {
    "projectId": "gerador-contratos",
    "label": "Gerador de Contratos",
    "secretKey": "sk_xxx",
    "revenueCatProjectId": "proj_xxx",
    "v2SecretKey": "sk_xxx",
    "entitlementId": "pro"
  }
]
```

Esse JSON tambem pode ser informado como objeto, caso voce prefira usar o `projectId` como chave:

```json
{
  "controle-estoque": {
    "label": "Controle de Estoque",
    "secretKey": "sk_xxx",
    "revenueCatProjectId": "proj_xxx",
    "v2SecretKey": "sk_xxx",
    "entitlementId": "pro"
  },
  "gerador-contratos": {
    "label": "Gerador de Contratos",
    "secretKey": "sk_xxx",
    "revenueCatProjectId": "proj_xxx",
    "v2SecretKey": "sk_xxx",
    "entitlementId": "pro"
  }
}
```

4. Configure o frontend:

```bash
cp web/config.example.js web/config.js
```

Preencha o objeto `firebase` com a configuração pública do projeto `code-fusion-backoffice`.
Esse projeto é o responsável por Hosting, Auth e Google Sign-In do painel.
Os projetos de rifa ficam apenas no backend, como Firestore alvo das operações administrativas.

5. No Firebase Console do `code-fusion-backoffice`:

- habilite `Authentication > Sign-in method > Google`
- confira se `localhost` e `127.0.0.1` estão autorizados em `Authentication > Settings > Authorized domains`

6. Para deploy com Secret Manager, crie os secrets necessários:

```bash
firebase functions:secrets:set REVENUECAT_PROJECTS_JSON
firebase functions:secrets:set TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON
```

Se voce for usar apenas IAM entre projetos, pode manter `TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON` vazio so para satisfazer o deploy da Function.

Ambiente local recomendado:

- Node.js 22 para desenvolvimento local e deploy das Functions
- use `nvm use 22` antes de rodar comandos das Functions para evitar o Node 16 local em `/usr/local/bin/node`
- `npm run serve` agora valida Java antes de subir os emuladores; use JDK 21+ com `JAVA_HOME` e `PATH` apontando para essa instalacao
- os scripts deste repo usam explicitamente o projeto Firebase `code-fusion-backoffice`, sem depender do projeto ativo global do CLI

## Rodando localmente

Na raiz do projeto:

```bash
npm run serve
```

## Guardrail contra segredos (recomendado)

Este repositório inclui um scanner simples que falha se detectar padrões comuns de segredos (service account JSON, private keys, tokens, etc.).

Ative os hooks locais:

```bash
git config core.hooksPath .githooks
```

Opcionalmente, rode manualmente:

```bash
node scripts/scan-secrets.js
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

Não abra `web/index.html` por `file://`. O app depende de Hosting para servir os assets e reescrever `/api/*` para a Function `api`.

O fluxo local recomendado desta v1 é:

- Hosting, Functions, Firestore e Auth em emuladores
- `functions/.env` para configurações não secretas e `functions/.secret.local` para overrides de secrets
- `web/config.js` com `authEmulatorUrl: "http://127.0.0.1:9099"` para que o token do login local seja validado pelo Functions Emulator
- Firestore administrativo de rifa apontando para `rifa-73864` e `rifa-digital-f21e7`

O Functions Emulator usa uma versão isolada do Admin SDK e não deve validar tokens reais do Google Sign-In nesse fluxo local. Por isso, use o login emulado quando estiver em `http://127.0.0.1:5002`; para testar Auth real antes de publicar, use um deploy/staging do Firebase Hosting no projeto `code-fusion-backoffice`.

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
- `GET /rifa/:rifaId`
- `POST /rifa/:rifaId/lock`
- `POST /rifa/:rifaId/unlock`
- `POST /rifa/:rifaId/free-trial`
- `POST /rifa/:rifaId/update-fields`
- `GET /audit/logs`

Por padrão, `POST /rifa/:rifaId/update-fields` permite editar `email`, `name`,
`description`, `pixKey` e `pixType`. Se `RIFA_ALLOWED_UPDATE_FIELDS` estiver
definido no ambiente, essa lista substitui o padrão; inclua esses campos na variável
para manter a edição de nome, descrição e Pix habilitada no backoffice.

O campo `pixType` segue o contrato do app de rifa: `0` indefinido, `1` CPF,
`2` CNPJ, `3` e-mail, `4` telefone e `5` chave aleatória.

`GET /rifa/:rifaId` também enriquece compradores e reservados a partir das
coleções raiz `buyers` e `reservedBuyers`. Se algum alvo em `RIFA_LOOKUP_TARGETS`
usar nomes diferentes, configure `buyersCollection` e `reservedBuyersCollection`
nesse alvo.

## Segurança e modelagem

- O frontend nunca acessa RevenueCat nem Firestore Admin diretamente.
- Todas as rotas administrativas exigem `Authorization: Bearer <Firebase ID Token>`.
- O suporte entra com Google no projeto `code-fusion-backoffice`; o backend bloqueia quem estiver fora da allowlist.
- O backend usa conexões Admin secundárias para ler e escrever nos Firestores de rifa (`rifa-73864` e `rifa-digital-f21e7`).
- O Firestore administrativo é orientado por allowlist, não por edição genérica.
- As regras de cliente do Firestore estão fechadas por padrão; acessos operacionais passam pelo backend.

## Observações importantes

- O módulo Firestore assume, por padrão, uma coleção `users` com campo numérico `credits`. Ajuste isso antes de ir para produção.
- Se `TARGET_FIRESTORE_SERVICE_ACCOUNT_JSON` não for usado, a conta de serviço das Functions do `code-fusion-backoffice` precisa ter permissão nos projetos `rifa-73864` e `rifa-digital-f21e7`.
- O histórico do RevenueCat é derivado dos dados retornados pelo endpoint de subscriber, então ele mostra os eventos principais disponíveis nessa resposta.
- A busca multi-projeto usa a API V2, que não cria clientes. Um cliente recém-criado sem compras também aparece no aplicativo em que ele realmente existe.
- O entitlement promocional manual pode vir de `entitlementId` em cada projeto; se omitido, o backend usa `REVENUECAT_PROMOTIONAL_PRO_ENTITLEMENT` e depois `pro`.
- O backoffice pode conceder acesso manual direto no RevenueCat para clientes já encontrados na busca, sempre por projeto, com atalhos semanal, mensal, anual ou data final específica.
- Se a consulta RevenueCat estiver desabilitada, revise `revenueCatProjectId` e `v2SecretKey` de cada item de `REVENUECAT_PROJECTS_JSON`; a interface exibe um aviso até que todos os apps tenham a busca segura configurada.
- O template em `docs/firestore-admin-mapping.md` deve ser preenchido antes de liberar o módulo de escrita para o time.
