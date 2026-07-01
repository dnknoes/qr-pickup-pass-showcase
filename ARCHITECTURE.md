# Architecture

## Overview

This is a Next.js App Router application with three logical surfaces:

1. **Customer pickup pass** (`/pickup-pass/[token]`) — a public page keyed entirely by the opaque token in the URL. No login, no order id in the URL.
2. **Customer recovery** (`/pickup-passes`) — an email-based self-serve flow to re-send active pass links.
3. **Operator redemption** (`/api/redeem/lookup`, `/api/redeem/confirm`, `PreorderRedeemPanel`) — the staff-facing scan-and-confirm UI and its backing API routes.

```
src/
  app/
    pickup-pass/[token]/page.tsx   Customer pass view (server component)
    pickup-passes/
      page.tsx                     Recovery request form
      actions.ts                   Server action: request recovery email
    api/redeem/
      lookup/route.ts              Operator: resolve order by token or id
      confirm/route.ts             Operator: confirm redemption
    operator/redeem/page.tsx       Operator: mocked redemption page — reads
                                    ?token= from a scanned/opened QR pickup
                                    pass link and renders PreorderRedeemPanel
  components/
    preorder-redeem-panel.tsx      Operator scan/lookup/redeem UI (client)
  lib/
    preorder/
      token.ts                     Token generation + SHA-256 hashing
      qr.ts                        QR payload URLs + image rendering
      recovery.ts                  AES-256-GCM encrypt/decrypt for recovery
      pickup-passes.ts             Pass lifecycle: issue, lookup, recover, redeem
    email/pickup-pass.ts           Transactional email (Resend)
    mock-data/orders.ts            Fictional demo orders (stands in for a DB)
    types/pickup-pass.ts           Shared types
supabase/migrations/               Sanitized schema + redemption RPC
```

## Data Flow

**Issuance** (order confirmed → token ready):
`generatePickupToken()` → `hashPickupToken()` for the stored hash, `maybeEncryptPickupToken()` for the recoverable ciphertext (if `PICKUP_TOKEN_ENCRYPTION_SECRET` is set) → `renderPickupTokenQrDataUrl()` builds the QR → `sendPickupPassEmail()` delivers it.

**Customer view**: `getPickupPassTokenPageData(token)` hashes the token from the URL and looks up a match — never a direct order-id lookup from an untrusted request.

**Recovery**: `requestPickupPassRecoveryEmail(email)` finds active orders for that email, ensures each has a recoverable (ciphertext-backed) token via `ensureRecoverableTokenRecord()`, decrypts it, and re-sends. This is the only place the raw token is ever reconstructed from storage.

**Operator redemption**: `lookupOperatorRedeem()` resolves an order by scanned token (hash lookup) or manually-entered order id. `confirmOperatorRedeem()` re-validates state (paid, issued, not invalidated, not already redeemed) and either matches the token hash or requires an explicit manual-override flag, then writes the redemption.

## Why a Mock Data Layer

The production version of `pickup-passes.ts` reads and writes Supabase tables behind a service-role client, with the broader preorder catalog/inventory system providing order context. That coupling isn't something a public repo should reproduce or depend on. Here, the same functions operate against an in-memory array (`src/lib/mock-data/orders.ts`) with module-level `Map`s standing in for the `pickup_pass_tokens` and `pickup_redemption_events` tables. The token/QR/crypto/state-machine logic — the actual interesting part — is identical in shape to production; only the persistence calls changed. `supabase/migrations/` shows the real schema and the redemption RPC this would call against a live database.

## Why the Redemption State Transition Lives in One Function

`confirmOperatorRedeem()` (demo) / `redeem_pickup_order()` (production SQL function) is the single place that decides whether a redemption is allowed. Every guard — canceled orders, unpaid orders, un-issued tokens, invalidated tokens, already-redeemed orders, token mismatch — lives there, not scattered across API routes or UI state. In production this runs as a Postgres function under a row lock (`for update`) so two concurrent redemption attempts for the same order can't both succeed.
