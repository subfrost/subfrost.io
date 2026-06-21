# F2 Compliance — fatia 1: AML backend + Stripe

> **Data:** 2026-06-20 · **Status:** design aprovado, pré-implementação
> **Repo alvo:** `subfrost.io` (Next.js 16, App Router) · branch `feat/compliance-aml-stripe`
> **Origem:** consolidação da operação subfrost em `subfrost.io/admin` (sunset do `subfrost-admin` + growth admin do `subfrost-app`). Fases F0(auth)→F1(Growth)→**F2(Compliance)**→F3(decom).

## Contexto

O `subfrost-admin` (`C:\Alkanes Geral Dev\subfrost-admin`) é um Next.js **14 Pages Router** com
persistência **store JSON em arquivo** pra todo dado de compliance (só auth+review-links estão em
Postgres via Drizzle). O alvo `subfrost.io` é **Next 16 App Router** com **Prisma/Postgres** e o
padrão CMS da F1 (`lib/cms/privileges.ts`, `actions/cms/*`, `components/cms/*`, `app/admin/*`).

**O port não é cópia** — muda runtime (Pages→App Router), persistência (JSON→Prisma) e auth
(Cloudflare Access `role` → privileges do subfrost.io). Os models Prisma são **desenhados a partir
dos tipos TS** do admin (não há schema a traduzir).

Esta fatia cobre **AML backend + Stripe** (prioridade definida pelo flex). Diretiva operacional:
**resolver o máximo sem depender do flex** — tudo que precisa só de credencial viva (Stripe, BSA
E-Filing) nasce **gateado por config** com painel `NotHookedUp`, ligando quando a credencial chega.

Fora desta fatia (fases posteriores da F2): e-sign Documenso (~2460 LOC + infra externa),
review-links de revisor AML externo, tracker/subzero/audit internos.

## Decisões de arquitetura

1. **Stripe é dono do subfrost.io, direto — conformando ao MESMO contrato de APIs.** `lib/stripe/`
   gateado por `STRIPE_SECRET_KEY` (espelha o `isLive()`/`notHookedUp` do admin). **NÃO mexer no
   `subkube`** (`subfrost-api-nextjs`) — ele fica intocado e é sunsetado junto com o subfrost-admin
   no F3. **Input do flex ("Yes but we use the same APIs"):** a integração do subfrost.io conforma ao
   **mesmo contrato** já definido (as formas em `subkube-mock.ts` são "the contract we want subkube to
   expose") e aos mesmos produtos Stripe (Treasury/Issuing/Identity/…) — sem inventar uma superfície
   paralela. A **fonte live é um adapter plugável** atrás de `lib/stripe/source` que devolve as formas
   canônicas; se a fonte é o Stripe SDK direto ou um endpoint de mesmo-contrato vira **um swap atrás da
   fronteira da lib**, decidível quando a credencial chegar (o caminho live está gateado, então não
   trava agora). Quando o flex quiser ligar, ele seta `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET`)
   no subfrost.io — mesmo modelo da `REFERRAL_API_KEY` pendente da F1.
2. **Filings FinCEN em coluna `Json`.** O `data` do draft (Form 107/SAR/CTR) é `Json` no Postgres +
   validação **zod** no domain lib (espelha `DraftRecord<T>`). Dados aninhados (officers/owners/
   addresses) sem explodir em tabelas — YAGNI evitado; rascunho é revisado por humano antes do envio.
3. **KYC intakes vêm de provider externo** (Stripe Identity/Persona/Sumsub). Mesmo padrão gateado:
   sem fonte viva, intakes via seed/config; **dispositions sempre no Postgres**, append-only, pra
   trilha de auditoria.

## Privileges novos

Em `lib/cms/privileges.ts` (`ALL_PRIVILEGES` + `PRIVILEGE_LABELS`) e no enum `Privilege` do Prisma:

| Privilege | Cobre |
|---|---|
| `MANAGE_AML` | KYC (fila+disposição) · FinCEN (Form 107/SAR/CTR + submissions) · MTL · OFAC rescreen |
| `MANAGE_BILLING` | Stripe Treasury / Issuing / Offramp · tracker de aplicações Stripe |

- ADMIN herda ambos via `ALL_PRIVILEGES`. Concede-se a usuários específicos via `User.privileges`
  (grant por-usuário já suportado — **não precisa de role nova**; o persona "compliance" do admin
  vira um grant de `MANAGE_AML`).
- Nav em `app/admin/layout.tsx` gateada por `can("MANAGE_AML")` / `can("MANAGE_BILLING")`.

## Models Prisma novos

`prisma/schema.prisma` → após editar: `node_modules/.bin/prisma generate`. A produção via
`prisma db push` (io-sa), **sempre** precedido de `prisma migrate diff --from-url $DATABASE_URL
--to-schema-datamodel prisma/schema.prisma --script` confirmando que é **aditivo**.

```
// --- KYC ---
enum KycProvider { PERSONA STRIPE_IDENTITY SUMSUB }
enum RiskScore   { LOW MEDIUM HIGH }
enum KycStatus   { PENDING IN_REVIEW APPROVED REJECTED }
enum KycDecision { APPROVE REJECT REVIEW }

model KycIntake {
  id            String      @id @default(cuid())
  externalId    String?     // id no provider (quando vier de fonte viva)
  customerEmail String
  customerName  String
  provider      KycProvider
  riskScore     RiskScore
  status        KycStatus   @default(PENDING)
  submittedAt   DateTime
  dispositions  KycDisposition[]
  createdAt     DateTime    @default(now())
}

model KycDisposition {          // append-only (histórico)
  id        String      @id @default(cuid())
  intakeId  String
  intake    KycIntake   @relation(fields: [intakeId], references: [id], onDelete: Cascade)
  decision  KycDecision
  notes     String?
  by        String      // email do operador
  at        DateTime    @default(now())
}

// --- FinCEN / BSA ---
enum FincenFormType        { FORM107 SAR CTR }
enum FincenSubmissionStatus { QUEUED ACCEPTED REJECTED }

model FincenDraft {
  id         String         @id @default(cuid())
  type       FincenFormType
  data       Json           // validado por zod no domain lib
  updatedBy  String
  updatedAt  DateTime       @updatedAt
  createdAt  DateTime       @default(now())
  submissions FincenSubmission[]
  // Form 107 é singleton-por-entidade; SAR/CTR são muitos. A unicidade do
  // 107 é garantida no domain lib (upsert por type=FORM107), não por constraint.
}

model FincenSubmission {
  id          String                  @id @default(cuid())
  draftId     String
  draft       FincenDraft             @relation(fields: [draftId], references: [id])
  type        FincenFormType
  trackingId  String                  // LOCAL-<...> até o transporte BSA real
  status      FincenSubmissionStatus  @default(QUEUED)
  message     String?
  submittedBy String
  submittedAt DateTime                @default(now())
}

// --- MTL (money-transmitter licensing) ---
enum MtlStatus { AGENT_OF_STRIPE REGISTERED FILED_PENDING EXEMPT NOT_YET_NEEDED NEEDS_FILING }

model MtlEntry {
  state         String     @id  // 2-letter
  name          String
  status        MtlStatus
  nextFilingDue String?
  portalUrl     String?
  notes         String?
  updatedAt     DateTime   @updatedAt
}

// --- Stripe (overlays de mutação pré-live; leituras NÃO são persistidas) ---
model StripeAchQueued {
  id           String   @id @default(cuid())
  direction    String   // "in" | "out"
  amount       Int      // centavos
  counterparty String
  memo         String?
  queuedAt     DateTime @default(now())
  by           String
}

model StripeDisputeOverlay {
  id            String   @id        // = disputeId do Stripe
  evidence      String?
  evidenceFiles String[]            // nomes/paths
  submittedAt   DateTime @default(now())
  by            String
}

model StripeCardControl {
  cardId  String   @id
  state   String   // "active" | "paused" | "canceled"
  at      DateTime @default(now())
  by      String
}

enum StripeApplicationStatus { NOT_STARTED SUBMITTED PENDING APPROVED REJECTED }
model StripeApplication {
  id        String                  @id @default(cuid())
  product   String                  // "treasury" | "issuing" | "offramp"
  status    StripeApplicationStatus @default(NOT_STARTED)
  notes     String?
  updatedAt DateTime                @updatedAt
}
```

## Formas de dado externas (contrato de leitura do Stripe)

Espelham `subkube-mock.ts` (o contrato que a UI renderiza). `lib/stripe/` retorna estas formas,
seja da API viva (com chave) ou de seed determinístico (sem chave → painel `NotHookedUp`):

- `TreasuryBalance` (accountId, nickname, available, pending, currency)
- `TreasuryTransaction` (id, type, amount, counterparty, status, at)
- `IssuingCard` (id, last4, cardholder, type, state, wallet{apple,google}, spendLimit, spentMtd)
- `IssuingDispute` (id, cardId, amount, reason, status, openedAt, evidence?, evidenceFiles?)
- `OfframpSettlement` (id, userId, cryptoAsset, cryptoAmount, fiatAmount, feeAmount, status, at)
- `KycIntake` (do provider — mapeado pro model `KycIntake`)

## Escopo & sequência (cada item = 1 ciclo TDD, padrão F1)

0. **Cross-cutting prep**
   - Privileges novos (`MANAGE_AML`, `MANAGE_BILLING`) em `privileges.ts` + enum Prisma.
   - **Shell do admin responsiva:** a sidebar `w-60` fixa do `app/admin/layout.tsx` vira
     drawer + hambúrguer no mobile (diretiva do flex). Retrofit de responsividade do
     `CodesManager`/`FuelManager` da F1 (tabelas desktop-first → cards no mobile) entra aqui.
1. **KYC** — `lib/kyc/admin.ts` + `actions/cms/kyc.ts` + `app/admin/kyc/page.tsx` +
   `components/cms/KycManager.tsx`. Fila de intakes + disposição (approve/reject/review + notas).
2. **FinCEN/BSA** — `lib/fincen/admin.ts` (zod schemas Form107/SAR/CTR + `form107ToXml` portado) +
   `actions/cms/fincen.ts` + telas: lista/index, Form 107 (editor), SAR (lista+editor), CTR
   (lista+editor), submissions. Transporte BSA real fica gateado (fase posterior; submissions
   ficam `QUEUED`).
3. **MTL + OFAC** — `lib/mtl/admin.ts` (tracker 50-estados, seed dos nomes) + `app/admin/mtl` +
   `MtlManager`. OFAC rescreen como **ação manual** (`actions/cms/aml.ts` → marca intakes p/
   re-screen); agendamento fica pra ops (subfrost.io não tem o cron k8s do admin).
4. **Stripe** — `lib/stripe/` exporta as formas canônicas via um **adapter de fonte** (`source`):
   `seed` determinístico (sem chave → `NotHookedUp`) e `live` (gateado por `STRIPE_SECRET_KEY`,
   conformando ao mesmo contrato — ver Decisão 1). `actions/cms/billing.ts` + telas Treasury /
   Issuing / Offramp + tracker de aplicações Stripe (funciona **sem** chave viva). Painel
   `NotHookedUp` compartilhado em `components/cms/`.

## Padrão por módulo (idêntico à F1)

`schema.prisma` (+enums) → `prisma generate` → `lib/<dom>/admin.ts` (domínio + zod + XML) →
`actions/cms/<dom>.ts` (server action gateada por `hasPrivilege` via `lib/cms/authz`, com
`lib/cms/audit` nas mutações) → `app/admin/<rota>/page.tsx` + `components/cms/<X>Manager.tsx`
(tema zinc, `@/components/ui/*`, **mobile-first**) → nav gateada em `app/admin/layout.tsx`.

## Testes

Mesmo padrão da F1: mockar `@/lib/prisma` (named+default), `@/lib/cms/authz` (`currentUser`),
`@/lib/cms/audit`, `next/cache`. Cobrir por módulo:
- KYC: disposição grava append-only; gate de privilege nega sem `MANAGE_AML`.
- FinCEN: zod rejeita draft inválido (ex.: CTR ≤ $10k); `form107ToXml` serializa campos+escape;
  submission entra `QUEUED` com `trackingId` LOCAL-.
- MTL: upsert por state; seed dos 50 estados.
- Stripe: sem `STRIPE_SECRET_KEY` → `{ notHookedUp: true, reason }` e **não** chama a API;
  com chave (mock do SDK) → chama a API; mutações (ACH/dispute/control) gravam overlay.

## Verificação (gate de "pronto")

- `node_modules/.bin/tsc --noEmit` → 0.
- `CI=true node_modules/.bin/vitest run` → verde (novos testes + os 240 da F1).
- Schema a produção: `prisma migrate diff` confirma **aditivo** → `prisma db push` (io-sa). Nenhum
  dado de produção destruído.
- Telas `/admin/{kyc,fincen,mtl,stripe/*}` renderizam pra user com o privilege; CRUD mock-testado
  (live após o flex setar as credenciais).

## Riscos & dependências

- **Credenciais (flex):** `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (Stripe live) e credencial BSA
  E-Filing (transporte FinCEN). Sem elas, módulos ficam funcionais em modo `NotHookedUp`/`QUEUED`.
- **Mudança em arquivos compartilhados** (`privileges.ts`, `layout.tsx`, `schema.prisma`) já tocados
  pela F1 — esta branch sai do tip da F1 (`feat/referral-codes-api`) pra herdá-las e evitar conflito.
- **PR/push:** política do usuário = sem PR/push por enquanto; trabalho fica local na branch.
- **Tamanho:** AML+Stripe é grande pra um plano só → `writing-plans` quebra em planos por
  sub-módulo (AML primeiro, Stripe depois).
