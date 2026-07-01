# Sanitization Notes

This document records what was changed while extracting this showcase from the original production codebase, for anyone (including future me) auditing what's safe to publish.

## Identity / branding

- All references to the original business name and its production domain were replaced with generic placeholders (`example.com`, "Demo Small Business  Co-op", "Demo Small Business ").
- Real admin/operator/contact email addresses were replaced with `info@example.com` / `customer@example.com` style placeholders.

## Credentials / configuration

- No real environment values are present anywhere in this repo — only `.env.example` with placeholder text (`your_supabase_project_url`, `your_service_role_key`, etc.).
- No `.env` or `.env.local` file is included.
- Environment variable *names* were kept close to their production originals where that aids the security writeup (e.g. `PICKUP_TOKEN_ENCRYPTION_SECRET`), but no key material, connection strings, or project refs are included.

## Customer / order data

- All customer names, emails, phone numbers, and order ids are fictional, written specifically for this repo (`src/lib/mock-data/orders.ts`). None correspond to real people or real transactions.
- Real market names/addresses were replaced with a fictional "Demo Small Business " / "Main Plaza" placeholder.

## Code scope

The original pickup-pass feature lived inside a much larger backoffice/preorder codebase covering catalog management, market cycles, inventory reservation, wholesale, delivery scheduling, and subscription billing. None of that is included here. Specifically excluded:

- Preorder cycle / inventory reservation logic (`claim_preorder_cycle_inventory`, `release_preorder_cycle_inventory`, `confirm_preorder_cycle_inventory` and the tables they touch)
- The full backoffice preorder management module (~2,000 lines covering product/market/cycle CRUD, inventory balances, order management beyond redemption) — only the redemption-lookup and redemption-confirm logic was extracted and simplified into `lookupOperatorRedeem` / `confirmOperatorRedeem`
- Wholesale, delivery, and subscription order flows entirely
- Stripe checkout integration — the pickup-pass flow only needs to react to "this order is now paid," which the mock data represents directly instead of via a webhook

## Database

- The two sanitized migrations (`001_pickup_pass_redemption.sql`, `002_pickup_pass_recovery.sql`) define a **new, standalone schema** (`pickup_orders`, `pickup_order_items`, `pickup_pass_tokens`, `pickup_redemption_events`) rather than reproducing the original migrations verbatim. The original migrations altered a much larger, pre-existing `orders` table shared across delivery/subscription/preorder order types and referenced tables (`preorder_cycles`, `preorder_cycle_items`, `profiles`, etc.) that aren't part of this showcase.
- No seed data, real rows, or database dumps are included — the schema is DDL only.
- The redemption SQL function's guard logic (state checks, token verification, manual override) is preserved faithfully, since that logic is the interesting security artifact; only table/column names were adapted to the standalone schema.

## Operational details

- Operator authentication is omitted entirely (see SECURITY_NOTES.md) rather than represented with a stubbed or fake auth system, to avoid implying a security boundary exists where it doesn't in this repo.
- No internal operational notes, runbooks, or comments referencing internal workflows, staff names, or specific incident history were carried over — comments in this repo explain the code's own logic, not organizational context.

## What was intentionally kept close to the original

The security-relevant logic — token generation, SHA-256 hashing, AES-256-GCM encryption/decryption, the redemption state-machine guards, and the QR issuance/lookup flow — was ported with minimal changes beyond renaming and de-branding, because that logic is precisely what this repo exists to demonstrate.
