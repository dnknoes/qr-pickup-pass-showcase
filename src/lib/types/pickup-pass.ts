export type SaleUnit = "unit" | "weight";

export type PickupPassItem = {
  id: string;
  productName: string;
  quantity: number;
  saleUnit: SaleUnit;
  unitPrice: number;
  currencyCode: string;
};

export type PickupPassState = "active" | "redeemed" | "past";

export type PickupPassRecord = {
  orderId: string;
  customerName: string | null;
  customerEmail: string;
  marketName: string | null;
  pickupDate: string | null;
  pickupWindowLabel: string | null;
  pickupLocation: string | null;
  tokenLast4: string;
  qrCodeDataUrl: string;
  tokenIssuedAt: string | null;
  redeemedAt: string | null;
  state: PickupPassState;
  totalAmount: number;
  currencyCode: string;
  items: PickupPassItem[];
  createdAt: string;
};

export type RedeemState = "ready" | "pending" | "redeemed" | "invalid";

export type OperatorRedeemLookup = {
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: PickupPassItem[];
  marketName: string | null;
  pickupDate: string | null;
  pickupWindowLabel: string | null;
  pickupLocation: string | null;
  orderStatus: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  tokenLast4: string | null;
  tokenIssuedAt: string | null;
  redeemedAt: string | null;
  invalidatedAt: string | null;
  totalAmount: number;
  currencyCode: string;
  redeemState: RedeemState;
};
