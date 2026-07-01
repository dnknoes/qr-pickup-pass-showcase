import type { Metadata } from "next";
import { getPickupPassPageData } from "@/lib/preorder/pickup-passes";
import { requestPickupPassAccessAction } from "./actions";

export const metadata: Metadata = {
  title: "My Pickup Passes | QR Pickup Pass Demo",
  description: "Secure customer recovery flow for active preorder pickup passes across devices.",
  robots: {
    index: false,
    follow: false,
  },
};

type PickupPassesPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

function getStatusMessage(message: string | undefined) {
  switch (message) {
    case "link_sent":
      return "Check your email for your pickup pass link. If we found active pickup passes for that email, we sent them there.";
    default:
      return null;
  }
}

export default async function PickupPassesPage({ searchParams }: PickupPassesPageProps) {
  const [params, pageData] = await Promise.all([searchParams, getPickupPassPageData()]);
  const statusMessage = getStatusMessage(params.message);

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px", fontFamily: "system-ui, sans-serif" }}>
      <p style={{ textTransform: "uppercase", fontSize: 12, letterSpacing: "0.2em" }}>Pickup passes</p>
      <h1>Recover your pickup pass</h1>
      <p>
        Enter the email you used at checkout. We&apos;ll resend your active pickup pass links if we find any paid
        pickup orders for that email.
      </p>

      <h2>How it works</h2>
      <ul>
        <li>Enter the email you used when you placed your order.</li>
        <li>Check your inbox for pickup pass links.</li>
        <li>Open a link to view the QR code and pickup details without logging in.</li>
        <li>Already-redeemed, refunded, or invalidated passes will not be re-sent.</li>
      </ul>

      {params.error ? <p role="alert">{params.error}</p> : null}
      {statusMessage ? <p>{statusMessage}</p> : null}
      {!pageData.featureAvailable ? (
        <p role="alert">Pickup pass access is temporarily unavailable. Please try again later.</p>
      ) : null}

      <form action={requestPickupPassAccessAction}>
        <input name="redirectPath" type="hidden" value="/pickup-passes" />
        <label htmlFor="pickup-pass-email">Email used at checkout</label>
        <br />
        <input id="pickup-pass-email" name="email" required type="email" />
        <br />
        <button disabled={!pageData.featureAvailable} type="submit">
          Email me my pickup pass links
        </button>
      </form>
    </main>
  );
}
