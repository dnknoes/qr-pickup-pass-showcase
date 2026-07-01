# Security Notes

This document explains the security-relevant design decisions in the pickup pass system, what was simplified for this public showcase, and what would need hardening before any code here is reused in a real production system.

## Why pickup tokens are opaque

Tokens are generated with `crypto.randomBytes(24)` (192 bits of entropy), base64url-encoded. They carry no structure — no embedded order id, timestamp, or checksum an attacker could reason about. An opaque token means the only way to produce a valid one is to have been issued it; there's nothing to guess, decode, or derive.

## Why order IDs are not embedded in QR codes

The QR payload encodes the token, not the order id. If order ids were embedded instead (or alongside), a photographed or shared QR code — or a leaked pickup-pass URL — would expose a stable identifier tied to a specific order, and any endpoint that trusted an order id from an unauthenticated request would become attackable by guessing or enumerating ids. Keeping the token as the only credential means possession of the QR is both necessary and sufficient, and nothing about it can be looked up "the easy way."

## Why SHA-256 token hashes are stored for lookup

The server never stores the raw token after issuance. It stores `SHA-256(token)` and looks up incoming tokens by re-hashing and comparing. This means a database read (backup, replica, misconfigured access, insider) exposes hashes, not usable tokens — an attacker with only the hash table cannot reconstruct a valid token to redeem an order. SHA-256 is appropriate here specifically because the input (a 192-bit random token) already has enormous entropy; this is a lookup hash, not a password hash, so there's no need for a slow/salted KDF.

## Why AES-256-GCM encrypted token storage supports recovery/audit flows

Hashing alone is one-way — it's fine for verifying a presented token, but it can't recover a lost one. The recovery flow (customer requests their pass again) needs the *plaintext* token back so it can be re-embedded in a QR and re-emailed. For that narrow case, the token is additionally stored as an AES-256-GCM ciphertext, keyed by a secret (`PICKUP_TOKEN_ENCRYPTION_SECRET`) that's SHA-256-hashed down to a 256-bit key. GCM is authenticated encryption — decryption fails closed if the ciphertext, IV, or auth tag has been tampered with, rather than silently returning garbage. This is deliberately separate from the hash column: hashing answers "does this match?", encryption answers "what was it?", and only the recovery path needs the second question answered.

## How token loss recovery works

A customer who lost their pickup pass email (or is on a new device) enters their checkout email on the recovery page. The system finds their active, paid, non-redeemed, non-invalidated orders, decrypts (or mints, if none exists yet) a recovery token for each, and re-sends the pass links. This never requires an account or password — the checkout email itself is the recovery credential, matching how the original purchase worked. A stale or previously-redeemed pass is not re-sent, so recovery can't be used to "undo" an already-completed pickup.

## How redemption audit events work

Every state-changing action — most importantly, redemption — writes an append-only event row (`pickup_redemption_events` / `preorder_redemption_events`) recording the order, the event type, the actor, and structured details (e.g. whether a manual override was used). This is separate from the mutable `pickup_orders` row so that "what happened and when" survives independently of the current state, and so a manual override — which intentionally bypasses the token-hash check — is always distinguishable after the fact from a normal scan-verified redemption.

## What was simplified or mocked for public release

- **No live database.** This showcase runs against an in-memory mock data layer (`src/lib/mock-data/orders.ts`) instead of Supabase. The SQL in `supabase/migrations/` reflects the real schema and redemption function, but nothing here executes against Postgres.
- **No operator authentication.** In production, the redemption lookup/confirm routes sit behind staff session auth and a role check before any lookup logic runs. This showcase omits that entirely — the routes are open by design, since there's no auth system in this repo to gate them with.
- **No rate limiting.** Recovery-email and lookup endpoints would need rate limiting in production to resist enumeration/abuse; not implemented here.
- **Simplified email templates and branding.** Real customer/business identity is replaced with generic placeholders throughout.
- **In-memory redemption state.** Redemption ("marking an order redeemed") mutates process memory and resets on restart. Production uses a row-locked (`for update`) Postgres function so concurrent redemption attempts on the same order can't race.

## What should be hardened before production use

- Add staff authentication/authorization in front of the operator routes.
- Add rate limiting and abuse monitoring on both customer-facing and operator-facing endpoints.
- Consider adding an expiry window to tokens independent of order/pickup-window state, plus a rotation story for `PICKUP_TOKEN_ENCRYPTION_SECRET`.
- Add structured logging/alerting on manual-override redemptions specifically, since they intentionally bypass the cryptographic check.
- Run the SQL redemption function against a real transactional database so its row-locking guarantees actually apply.

No secrets, real API keys, or production URLs are present anywhere in this repository. See `.env.example` for the full list of configuration this system expects, with placeholder values only.
