import type { Metadata } from "next";
import Link from "next/link";
import { getPickupPassTokenPageData } from "@/lib/preorder/pickup-passes";

export const metadata: Metadata = {
  title: "Pickup Pass | QR Pickup Pass Demo",
  description: "Customer pickup pass for a paid preorder pickup order.",
  robots: {
    index: false,
    follow: false,
  },
};

type PickupPassTokenPageProps = {
  params: Promise<{
    token: string;
  }>;
};

function formatCurrency(currencyCode: string, amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount);
}

function formatQuantity(quantity: number, saleUnit: "unit" | "weight") {
  return saleUnit === "weight" ? `${quantity} lb` : `${quantity}x`;
}

export default async function PickupPassTokenPage({ params }: PickupPassTokenPageProps) {
  const { token } = await params;
  const pageData = await getPickupPassTokenPageData(token);
  const pass = pageData.pass;
  const isActivePass = pass?.state === "active";

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px", fontFamily: "system-ui, sans-serif" }}>
      {!pageData.featureAvailable ? (
        <section>
          <p>Pickup pass access is temporarily unavailable. Please try again later.</p>
        </section>
      ) : null}

      {pageData.featureAvailable && (pageData.notFound || !pass) ? (
        <section>
          <p style={{ textTransform: "uppercase", fontSize: 12, letterSpacing: "0.2em" }}>Pickup pass</p>
          <h1>Pass not found</h1>
          <p>This pickup pass link is invalid, expired, or no longer active.</p>
          <p>
            <Link href="/pickup-passes">Recover my pickup pass</Link>
          </p>
        </section>
      ) : null}

      {pageData.featureAvailable && pass ? (
        <section>
          <p style={{ textTransform: "uppercase", fontSize: 12, letterSpacing: "0.2em" }}>Pickup pass</p>
          <h1>{pass.marketName ?? "Market pickup"}</h1>
          <p>
            {isActivePass
              ? "Show this pass at pickup so staff can scan your QR code and redeem your paid order."
              : "This pickup pass is no longer active, but the order details remain available for reference."}
          </p>
          <p>{formatCurrency(pass.currencyCode, pass.totalAmount)}</p>

          {pass.state === "redeemed" ? (
            <p>This pickup pass was already redeemed on {new Date(pass.redeemedAt!).toLocaleString("en-US")}.</p>
          ) : null}

          {pass.state === "past" ? <p>The pickup window for this pass has passed.</p> : null}

          {isActivePass ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Pickup pass QR code" src={pass.qrCodeDataUrl} width={240} height={240} />
          ) : null}

          <h2>Items</h2>
          <ul>
            {pass.items.map((item) => (
              <li key={item.id}>
                {item.productName} — {formatQuantity(item.quantity, item.saleUnit)}
              </li>
            ))}
          </ul>

          <h2>Pass details</h2>
          <dl>
            {pass.customerName ? (
              <>
                <dt>Customer</dt>
                <dd>{pass.customerName}</dd>
              </>
            ) : null}
            <dt>Status</dt>
            <dd>{pass.state === "active" ? "Active" : pass.state === "redeemed" ? "Already redeemed" : "Pickup window has passed"}</dd>
            <dt>Order reference</dt>
            <dd>…{pass.orderId.slice(-8)}</dd>
            <dt>Issued</dt>
            <dd>{new Date(pass.tokenIssuedAt ?? pass.createdAt).toLocaleString("en-US")}</dd>
          </dl>
        </section>
      ) : null}
    </main>
  );
}
