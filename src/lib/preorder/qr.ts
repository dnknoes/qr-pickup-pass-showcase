import QRCode from "qrcode";

/**
 * The QR payload is a redemption URL keyed by the opaque token — never the
 * order id. This keeps the order id (and any customer data derived from it)
 * out of anything that could be photographed, screenshotted, or shared.
 */
export function buildCustomerPickupPassUrl(token: string, siteUrl: URL) {
  return new URL(`/pickup-pass/${encodeURIComponent(token.trim())}`, siteUrl);
}

export function buildOperatorRedeemUrl(token: string, siteUrl: URL) {
  const redeemUrl = new URL("/operator/redeem", siteUrl);
  redeemUrl.searchParams.set("token", token.trim());
  return redeemUrl;
}

export function renderRedeemQrDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: {
      dark: "#1a1a1a",
      light: "#0000",
    },
  });
}

export function renderPickupTokenQrDataUrl(token: string, siteUrl: URL) {
  return renderRedeemQrDataUrl(buildOperatorRedeemUrl(token, siteUrl).toString());
}
