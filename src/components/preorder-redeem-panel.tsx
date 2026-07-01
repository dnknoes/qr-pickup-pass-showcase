"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperatorRedeemLookup } from "@/lib/types/pickup-pass";

type LookupResponse =
  | { ok: true; preorder: OperatorRedeemLookup; tokenMatched: boolean }
  | { ok: false; error: string };

type ConfirmResponse = { ok: true } | { ok: false; error: string };

const SCANNER_ID = "pickup-pass-redeem-scanner";

function humanizeState(value: string) {
  return value.replace(/_/g, " ");
}

function formatQuantity(quantity: number, saleUnit: "unit" | "weight") {
  return saleUnit === "weight" ? `${quantity} lb` : `${quantity}x`;
}

function extractPickupToken(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue.startsWith("http://") || trimmedValue.startsWith("https://")) {
    return new URL(trimmedValue).searchParams.get("token")?.trim() || null;
  }

  if (trimmedValue.startsWith("/")) {
    return new URL(trimmedValue, window.location.origin).searchParams.get("token")?.trim() || null;
  }

  return trimmedValue;
}

type PreorderRedeemPanelProps = {
  initialToken?: string | null;
};

/**
 * Camera scanning uses the optional `html5-qrcode` package, dynamically
 * imported so the rest of the app doesn't pay for it. Not installed by
 * default in this showcase — see package.json comments / README.
 */
export function PreorderRedeemPanel({ initialToken = null }: PreorderRedeemPanelProps) {
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const hasLoadedInitialToken = useRef(false);
  const [isStartingScanner, setIsStartingScanner] = useState(false);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [lookupValue, setLookupValue] = useState("");
  const [lookupToken, setLookupToken] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<OperatorRedeemLookup | null>(null);
  const [tokenMatched, setTokenMatched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFallbackTools, setShowFallbackTools] = useState(false);

  useEffect(() => {
    return () => {
      if (!scannerRef.current) {
        return;
      }

      scannerRef.current.stop().catch(() => undefined).finally(() => {
        scannerRef.current?.clear();
        scannerRef.current = null;
      });
    };
  }, []);

  const performLookup = useCallback(async (payload: { orderId?: string; token?: string }) => {
    setLookupError(null);
    setConfirmError(null);
    const response = await fetch("/api/redeem/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as LookupResponse;

    if (!response.ok || !result.ok) {
      setLookupResult(null);
      setTokenMatched(false);
      setLookupError(result.ok ? "Lookup failed." : result.error);
      return;
    }

    setLookupResult(result.preorder);
    setTokenMatched(result.tokenMatched);
    setLookupError(null);
  }, []);

  useEffect(() => {
    const token = initialToken ? extractPickupToken(initialToken) : null;

    if (!token || hasLoadedInitialToken.current) {
      return;
    }

    hasLoadedInitialToken.current = true;
    setLookupValue("");
    setLookupToken(token);
    void performLookup({ token });
  }, [initialToken, performLookup]);

  async function startScanner() {
    setLookupError(null);
    setConfirmError(null);
    setIsStartingScanner(true);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          const token = extractPickupToken(decodedText);

          setLookupValue("");
          setLookupToken(token);

          if (!token) {
            setLookupResult(null);
            setTokenMatched(false);
            setLookupError("Scanned QR did not include a pickup token.");
          } else {
            await performLookup({ token });
          }

          await scanner.stop().catch(() => undefined);
          scanner.clear();
          scannerRef.current = null;
          setIsScannerActive(false);
        },
        () => undefined,
      );
      setIsScannerActive(true);
    } catch {
      setLookupError("Camera scanner could not be started on this device.");
    } finally {
      setIsStartingScanner(false);
    }
  }

  async function stopScanner() {
    if (!scannerRef.current) {
      setIsScannerActive(false);
      return;
    }

    await scannerRef.current.stop().catch(() => undefined);
    scannerRef.current.clear();
    scannerRef.current = null;
    setIsScannerActive(false);
  }

  async function redeemPreorder(manualOverride: boolean) {
    if (!lookupResult) {
      return;
    }

    setIsSubmitting(true);
    setConfirmError(null);

    try {
      const response = await fetch("/api/redeem/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: lookupResult.orderId,
          token: manualOverride ? undefined : lookupToken ?? undefined,
          manualOverride,
        }),
      });
      const result = (await response.json()) as ConfirmResponse;

      if (!response.ok || !result.ok) {
        setConfirmError(result.ok ? "Redemption failed." : result.error);
        return;
      }

      await performLookup({ orderId: lookupResult.orderId });
      setLookupToken(null);
    } catch {
      setConfirmError("Redemption could not be completed right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasSuccessfulTokenEntry = Boolean(initialToken?.trim() && lookupResult);
  const showLookupTools = !hasSuccessfulTokenEntry || showFallbackTools;

  return (
    <div>
      <section>
        <h2>Redeem paid pickup order</h2>
        <p>Scan the customer QR or fall back to a manual order lookup. Only paid, issued, non-invalidated orders can be redeemed.</p>

        {lookupError ? <div role="alert">{lookupError}</div> : null}
        {confirmError ? <div role="alert">{confirmError}</div> : null}

        {showLookupTools ? (
          <div>
            <div>
              <button disabled={isScannerActive || isStartingScanner} onClick={() => void startScanner()} type="button">
                {isStartingScanner ? "Starting camera..." : isScannerActive ? "Scanner active" : "Start camera scanner"}
              </button>
              {isScannerActive ? (
                <button onClick={() => void stopScanner()} type="button">
                  Stop camera
                </button>
              ) : null}
              <div id={SCANNER_ID} style={{ minHeight: 260 }} />
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                setLookupToken(null);
                void performLookup({ orderId: lookupValue });
              }}
            >
              <label>
                Manual order lookup
                <br />
                <input onChange={(event) => setLookupValue(event.target.value)} placeholder="Paste pickup order id" value={lookupValue} />
              </label>
              <button type="submit">Lookup order id</button>
            </form>
          </div>
        ) : null}

        <div>
          {!lookupResult ? (
            <p>Scan a QR or look up an order id to review the order before redeeming it.</p>
          ) : (
            <div>
              <p>Lookup result</p>
              <h3>{lookupResult.customerName}</h3>
              <p>Order {lookupResult.orderId}</p>
              <p>Phone {lookupResult.customerPhone}</p>
              {lookupResult.customerEmail ? <p>Email {lookupResult.customerEmail}</p> : null}

              <dl>
                <dt>Payment</dt>
                <dd>{humanizeState(lookupResult.paymentStatus)}</dd>
                <dt>Redeem state</dt>
                <dd>{lookupResult.redeemState}</dd>
              </dl>

              <p>{lookupResult.marketName ?? "Market pickup"}</p>
              {lookupResult.pickupDate ? <p>{lookupResult.pickupDate}</p> : null}
              {lookupResult.pickupWindowLabel ? <p>{lookupResult.pickupWindowLabel}</p> : null}
              {lookupResult.pickupLocation ? <p>{lookupResult.pickupLocation}</p> : null}
              <p>{new Intl.NumberFormat("en-US", { style: "currency", currency: lookupResult.currencyCode }).format(lookupResult.totalAmount)}</p>
              {lookupResult.tokenLast4 ? <p>QR tail: •••• {lookupResult.tokenLast4}</p> : null}
              {lookupResult.redeemedAt ? <p>Redeemed: {new Date(lookupResult.redeemedAt).toLocaleString("en-US")}</p> : null}
              {lookupResult.invalidatedAt ? <p>Invalidated: {new Date(lookupResult.invalidatedAt).toLocaleString("en-US")}</p> : null}

              <p>Items ordered</p>
              {lookupResult.items.length === 0 ? (
                <p>No order items were found for this order.</p>
              ) : (
                <ul>
                  {lookupResult.items.map((item) => (
                    <li key={item.id}>
                      {item.productName} — {formatQuantity(item.quantity, item.saleUnit)}
                    </li>
                  ))}
                </ul>
              )}

              <div>
                {lookupResult.redeemState === "ready" && tokenMatched ? (
                  <button disabled={isSubmitting} onClick={() => void redeemPreorder(false)} type="button">
                    {isSubmitting ? "Redeeming..." : "Redeem scanned order"}
                  </button>
                ) : null}
                {lookupResult.redeemState === "ready" ? (
                  <button disabled={isSubmitting} onClick={() => void redeemPreorder(true)} type="button">
                    {isSubmitting ? "Redeeming..." : "Manual redeem override"}
                  </button>
                ) : null}
              </div>

              {hasSuccessfulTokenEntry ? (
                <button onClick={() => setShowFallbackTools((current) => !current)} type="button">
                  {showLookupTools ? "Hide scanner and manual lookup tools" : "Use scanner or manual lookup instead"}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
