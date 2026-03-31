import { NextResponse } from "next/server";

export const runtime = "nodejs";

type PagBankOrderRequest = {
  referenceId?: string;
  amount: number;
  customer?: {
    name?: string;
    email?: string;
    taxId?: string;
    phone?: string;
  };
};

function normalizeDigits(value?: string | null) {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function buildPhone(input?: string | null, fallback?: string | null) {
  const digits = normalizeDigits(input || fallback || "");
  if (!digits) return null;
  const trimmed = digits.startsWith("55") ? digits.slice(2) : digits;
  if (trimmed.length < 10) return null;
  const area = trimmed.slice(0, 2);
  const number = trimmed.slice(2);
  if (!area || number.length < 8) return null;
  return { country: "55", area, number };
}

function buildBaseUrl() {
  const explicit = process.env.PAGBANK_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const env = (process.env.PAGBANK_ENV || "sandbox").toLowerCase();
  return env === "production" ? "https://api.pagseguro.com" : "https://sandbox.api.pagseguro.com";
}

export async function POST(request: Request) {
  const token = process.env.PAGBANK_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "PagBank token not configured." }, { status: 500 });
  }

  let body: PagBankOrderRequest;
  try {
    body = (await request.json()) as PagBankOrderRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
  }

  const cents = Math.round(amount * 100);
  const customerName = body.customer?.name?.trim() || "Cliente Solara";
  const email =
    body.customer?.email?.trim() ||
    process.env.PAGBANK_DEFAULT_EMAIL ||
    "contato@solara.local";
  const taxId =
    normalizeDigits(body.customer?.taxId) ||
    normalizeDigits(process.env.PAGBANK_DEFAULT_TAX_ID);
  if (!taxId) {
    return NextResponse.json(
      { error: "CPF/CNPJ not configured." },
      { status: 500 }
    );
  }

  const phone = buildPhone(
    body.customer?.phone,
    process.env.PAGBANK_DEFAULT_PHONE || null
  );

  const payload = {
    reference_id: body.referenceId || `cobranca-${Date.now()}`,
    customer: {
      name: customerName,
      email,
      tax_id: taxId,
      ...(phone ? { phones: [phone] } : {}),
    },
    items: [
      {
        name: "Cobrança Solara",
        quantity: 1,
        unit_amount: cents,
      },
    ],
    qr_codes: [
      {
        amount: { value: cents },
      },
    ],
    ...(process.env.PAGBANK_NOTIFICATION_URL
      ? { notification_urls: [process.env.PAGBANK_NOTIFICATION_URL] }
      : {}),
  };

  const response = await fetch(`${buildBaseUrl()}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: "PagBank request failed.", details: errorText },
      { status: response.status }
    );
  }

  const data = await response.json();
  const qr = Array.isArray(data?.qr_codes) ? data.qr_codes[0] : null;
  const pngLink = Array.isArray(qr?.links)
    ? qr.links.find((link: { rel?: string }) => link.rel === "QRCODE.PNG")
    : null;
  const expiresMinutes = Number(process.env.PAGBANK_PIX_EXPIRES_MINUTES ?? "60");
  const expiresAt = Number.isFinite(expiresMinutes)
    ? new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString()
    : null;

  return NextResponse.json({
    ok: true,
    orderId: data?.id ?? null,
    referenceId: data?.reference_id ?? null,
    qrCodeText: qr?.text ?? null,
    qrCodeImageUrl: pngLink?.href ?? null,
    expiresAt,
    raw: data,
  });
}
