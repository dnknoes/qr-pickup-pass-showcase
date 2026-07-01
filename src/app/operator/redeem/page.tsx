import type { Metadata } from "next";
import { PreorderRedeemPanel } from "@/components/preorder-redeem-panel";

export const metadata: Metadata = {
  title: "Operator Redeem | QR Pickup Pass Demo",
  description: "Staff-facing scan-and-confirm redemption panel for paid pickup orders.",
  robots: {
    index: false,
    follow: false,
  },
};

type OperatorRedeemPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function OperatorRedeemPage({ searchParams }: OperatorRedeemPageProps) {
  const params = await searchParams;
  const initialToken = params.token?.trim() || null;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px", fontFamily: "system-ui, sans-serif" }}>
      <p style={{ textTransform: "uppercase", fontSize: 12, letterSpacing: "0.2em" }}>Operator</p>
      <h1>Redeem pickup pass</h1>
      <p>
        In production this route sits behind staff session auth before any lookup logic runs.
        This showcase leaves it open — see SECURITY_NOTES.md.
      </p>
      <PreorderRedeemPanel initialToken={initialToken} />
    </main>
  );
}
