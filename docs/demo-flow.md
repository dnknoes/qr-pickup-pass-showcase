# Demo Flow

This showcase runs against two fictional orders in `src/lib/mock-data/orders.ts`:

- `order_123_demo` — `customer@example.com`, paid, active, not yet redeemed. Its pickup date is calculated as `+7 days` from whenever the app runs, so it always shows as an **active** pass. This is the one to walk through issuance → QR → redemption.
- `order_456_demo` — `sam@example.com`, paid, already redeemed. Useful for seeing the "already redeemed" state on both the customer pass page and the operator lookup.

## Running it

```bash
npm install
cp .env.example .env.local
# at minimum set NEXT_PUBLIC_SITE_URL=http://localhost:3000
npm run dev
```

Email sending and encrypted recovery both degrade gracefully without configuration — see below.

## Walking through the flow

1. **Get a token.** The demo issues a checkout token for eligible mock orders lazily, the first time they're looked up. The easiest way to obtain a real token value to test with is to call the recovery flow (step 2) and read the token out of the generated pass URL in server logs / the `passUrl` returned by `requestPickupPassRecoveryEmail`, since the raw token is intentionally never exposed in a listing endpoint.
2. **Request recovery.** Visit `/pickup-passes`, submit `customer@example.com`. If `RESEND_API_KEY` / `CONTACT_FROM_EMAIL` aren't configured, `requestPickupPassRecoveryEmail` returns a clear "not configured" error rather than pretending to send — set those (or point `RESEND_API_KEY` at a real Resend sandbox key) to see the actual email path exercised. `PICKUP_TOKEN_ENCRYPTION_SECRET` must also be set for recovery to work at all, since recovery requires decrypting a stored token.
3. **View the pass.** Open `/pickup-pass/<token>` with the token from step 2. You should see the order's items, pickup details, and a QR code image.
4. **Redeem it (operator side).** Open `/operator/redeem?token=<token>` with the token from step 2 — this renders `PreorderRedeemPanel` pre-loaded with that token and resolves it via the "scanned" path (`tokenMatched: true`), which unlocks the non-override redeem button. You can also open `/operator/redeem` with no token and use the manual order-id fallback (`order_123_demo` works without a token) or `POST` directly to the API routes.
5. **Confirm state changes.** After redeeming, look up `order_123_demo` again — `redeemState` should now read `redeemed`, and the customer pass page for that token should show the "already redeemed" state.
6. **Try the edge cases.** `order_456_demo` is pre-seeded as already redeemed — look it up to see that state without needing to redeem anything first. Attempting to redeem an already-redeemed or invalidated order returns a descriptive error from `confirmOperatorRedeem`.

## What's mocked vs. real

Everything except persistence is real: token generation, SHA-256 hashing, AES-256-GCM encryption/decryption, QR rendering, and the redemption state-machine guards all run exactly as they would in production. Only the "database" is swapped for an in-memory array and a couple of `Map`s — see `src/lib/preorder/pickup-passes.ts` for the seam. Restarting the dev server resets all state back to the two orders above.
