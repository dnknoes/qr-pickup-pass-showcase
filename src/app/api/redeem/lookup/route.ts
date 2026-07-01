import { NextResponse } from "next/server";
import { lookupOperatorRedeem } from "@/lib/preorder/pickup-passes";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { orderId?: string; token?: string };
    const result = await lookupOperatorRedeem(payload);

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Lookup failed." },
      { status: 400 },
    );
  }
}
