"use server";

import { redirect } from "next/navigation";
import {
  getMissingPickupPassAccessConfig,
  requestPickupPassRecoveryEmail,
} from "@/lib/preorder/pickup-passes";

const PICKUP_PASS_ACCESS_UNAVAILABLE_MESSAGE = "Pickup pass access is temporarily unavailable. Please try again later.";

function withQuery(path: string, values: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function getSafePath(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export async function requestPickupPassAccessAction(formData: FormData) {
  const redirectPath = getSafePath(formData.get("redirectPath"), "/pickup-passes");
  const missing = getMissingPickupPassAccessConfig();

  if (missing.length > 0) {
    redirect(withQuery(redirectPath, { error: PICKUP_PASS_ACCESS_UNAVAILABLE_MESSAGE }));
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    redirect(withQuery(redirectPath, { error: "Enter the same email you used at checkout." }));
  }

  try {
    const result = await requestPickupPassRecoveryEmail(email);

    if (!result.ok) {
      console.error("Pickup pass recovery email failed", result.error);
    }
  } catch (error) {
    console.error("Pickup pass recovery email failed", error);
  }

  redirect(withQuery(redirectPath, { message: "link_sent" }));
}
