import { mockOrders, type MockOrder } from "@/lib/mock-data/orders";
import {
  getMissingPickupPassEmailConfig,
  sendPickupPassEmail,
} from "@/lib/email/pickup-pass";
import {
  buildCustomerPickupPassUrl,
  renderPickupTokenQrDataUrl,
} from "@/lib/preorder/qr";
import {
  decryptPickupToken,
  getMissingTokenRecoveryConfig,
  maybeEncryptPickupToken,
} from "@/lib/preorder/recovery";
import {
  generatePickupToken,
  hashPickupToken,
} from "@/lib/preorder/token";
import type {
  OperatorRedeemLookup,
  PickupPassRecord,
  PickupPassState,
  RedeemState,
} from "@/lib/types/pickup-pass";

/**
 * PORTABILITY NOTE
 * ----------------
 * In production this module reads/writes Supabase tables (`orders`,
 * `order_items`, `payments`, `preorder_pass_tokens`) behind a service-role
 * client — see docs/database-schema.md for the real schema shape. For this
 * public showcase, the same lifecycle (issue → hash-lookup → recover →
 * redeem) runs against the in-memory mock data in src/lib/mock-data/orders.ts
 * so the demo works without a database. Swapping the functions below for
 * Supabase queries is a mechanical change; the token/QR/encryption logic
 * they call is unchanged from production.
 */

type TokenRecord = {
  orderId: string;
  tokenHash: string;
  tokenLast4: string;
  tokenCiphertext: string | null;
  tokenSource: "checkout" | "recovery";
  createdAt: string;
};

const tokenStoreByOrderId = new Map<string, TokenRecord[]>();

function addTokenRecord(record: TokenRecord) {
  const existing = tokenStoreByOrderId.get(record.orderId) ?? [];
  existing.push(record);
  tokenStoreByOrderId.set(record.orderId, existing);
}

function issueCheckoutTokenIfMissing(order: MockOrder) {
  if (tokenStoreByOrderId.has(order.id)) {
    return;
  }

  const issued = generatePickupToken();

  addTokenRecord({
    orderId: order.id,
    tokenHash: issued.tokenHash,
    tokenLast4: issued.tokenLast4,
    tokenCiphertext: maybeEncryptPickupToken(issued.token),
    tokenSource: "checkout",
    createdAt: order.tokenIssuedAt ?? order.createdAt,
  });
}

function getPickupPassState(order: MockOrder, today = new Date().toISOString().slice(0, 10)): PickupPassState {
  if (order.redeemedAt) {
    return "redeemed";
  }

  if (order.pickupDate < today) {
    return "past";
  }

  return "active";
}

function getRedeemState(order: MockOrder): RedeemState {
  if (order.redeemedAt) {
    return "redeemed";
  }

  if (order.orderStatus === "canceled" || order.paymentStatus === "refunded" || order.invalidatedAt) {
    return "invalid";
  }

  if (order.paymentStatus === "paid" && order.tokenIssuedAt) {
    return "ready";
  }

  return "pending";
}

function toOperatorRedeemLookup(order: MockOrder, tokenLast4: string | null): OperatorRedeemLookup {
  return {
    orderId: order.id,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    items: order.items,
    marketName: order.marketName,
    pickupDate: order.pickupDate,
    pickupWindowLabel: order.pickupWindowLabel,
    pickupLocation: order.pickupLocation,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    tokenLast4,
    tokenIssuedAt: order.tokenIssuedAt,
    redeemedAt: order.redeemedAt,
    invalidatedAt: order.invalidatedAt,
    totalAmount: order.totalAmount,
    currencyCode: order.currencyCode,
    redeemState: getRedeemState(order),
  };
}

function getFeatureUnavailableMessage(missing: string[]) {
  if (missing.length === 0) {
    return null;
  }

  return `Pickup pass access is unavailable until the following environment variables are configured: ${missing.join(", ")}.`;
}

function getConfiguredSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return raw ? new URL(raw) : null;
}

function getRecoveryMissingConfig() {
  const missing = new Set<string>([
    ...getMissingTokenRecoveryConfig(),
    ...getMissingPickupPassEmailConfig(),
  ]);

  if (!getConfiguredSiteUrl()) {
    missing.add("NEXT_PUBLIC_SITE_URL");
  }

  return [...missing];
}

function getRecoverableTokenRecord(orderId: string) {
  const records = tokenStoreByOrderId.get(orderId) ?? [];
  return records.find((record) => record.tokenSource === "checkout" && record.tokenCiphertext)
    ?? records.find((record) => record.tokenSource === "recovery" && record.tokenCiphertext)
    ?? null;
}

async function ensureRecoverableTokenRecord(order: MockOrder) {
  let record = getRecoverableTokenRecord(order.id);

  if (record) {
    return record;
  }

  const reissued = generatePickupToken();
  const tokenCiphertext = maybeEncryptPickupToken(reissued.token);

  if (!tokenCiphertext) {
    throw new Error("Pickup pass recovery is unavailable until PICKUP_TOKEN_ENCRYPTION_SECRET is configured.");
  }

  record = {
    orderId: order.id,
    tokenHash: reissued.tokenHash,
    tokenLast4: reissued.tokenLast4,
    tokenCiphertext,
    tokenSource: "recovery",
    createdAt: new Date().toISOString(),
  };
  addTokenRecord(record);

  return record;
}

function findOrderById(orderId: string) {
  return mockOrders.find((order) => order.id === orderId) ?? null;
}

async function buildPickupPassRecord(order: MockOrder, token: string, tokenLast4: string): Promise<PickupPassRecord> {
  const siteUrl = getConfiguredSiteUrl();

  if (!siteUrl) {
    throw new Error("Pickup pass access is unavailable until NEXT_PUBLIC_SITE_URL is configured.");
  }

  return {
    orderId: order.id,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    marketName: order.marketName,
    pickupDate: order.pickupDate,
    pickupWindowLabel: order.pickupWindowLabel,
    pickupLocation: order.pickupLocation,
    tokenLast4,
    qrCodeDataUrl: await renderPickupTokenQrDataUrl(token, siteUrl),
    tokenIssuedAt: order.tokenIssuedAt,
    redeemedAt: order.redeemedAt,
    state: getPickupPassState(order),
    totalAmount: order.totalAmount,
    currencyCode: order.currencyCode,
    items: order.items,
    createdAt: order.createdAt,
  };
}

export function getMissingPickupPassAccessConfig() {
  return getRecoveryMissingConfig();
}

export function getMissingCustomerPickupPassConfig() {
  return getConfiguredSiteUrl() ? [] : ["NEXT_PUBLIC_SITE_URL"];
}

export async function getPickupPassPageData() {
  const missing = getRecoveryMissingConfig();

  return {
    featureAvailable: missing.length === 0,
    featureReason: getFeatureUnavailableMessage(missing),
  };
}

/** Looks up a pass by the SHA-256 hash of the presented token — never by order id. */
export async function getPickupPassTokenPageData(token: string) {
  const trimmedToken = token.trim();
  const missing = getMissingCustomerPickupPassConfig();

  if (missing.length > 0) {
    return {
      featureAvailable: false,
      featureReason: getFeatureUnavailableMessage(missing),
      pass: null,
      notFound: false,
    };
  }

  if (!trimmedToken) {
    return { featureAvailable: true, featureReason: null, pass: null, notFound: true };
  }

  for (const order of mockOrders) {
    if (order.paymentStatus === "paid" && order.orderStatus === "confirmed") {
      issueCheckoutTokenIfMissing(order);
    }
  }

  const tokenHash = hashPickupToken(trimmedToken);
  let matched: { order: MockOrder; tokenLast4: string } | null = null;

  for (const [orderId, records] of tokenStoreByOrderId) {
    const record = records.find((candidate) => candidate.tokenHash === tokenHash);

    if (record) {
      const order = findOrderById(orderId);

      if (order) {
        matched = { order, tokenLast4: record.tokenLast4 };
      }

      break;
    }
  }

  if (!matched) {
    return { featureAvailable: true, featureReason: null, pass: null, notFound: true };
  }

  return {
    featureAvailable: true,
    featureReason: null,
    pass: await buildPickupPassRecord(matched.order, trimmedToken, matched.tokenLast4),
    notFound: false,
  };
}

/** Customer-facing recovery: re-sends active pass links without ever requiring login. */
export async function requestPickupPassRecoveryEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return { ok: true as const, emailed: false };
  }

  const missing = getRecoveryMissingConfig();

  if (missing.length > 0) {
    return { ok: false as const, error: getFeatureUnavailableMessage(missing) ?? "Pickup pass access is unavailable." };
  }

  const siteUrl = getConfiguredSiteUrl()!;
  const activeOrders = mockOrders.filter(
    (order) =>
      order.customerEmail.toLowerCase() === normalizedEmail
      && order.orderStatus === "confirmed"
      && order.paymentStatus === "paid"
      && !order.redeemedAt
      && !order.invalidatedAt,
  );

  if (activeOrders.length === 0) {
    return { ok: true as const, emailed: false };
  }

  const passes = await Promise.all(
    activeOrders.map(async (order) => {
      const record = await ensureRecoverableTokenRecord(order);
      const token = decryptPickupToken(record.tokenCiphertext!);

      return {
        marketName: order.marketName,
        pickupDate: order.pickupDate,
        pickupWindowLabel: order.pickupWindowLabel,
        pickupLocation: order.pickupLocation,
        passUrl: buildCustomerPickupPassUrl(token, siteUrl).toString(),
        tokenLast4: record.tokenLast4,
        qrCodeDataUrl: await renderPickupTokenQrDataUrl(token, siteUrl),
      };
    }),
  );

  const sendResult = await sendPickupPassEmail({
    recipientEmail: activeOrders[0].customerEmail,
    passes,
  });

  if (!sendResult.ok) {
    return sendResult;
  }

  return { ok: true as const, emailed: true };
}

/**
 * Operator-facing lookup for the redemption panel. Scanned QRs resolve by
 * token hash; the manual fallback resolves by order id. Either path returns
 * the same shape so the UI doesn't need to know which one was used.
 */
export async function lookupOperatorRedeem(input: { orderId?: string; token?: string }) {
  const orderId = input.orderId?.trim();
  const token = input.token?.trim();

  if (!orderId && !token) {
    return { ok: false as const, error: "Provide an order id or scanned QR token." };
  }

  let order: MockOrder | null = null;
  let matchedTokenLast4: string | null = null;

  if (orderId) {
    order = findOrderById(orderId);
  } else if (token) {
    const tokenHash = hashPickupToken(token);

    for (const [candidateOrderId, records] of tokenStoreByOrderId) {
      const record = records.find((candidate) => candidate.tokenHash === tokenHash);

      if (record) {
        order = findOrderById(candidateOrderId);
        matchedTokenLast4 = record.tokenLast4;
        break;
      }
    }
  }

  if (!order) {
    return { ok: false as const, error: "No pickup order matched that lookup." };
  }

  return {
    ok: true as const,
    preorder: toOperatorRedeemLookup(order, matchedTokenLast4 ?? tokenStoreByOrderId.get(order.id)?.[0]?.tokenLast4 ?? null),
    tokenMatched: Boolean(token),
  };
}

/**
 * Confirms redemption. A scanned token must match the stored hash unless the
 * operator explicitly uses the manual override, which trades the hash check
 * for an auditable `manual_override: true` event (see docs/token-lifecycle.md).
 */
export async function confirmOperatorRedeem(input: { orderId: string; token?: string; manualOverride?: boolean }) {
  const orderId = input.orderId.trim();

  if (!orderId) {
    return { ok: false as const, error: "Order id is required." };
  }

  const order = findOrderById(orderId);

  if (!order) {
    return { ok: false as const, error: "Pickup order not found for redemption." };
  }

  if (order.orderStatus === "canceled") {
    return { ok: false as const, error: "Canceled orders cannot be redeemed." };
  }

  if (order.paymentStatus !== "paid") {
    return { ok: false as const, error: "Only paid orders can be redeemed." };
  }

  if (!order.tokenIssuedAt) {
    return { ok: false as const, error: "This order does not have an issued QR token yet." };
  }

  if (order.invalidatedAt) {
    return { ok: false as const, error: "This pickup QR is invalidated and can no longer be redeemed." };
  }

  if (order.redeemedAt) {
    return { ok: false as const, error: "This order has already been redeemed." };
  }

  if (!input.manualOverride) {
    const expectedHash = hashPickupToken(input.token?.trim() ?? "");
    const records = tokenStoreByOrderId.get(order.id) ?? [];
    const hasMatch = records.some((record) => record.tokenHash === expectedHash);

    if (!hasMatch) {
      return { ok: false as const, error: "The scanned QR token is invalid." };
    }
  }

  order.redeemedAt = new Date().toISOString();
  order.fulfillmentStatus = "delivered";

  // Production writes a `preorder_redemption_events` row here (event_type =
  // "redeemed", details = { manual_override }) inside the same transaction —
  // see docs/token-lifecycle.md and supabase/migrations/002_pickup_pass_recovery.sql.

  return { ok: true as const };
}
