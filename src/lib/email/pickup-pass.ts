import "server-only";

type PickupPassEmailPass = {
  marketName?: string | null;
  pickupDate?: string | null;
  pickupWindowLabel?: string | null;
  pickupLocation?: string | null;
  passUrl: string;
  tokenLast4?: string | null;
  qrCodeDataUrl?: string | null;
};

export type SendPickupPassEmailInput = {
  recipientEmail: string;
  passes: PickupPassEmailPass[];
};

const BRAND_NAME = "Demo Farmers Market Co-op";

function normalizeValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPickupDate(value: string | null | undefined) {
  const normalized = normalizeValue(value);

  if (!normalized) {
    return null;
  }

  const date = new Date(`${normalized}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return normalized;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function buildPassSummaryLines(pass: PickupPassEmailPass) {
  const lines: string[] = [];
  const marketName = normalizeValue(pass.marketName);
  const pickupDate = formatPickupDate(pass.pickupDate);
  const pickupWindowLabel = normalizeValue(pass.pickupWindowLabel);
  const pickupLocation = normalizeValue(pass.pickupLocation);
  const tokenLast4 = normalizeValue(pass.tokenLast4);

  if (marketName) lines.push(`Market: ${marketName}`);
  if (pickupDate) lines.push(`Pickup date: ${pickupDate}`);
  if (pickupWindowLabel) lines.push(`Pickup window: ${pickupWindowLabel}`);
  if (pickupLocation) lines.push(`Location: ${pickupLocation}`);
  if (tokenLast4) lines.push(`Pass tail: ${tokenLast4}`);

  return lines;
}

export function getMissingPickupPassEmailConfig() {
  const missing: string[] = [];

  if (!normalizeValue(process.env.RESEND_API_KEY)) {
    missing.push("RESEND_API_KEY");
  }

  if (!normalizeValue(process.env.CONTACT_FROM_EMAIL)) {
    missing.push("CONTACT_FROM_EMAIL");
  }

  return missing;
}

/**
 * Sends the pickup pass email via Resend. Attachments carry the QR as an
 * inline image (cid) with the secure link as a fallback for clients that
 * block images. When RESEND_API_KEY / CONTACT_FROM_EMAIL are unset (e.g. in
 * this showcase's default local setup) this returns a clear "not configured"
 * error instead of silently failing, so callers can degrade the UI.
 */
export async function sendPickupPassEmail(input: SendPickupPassEmailInput) {
  const missing = getMissingPickupPassEmailConfig();

  if (missing.length > 0) {
    return {
      ok: false as const,
      error: `Pickup pass email is not configured: ${missing.join(", ")}.`,
    };
  }

  const recipientEmail = normalizeValue(input.recipientEmail);
  const passes = input.passes.filter((pass) => Boolean(normalizeValue(pass.passUrl)));

  if (!recipientEmail) {
    return { ok: false as const, error: "Pickup pass email recipient is required." };
  }

  if (passes.length === 0) {
    return { ok: false as const, error: "At least one pickup pass is required." };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY!.trim());
  const fromEmail = process.env.CONTACT_FROM_EMAIL!.trim();
  const subject = `Your ${BRAND_NAME} pickup pass`;
  const multiplePasses = passes.length > 1;

  const text = [
    `Your ${BRAND_NAME} pickup pass is ready.`,
    "",
    multiplePasses
      ? "We found more than one active pickup pass for this email. Each pass is listed below."
      : "Use the secure link below to open your pickup pass and show the QR code at pickup.",
    "",
    ...passes.flatMap((pass, index) => {
      const lines = buildPassSummaryLines(pass);

      return [
        multiplePasses ? `Pass ${index + 1}` : "Pickup details",
        ...lines,
        "Show the QR code in this email at pickup, or use the secure link if images are blocked.",
        `View your pickup pass: ${pass.passUrl}`,
        "",
      ];
    }),
    "Please keep this email available until your pickup is complete.",
    "",
    BRAND_NAME,
  ].join("\n");

  const passSections = passes
    .map((pass, index) => {
      const summaryLines = buildPassSummaryLines(pass);

      return `
      <section style="margin-top: ${index === 0 ? "0" : "24px"}; border: 1px solid #e6e6e6; border-radius: 18px; padding: 20px;">
        <p style="margin: 0 0 10px; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700;">
          ${multiplePasses ? `Pickup pass ${index + 1}` : "Pickup pass"}
        </p>
        ${summaryLines.length > 0 ? `<div style="margin: 0 0 16px; line-height: 1.7;">${summaryLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>` : ""}
        <a href="${escapeHtml(pass.passUrl)}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #2b2b2b; color: #ffffff; text-decoration: none; font-weight: 700;">
          View Your Pickup Pass
        </a>
      </section>
    `;
    })
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; padding: 24px;">
      <div style="max-width: 640px; margin: 0 auto; border-radius: 24px; padding: 32px; border: 1px solid #e6e6e6;">
        <p style="margin: 0; font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase; font-weight: 700;">${BRAND_NAME}</p>
        <h1 style="margin: 16px 0 12px; font-size: 28px; line-height: 1.2;">Your pickup pass is ready</h1>
        <p style="margin: 0 0 16px;">Please keep this email available until your pickup is complete.</p>
        <div style="margin-top: 24px;">${passSections}</div>
      </div>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: `${BRAND_NAME} <${fromEmail}>`,
      to: [recipientEmail],
      subject,
      text,
      html,
    });

    if (result.error) {
      return { ok: false as const, error: result.error.message };
    }

    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Pickup pass email could not be sent.",
    };
  }
}
