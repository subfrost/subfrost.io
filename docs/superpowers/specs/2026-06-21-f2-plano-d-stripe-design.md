# F2 Compliance — Plano D: Stripe (billing console)

> **Data:** 2026-06-21 · **Status:** design aprovado, pré-implementação
> **Repo alvo:** `subfrost.io` (Next.js 16, App Router) · branch `feat/compliance-aml-stripe`
> **Origem:** consolidação da operação subfrost em `subfrost.io/admin` (sunset do `subfrost-admin` +
> growth admin do `subfrost-app`). Fases F0(auth)→F1(Growth)→**F2(Compliance)**→F3(decom).
> **Predecessor:** `2026-06-20-f2-compliance-aml-stripe-design.md` (AML backend) — KYC + FinCEN +
> MTL/OFAC **COMPLETOS**. Este spec **refina e amplia** a fatia 4 (Stripe) daquele, com o escopo
> "immersive" ampliado pelo flex e o resultado do brainstorm de 2026-06-21.

## Contexto

O AML backend da F2 está pronto (KYC/FinCEN/MTL/OFAC, branch `feat/compliance-aml-stripe` pushada,
`tsc` 0 / vitest 308). Falta o **Plano D = Stripe**, que precisava de um design refresh por causa do
escopo ampliado.

**Input do flex (2026-06-20, ancorado na Decisão 1 do spec predecessor):** o client de Stripe no
`subkube` "is not really that advanced — mostly just deals with the subscription tiers we have and
promo codes". A implementação do subfrost.io será **"a lot more immersive" e NÃO precisa de nada
específico no subkube**. "Same APIs" = os **mesmos produtos Stripe** (Treasury/Issuing/Identity/
Billing), **não** consumir a API do subkube — o subfrost.io é dono direto e **independente**.

**Decisão do usuário (2026-06-21):** o flex provavelmente foi dormir; seguimos com a nossa melhor
leitura e ele faz **review/check completo amanhã** e manda feedback se algo precisar mudar.
Constraint mantida: a branch pode commitar/pushar, mas **NENHUM PR/merge na main até o flex liberar**.

## Decisões de arquitetura (brainstorm 2026-06-21)

1. **Escopo abrangente — os 4 blocos de superfície entram no Plano D:**
   - **Receita**: subscription tiers/products/prices + lista de assinantes + promo codes (coupons +
     promotion codes). *(É a superfície que o subkube já cobre VIVA — a base.)*
   - **Money-ops**: treasury (FBO balances + transactions + ACH) · issuing (cards + controles +
     disputas) · offramp (settlements crypto→fiat). *(As formas do `subkube-mock.ts`.)*
   - **Customers / billing portal**: visão por-cliente — assinaturas, faturas, métodos de pagamento,
     charges. *(A adição "immersive" mais nova, além do subkube-mock.)*
   - **Tracker de aplicações Stripe**: status de onboarding dos produtos (treasury/issuing/offramp).

2. **`lib/stripe/` com fonte plugável — `seed-complete + live-stub`.** A fonte é um adapter atrás de
   `lib/stripe/source/`: `seed.ts` (determinístico, expande o `subkube-mock`) e `live.ts` (implementa
   a mesma interface, mas cada método **lança `StripeNotWiredError` — stub**). `getStripeSource()`
   escolhe pela `isLive()` (= `!!process.env.STRIPE_SECRET_KEY`). Como `isLive()` é `false` até a
   chave chegar, **o `live.ts` nunca roda em runtime ainda** e **não se adiciona o dep `stripe`
   agora** (sem import de SDK = sem código morto testável-no-escuro, sem dep churn). Consistente com
   os deferrals da F2 (transporte BSA, provider OFAC). O flex / uma fatia futura troca os stubs por
   chamadas reais **atrás dessa fronteira**, sem tocar nas actions/telas. **NÃO mexer no `subkube`**
   (`subfrost-api-nextjs`) — ele fica intocado e é sunsetado no F3.

3. **Leituras sempre devolvem dado + flag `live` — sem tela morta.** Contrato:
   `type SourceResult<T> = { data: T; live: boolean }`. Sem a chave, a UI mostra os dados de **demo
   (seed)** com um **banner não-bloqueante** ("Stripe not connected — showing demo data. Set
   `STRIPE_SECRET_KEY` to go live."). **Evolução deliberada** do `NotHookedUp` duro do spec
   predecessor (lá, sem chave = painel morto) → agora **seed-complete, UI 100% navegável/demo**.
   Leituras **nunca** são persistidas.

4. **Modelo de escrita HÍBRIDO — guardrail no dinheiro, immersive no resto.**

   | Tipo de mutação | Live (chave setada) | Seed (sem chave, hoje) |
   |---|---|---|
   | **Baixo risco** (pausar/cancelar cartão, evidência de disputa, criar promo, cancelar/alterar sub) | chama o Stripe (via `live.ts`, hoje stub) + `audit()` | grava **overlay** sobreposto nas leituras (demo interativo) + `audit()` |
   | **Movimento de dinheiro** (ACH out/in, refund) | **SEMPRE** enfileira `StripeMoneyIntent` (QUEUED) → passo **confirmar** separado executa | enfileira `StripeMoneyIntent` (QUEUED→CONFIRMED marca "executaria quando live") |

   - O **guardrail de dinheiro vale nos dois modos**: nunca auto-executa; exige confirmação explícita
     (segunda ação), com `requestedBy` ≠ `decidedBy` idealmente, ambos no audit.
   - Overlays de baixo risco existem pra tornar o **seed interativo**; em **live** o Stripe é a fonte
     da verdade (leituras **não** sobrepõem overlay).
   - Toda mutação passa pela server action gateada por `MANAGE_BILLING` (helper `actor()` idêntico ao
     `actions/cms/kyc.ts`) e chama `audit()` **só no sucesso**.

## Privileges

`MANAGE_BILLING` **já existe** (criado na F2-A) no enum Prisma `Privilege` + `ALL_PRIVILEGES` +
`PRIVILEGE_LABELS` (`lib/cms/privileges.ts`, label "Manage billing (Stripe)"). ADMIN herda via
`ALL_PRIVILEGES`; concede-se por-usuário via `User.privileges`. **Não precisa de privilege novo.**

## Models Prisma novos

`prisma/schema.prisma` → após editar: `node_modules/.bin/prisma generate`. Produção via
`prisma db push` (io-sa autorizado), **sempre** precedido de
`prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script`
confirmando **aditivo**. **Não rodar `db push` no fluxo do plano.**

Leituras NÃO persistem. Só persistem: overlays (que tornam o seed interativo), o intent de dinheiro
(guardrail, ambos os modos) e o tracker (puro Postgres).

```prisma
// --- Money guardrail (ACH + refund) — AMBOS os modos ---
enum StripeMoneyKind   { ACH_TRANSFER REFUND }
enum StripeMoneyStatus { QUEUED CONFIRMED CANCELED }
model StripeMoneyIntent {
  id           String            @id @default(cuid())
  kind         StripeMoneyKind
  direction    String?           // "in" | "out" (ACH)
  amount       Int               // centavos
  counterparty String?           // ACH
  reference    String?           // chargeId/invoiceId (refund)
  memo         String?
  status       StripeMoneyStatus @default(QUEUED)
  requestedBy  String
  requestedAt  DateTime          @default(now())
  decidedBy    String?           // quem confirmou/cancelou
  decidedAt    DateTime?
}

// --- Overlays de baixo risco (sobrepostos só no modo seed) ---
model StripeCardControl {            // pausar/cancelar cartão
  cardId String   @id
  state  String   // "active" | "paused" | "canceled"
  by     String
  at     DateTime @default(now())
}
model StripeDisputeEvidence {        // evidência de disputa
  id            String   @id @default(cuid())
  disputeId     String
  evidence      String?
  evidenceFiles String[]
  by            String
  at            DateTime @default(now())
}
enum StripePromoType { PERCENT AMOUNT }
model StripePromoCode {              // promo criado pelo admin
  id             String          @id @default(cuid())
  code           String          @unique
  type           StripePromoType
  value          Int             // % ou centavos
  maxRedemptions Int?
  expiresAt      DateTime?
  active         Boolean         @default(true)
  by             String
  createdAt      DateTime        @default(now())
}
model StripeSubscriptionAction {     // cancel/alteração de assinatura
  id             String   @id @default(cuid())
  subscriptionId String
  action         String   // "cancel" | "pause" | "resume" | "change_tier"
  note           String?
  by             String
  at             DateTime @default(now())
}

// --- Tracker de aplicações (puro Postgres, sem Stripe) ---
enum StripeApplicationStatus { NOT_STARTED SUBMITTED PENDING APPROVED REJECTED }
model StripeApplication {
  id        String                  @id @default(cuid())
  product   String                  @unique  // "treasury" | "issuing" | "offramp"
  status    StripeApplicationStatus @default(NOT_STARTED)
  notes     String?
  updatedBy String
  updatedAt DateTime                @updatedAt
}
```

## Formas de leitura (`lib/stripe/shapes.ts`, client-safe)

Tipos client-safe (só TS/zod, importáveis pelos componentes client). Espelham/expandem o
`subkube-mock.ts`. A `StripeSource` retorna estas formas, do live (com chave) ou do seed (sem chave).

- **Money-ops** (do mock, verbatim como referência de contrato):
  - `TreasuryBalance` (accountId, nickname, available, pending, currency)
  - `TreasuryTransaction` (id, type, amount, counterparty, status, at)
  - `IssuingCard` (id, last4, cardholder, type, state, wallet{apple,google}, spendLimit, spentMtd)
  - `IssuingDispute` (id, cardId, amount, reason, status, openedAt, evidence?, evidenceFiles?)
  - `OfframpSettlement` (id, userId, cryptoAsset, cryptoAmount, fiatAmount, feeAmount, status, at)
- **Receita** (novo):
  - `SubscriptionTier` (id, name, priceMonthly, priceYearly, features[], activeSubs)
  - `Subscriber` (id, customerEmail, tier, status, startedAt, renewsAt)
  - `PromoCode` (code, type, value, redemptions, maxRedemptions?, expiresAt?, active)
- **Customers** (novo):
  - `CustomerSummary` (id, email, name, lifetimeValue, activeSubs, createdAt)
  - `CustomerDetail` (subscriptions[], invoices[], paymentMethods[], recentCharges[])

## Arquitetura `lib/stripe/`

```
lib/stripe/
  config.ts        // isLive() = !!process.env.STRIPE_SECRET_KEY  +  DEMO_REASON
  shapes.ts        // tipos client-safe (read) + zod (inputs) — o "schema client-safe" do padrão
  source/
    types.ts       // interface StripeSource (todas as leituras canônicas)
    index.ts       // getStripeSource(): isLive() ? live : seed
    seed.ts        // dados determinísticos (subkube-mock expandido) — leituras
    live.ts        // implementa StripeSource; cada método = throw StripeNotWiredError (stub)
  treasury.ts      // read (source+overlay) + queueTransfer/confirm/cancel (guardrail)
  issuing.ts       // read cards/disputes (source+overlay) + setCardControl/submitDisputeEvidence
  offramp.ts       // read settlements (read-only)
  subscriptions.ts // read tiers/subscribers + cancel/change (low-risk)
  promo.ts         // read coupons/promo + createPromoCode (low-risk)
  customers.ts     // read lista + drilldown + requestRefund (guardrail via StripeMoneyIntent)
  applications.ts  // tracker CRUD (puro Postgres)
```

Cada arquivo de superfície é um **domain lib puro** (lança erro tipado; importa `prisma` de
`@/lib/prisma`; lê via `getStripeSource()`), no mesmo molde de `lib/kyc/admin.ts`.

## Rotas + telas (hub `/admin/billing` + sub-rotas, 1 item de nav)

```
app/admin/billing/
  page.tsx                 // hub: cards-link p/ cada superfície + BillingBanner se !live
  subscriptions/page.tsx   → SubscriptionsManager   (tiers + subscribers; cancel/change)
  promo/page.tsx           → PromoManager           (lista + criar promo)
  treasury/page.tsx        → TreasuryManager        (balances + txns + enfileirar ACH + MoneyIntentQueue)
  issuing/page.tsx         → IssuingManager         (cards + controles + disputas + evidência)
  offramp/page.tsx         → OfframpManager         (settlements, read-only)
  customers/page.tsx       → CustomersManager       (lista + drilldown + refund via intent)
  applications/page.tsx    → ApplicationsManager    (tracker)
components/cms/billing/
  BillingBanner.tsx        // banner "demo/not connected" compartilhado
  MoneyIntentQueue.tsx     // fila QUEUED + confirmar/cancelar (reusada por treasury & customers)
  <cada>Manager.tsx        // client, mobile-first, tema zinc, @/components/ui/{button,input,label}
actions/cms/billing.ts     // todas as actions gateadas por MANAGE_BILLING (helper actor())
```

- **Page**: cada `page.tsx` faz `redirect("/admin/login")` se sem sessão e `redirect("/admin")` se
  sem `MANAGE_BILLING` (idêntico ao `app/admin/kyc/page.tsx`); `export const dynamic = "force-dynamic"`.
- **Nav**: 1 item `Billing` gateado por `can("MANAGE_BILLING")` no `components/cms/AdminShell.tsx`
  (ícone `CreditCard` do `lucide-react`), apontando `/admin/billing`. **Nada existente é dropado.**
- **Manager**: client component, **mobile-first** (cards empilhados + `flex flex-wrap`, sem tabela
  desktop-only), tema zinc, importa só formas client-safe de `lib/stripe/shapes.ts`.

## Modelo de escrita — fluxo concreto por surface

- **promo.createPromoCode**: valida zod → live: `stripe` (stub) ; seed: `StripePromoCode.create` →
  `audit("promo_create")`. Lista = seed coupons ∪ overlays (modo seed).
- **issuing.setCardControl**: live: `stripe` (stub) ; seed: upsert `StripeCardControl` → leitura
  sobrepõe `state`. `audit("card_control")`.
- **issuing.submitDisputeEvidence**: live: `stripe` (stub) ; seed: `StripeDisputeEvidence.create` →
  leitura anexa evidência. `audit("dispute_evidence")`.
- **subscriptions.cancel/change**: live: `stripe` (stub) ; seed: `StripeSubscriptionAction.create` →
  leitura aplica o efeito. `audit("subscription_action")`.
- **treasury.queueTransfer** / **customers.requestRefund**: cria `StripeMoneyIntent` (QUEUED) nos dois
  modos. `audit("money_intent_request")`.
- **treasury.confirmTransfer / cancelTransfer**: muda `status`→CONFIRMED/CANCELED, grava
  `decidedBy`/`decidedAt`. **Live**: confirm executaria a transferência no Stripe (stub hoje).
  **Seed**: marca confirmado (demo). `audit("money_intent_confirm" | "money_intent_cancel")`.

## Testes (mesmo padrão F1/F2)

Mockar `@/lib/prisma` (named+default `{ prisma: client, default: client }`), `@/lib/cms/authz`
(`currentUser`), `@/lib/cms/audit` (`audit`), `next/cache` (`revalidatePath`), `next/headers`
(`headers`). Tests em `tests/billing/` (ou `tests/stripe/`). TDD: teste→RED→impl→GREEN. Cobrir:

- **Gate**: cada action nega sem `MANAGE_BILLING` (`{ ok:false, error:"Insufficient privileges" }`).
- **Source**: `isLive()` false → seed + `live:false`; reads compõem seed+overlays; chamar um método de
  `live.ts` lança `StripeNotWiredError`.
- **Guardrail**: `queueTransfer`/`requestRefund` cria `StripeMoneyIntent` QUEUED; `confirmTransfer`
  muda status + grava `decidedBy`; **não auto-executa**; `cancelTransfer` → CANCELED.
- **Baixo risco (modo seed)**: card control / dispute evidence / promo / subscription action gravam
  overlay e a leitura correspondente reflete a mudança.
- **Tracker**: `upsert` por `product`; status default `NOT_STARTED`.

## Fatiamento em sub-planos (o `writing-plans` formaliza)

| Sub-plano | Conteúdo | Stripe |
|---|---|---|
| **D1 — Foundation** | schema (6 models + enums) + `prisma generate`; `lib/stripe/{config,shapes,source/*}`; `BillingBanner`; nav + hub `/admin/billing`; `ApplicationsManager` (tracker, puro) | não |
| **D2 — Revenue** | `subscriptions.ts` + `promo.ts`; Subscriptions/Promo managers + actions | seed+overlay |
| **D3 — Money-ops** | `treasury.ts` + `issuing.ts` + `offramp.ts`; `MoneyIntentQueue`; managers + actions (guardrail) | seed+overlay+intent |
| **D4 — Customers** | `customers.ts`; CustomersManager (drilldown + refund via intent) | seed+overlay+intent |

Cada sub-plano = ciclo TDD subagent-driven (implementer haiku/sonnet conforme complexidade, reviewer
sonnet, revisão de branch opus ao final), gate `tsc 0` + vitest verde.

## Verificação (gate de "pronto")

- `node_modules/.bin/tsc --noEmit` → 0.
- `CI=true node_modules/.bin/vitest run` → verde (308 atuais + novos).
- Schema a produção: `prisma migrate diff` confirma **aditivo** → `prisma db push` (io-sa). Nenhum
  dado de produção destruído. **Fora do fluxo do plano** (passo io-sa autorizado à parte).
- Telas `/admin/billing/*` renderizam pra user com `MANAGE_BILLING`; modo demo (banner) sem
  `STRIPE_SECRET_KEY`; checagem visual ao vivo deferida (precisa user logado + DB).

## Riscos & dependências

- **Credenciais (flex)**: `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET`) ligam o caminho live. Sem
  elas, tudo funciona em **modo seed/demo** (banner). Secret `subfrost-admin-stripe-secret-key` já
  existe no Secret Manager (do admin/subkube) mas o subfrost.io espera `STRIPE_SECRET_KEY` próprio.
- **Live wiring deferido**: `live.ts` é stub (`StripeNotWiredError`) e o dep `stripe` **não** é
  adicionado agora. Trocar stubs por chamadas reais + adicionar o SDK é uma fatia futura, atrás da
  fronteira da lib (não toca actions/telas).
- **Review do flex pendente**: ele faz o check completo amanhã; ajustes podem vir. **Sem PR/merge na
  main até ele liberar** (branch evolui/commita/pusha à vontade).
- **Arquivos compartilhados** (`schema.prisma`, `AdminShell.tsx`, `privileges.ts`) já tocados pela
  F1/F2 — esta branch sai do tip da F2 e as mudanças são aditivas (novos models, novo item de nav).
- **`.npmrc` untracked — NUNCA `git add`.** Cada commit stage só os arquivos do task.
