# Database Schema

This describes the sanitized schema in `supabase/migrations/`, which represents only the pickup-pass concepts (order, items, tokens, audit events) as a standalone schema. It is deliberately not runnable against the same tables as the original production system, which links orders into a much larger catalog/inventory/cycle model.

## `pickup_orders`

The paid order that a pickup pass belongs to.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `customer_name`, `customer_email`, `customer_phone` | text | |
| `customer_email_normalized` | text | lowercased/trimmed, indexed for recovery lookups |
| `market_name`, `pickup_date`, `pickup_window_label`, `pickup_location` | text/date | snapshotted at order time |
| `order_status` | enum: `confirmed`, `canceled` | |
| `payment_status` | enum: `unpaid`, `paid`, `refunded` | |
| `fulfillment_status` | enum: `pending`, `delivered` | flips to `delivered` on redemption |
| `total_amount`, `currency_code` | numeric/text | |
| `redeem_token_hash`, `redeem_token_last4` | text | legacy single-token columns; see `pickup_pass_tokens` below |
| `redeem_token_issued_at`, `redeemed_at`, `redeem_invalidated_at` | timestamptz | lifecycle timestamps |
| `redeemed_by_profile_id` | uuid | operator who redeemed |

## `pickup_order_items`

Line items for an order, snapshotted at order time (product name/price/unit don't change retroactively if the catalog changes later).

## `pickup_pass_tokens`

Introduced in `002_pickup_pass_recovery.sql`. Supports multiple valid tokens per order (the original checkout token, plus at most one re-issued recovery token), each independently hashed and optionally encrypted.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid FK → `pickup_orders` | |
| `token_hash` | text, unique | SHA-256 hash, used for redemption lookup |
| `token_last4` | text, 4 chars | display only |
| `token_ciphertext` | text, nullable | AES-256-GCM, present only if encryption is configured |
| `token_source` | enum: `checkout`, `recovery` | at most one `recovery` row per order (partial unique index) |

## `pickup_redemption_events`

Append-only audit log.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid FK → `pickup_orders` | |
| `event_type` | enum: `qr_issued`, `qr_invalidated`, `redeemed` | |
| `actor_profile_id` | uuid, nullable | who triggered it (null for system-generated events) |
| `details` | jsonb | e.g. `{ "manual_override": true }` |
| `created_at` | timestamptz | |

## `redeem_pickup_order(...)` function

A `plpgsql` function that is the single authority for whether a redemption is allowed. It row-locks the order (`for update`), validates every guard (not canceled, paid, issued, not invalidated, not already redeemed, token match or manual override), then updates the order and inserts the audit event in the same transaction. This is what the production RPC (`redeem_preorder_order`) looks like, sanitized to the standalone schema names used here.

## What's intentionally not in this schema

The production system's orders table also carries columns and foreign keys for the preorder catalog, market cycles, inventory reservation, and Stripe checkout session tracking. None of that is reproduced here — this schema stops at what's needed to demonstrate pickup-pass issuance, recovery, and redemption.
