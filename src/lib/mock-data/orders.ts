import type { PickupPassItem } from "@/lib/types/pickup-pass";

/**
 * Fictional demo data standing in for the `orders` / `order_items` / `payments`
 * tables described in docs/database-schema.md. In production this module is
 * replaced by Supabase queries — see src/lib/preorder/pickup-passes.ts.
 */

/** Dates below are computed relative to whenever the app runs, so the demo never goes stale. */
function daysFromNow(offsetDays: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date;
}

function isoDaysFromNow(offsetDays: number) {
  return daysFromNow(offsetDays).toISOString();
}

function dateOnlyDaysFromNow(offsetDays: number) {
  return daysFromNow(offsetDays).toISOString().slice(0, 10);
}

export type MockOrder = {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  marketName: string;
  pickupDate: string;
  pickupWindowLabel: string;
  pickupLocation: string;
  orderStatus: "confirmed" | "canceled";
  paymentStatus: "paid" | "unpaid" | "refunded";
  fulfillmentStatus: "pending" | "delivered";
  tokenIssuedAt: string | null;
  redeemedAt: string | null;
  invalidatedAt: string | null;
  totalAmount: number;
  currencyCode: string;
  items: PickupPassItem[];
  createdAt: string;
};

export const mockOrders: MockOrder[] = [
  {
    id: "order_123_demo",
    customerName: "Jordan Rivera",
    customerEmail: "customer@example.com",
    customerPhone: "555-0100",
    marketName: "Demo Farmers Market",
    pickupDate: dateOnlyDaysFromNow(7),
    pickupWindowLabel: "Saturday, 9:00 AM – 1:00 PM",
    pickupLocation: "Demo Farmers Market, Main Plaza",
    orderStatus: "confirmed",
    paymentStatus: "paid",
    fulfillmentStatus: "pending",
    tokenIssuedAt: isoDaysFromNow(-1),
    redeemedAt: null,
    invalidatedAt: null,
    totalAmount: 42.5,
    currencyCode: "USD",
    items: [
      {
        id: "item_1_demo",
        productName: "Lion's Mane, 1 lb",
        quantity: 1,
        saleUnit: "weight",
        unitPrice: 18,
        currencyCode: "USD",
      },
      {
        id: "item_2_demo",
        productName: "Grow Kit",
        quantity: 2,
        saleUnit: "unit",
        unitPrice: 12.25,
        currencyCode: "USD",
      },
    ],
    createdAt: isoDaysFromNow(-3),
  },
  {
    id: "order_456_demo",
    customerName: "Sam Okafor",
    customerEmail: "sam@example.com",
    customerPhone: "555-0101",
    marketName: "Demo Farmers Market",
    pickupDate: dateOnlyDaysFromNow(-7),
    pickupWindowLabel: "Saturday, 9:00 AM – 1:00 PM",
    pickupLocation: "Demo Farmers Market, Main Plaza",
    orderStatus: "confirmed",
    paymentStatus: "paid",
    fulfillmentStatus: "delivered",
    tokenIssuedAt: isoDaysFromNow(-10),
    redeemedAt: isoDaysFromNow(-7),
    invalidatedAt: null,
    totalAmount: 24,
    currencyCode: "USD",
    items: [
      {
        id: "item_3_demo",
        productName: "Oyster Mushroom, 1 lb",
        quantity: 1,
        saleUnit: "weight",
        unitPrice: 24,
        currencyCode: "USD",
      },
    ],
    createdAt: isoDaysFromNow(-14),
  },
];
