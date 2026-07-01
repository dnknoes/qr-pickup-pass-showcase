import { NextResponse } from "next/server";
import { confirmOperatorRedeem } from "@/lib/preorder/pickup-passes";

/**
 * In production this route sits behind operator session auth (staff-only
 * role check) before `confirmOperatorRedeem` runs — omitted here since this
 * showcase has no auth system. See SECURITY_NOTES.md ("what was simplified").
 */
export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { orderId: string; token?: string; manualOverride?: boolean };
    const result = await confirmOperatorRedeem(payload);

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Redemption failed." },
      { status: 400 },
    );
  }
}
