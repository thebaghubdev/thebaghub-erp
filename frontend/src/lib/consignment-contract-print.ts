import { branchLabel } from "./consignment-schedule-labels";
import {
  formatClientBank,
  formatClientPaymentMethod,
} from "./client-payment-preference";
import { formatPhpDisplay } from "./format-php";

export type ConsignmentContractClientOfferConfirmation = {
  paymentMethod: "check_pickup" | "cash_pickup" | "direct_deposit";
  paymentBranch: "pasig" | "makati" | null;
  bankDetails: {
    accountNumber: string;
    accountName: string;
    bank: "bdo" | "bpi" | "other";
  } | null;
  signatureUrl: string;
};

export type ConsignmentContractDetail = {
  sku: string;
  consignorName: string;
  consignorEmail: string;
  consignorPhone: string;
  consignorAddress: string;
  brand: string;
  itemModel: string;
  serialNumber: string;
  condition: string;
  inclusions: string;
  consignmentSellingPrice: string;
  offerPrice: string | null;
  contractStartDate?: string | null;
  contractExpirationDate?: string | null;
  createdAt?: string | null;
  clientOfferConfirmation?: ConsignmentContractClientOfferConfirmation | null;
  itemSnapshot: {
    form: Record<string, unknown>;
  };
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function escapeHtml(raw: unknown): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function contractDisplay(raw: unknown): string {
  const s = str(raw);
  if (!s || s === "—") return "—";
  return escapeHtml(s);
}

function displayValue(raw: unknown): string {
  const s = str(raw);
  if (!s || s === "—") return "";
  return escapeHtml(s);
}

function formatContractDate(raw: string | null | undefined): string {
  if (raw == null || raw.trim() === "") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return escapeHtml(
      new Date(y, mo - 1, d).toLocaleDateString(undefined, {
        dateStyle: "medium",
      }),
    );
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return escapeHtml(
    parsed.toLocaleDateString(undefined, { dateStyle: "medium" }),
  );
}

function metaRow(label: string, value: string): string {
  return `<div class="meta-row"><span class="meta-label">${escapeHtml(label)}</span><span class="meta-value">${value || "&nbsp;"}</span></div>`;
}

export function buildConsignmentContractHtml(
  detail: ConsignmentContractDetail,
  termsHtml: string,
): string {
  const form = detail.itemSnapshot.form ?? {};
  const confirmation = detail.clientOfferConfirmation ?? null;
  const price =
    detail.offerPrice != null && str(detail.offerPrice) !== ""
      ? formatPhpDisplay(detail.offerPrice)
      : formatPhpDisplay(detail.consignmentSellingPrice);

  const paymentFields: Array<[string, string]> = [
    [
      "Preferred payment",
      confirmation
        ? escapeHtml(formatClientPaymentMethod(confirmation.paymentMethod))
        : "—",
    ],
  ];
  if (
    confirmation?.paymentMethod === "direct_deposit" &&
    confirmation.bankDetails
  ) {
    paymentFields.push(
      ["Bank", escapeHtml(formatClientBank(confirmation.bankDetails.bank))],
      ["Account name", contractDisplay(confirmation.bankDetails.accountName)],
      [
        "Account number",
        `<span class="mono">${contractDisplay(confirmation.bankDetails.accountNumber)}</span>`,
      ],
    );
  } else if (
    confirmation &&
    confirmation.paymentMethod !== "direct_deposit" &&
    confirmation.paymentBranch
  ) {
    paymentFields.push([
      "Pickup branch",
      escapeHtml(branchLabel(confirmation.paymentBranch)),
    ]);
  }

  const field = (label: string, value: string) =>
    `<div class="field"><span class="k">${label}</span><span class="v">${value}</span></div>`;

  const consignorIdentityFields = [
    field("Name", contractDisplay(detail.consignorName)),
    field("Contact", contractDisplay(detail.consignorPhone)),
    field("Email", contractDisplay(detail.consignorEmail)),
    field("Address", contractDisplay(detail.consignorAddress)),
  ].join("");
  const consignorPaymentFields = paymentFields
    .map(([label, value]) => field(label, value))
    .join("");

  const itemFields = [
    field("Brand", contractDisplay(str(form.brand) || detail.brand)),
    field("Model", contractDisplay(str(form.itemModel) || detail.itemModel)),
    field("Color", contractDisplay(form.color)),
    field("Material", contractDisplay(form.material)),
    field(
      "Serial no.",
      `<span class="mono">${contractDisplay(str(form.serialNumber) || detail.serialNumber)}</span>`,
    ),
    field(
      "Condition",
      contractDisplay(str(form.condition) || detail.condition),
    ),
    field(
      "Inclusions",
      contractDisplay(str(form.inclusions) || detail.inclusions),
    ),
    field(
      "Consignor's price",
      `<span class="price">${escapeHtml(price)}</span>`,
    ),
  ].join("");

  const signatureBlock = confirmation?.signatureUrl
    ? `<img class="signature" src="${escapeHtml(confirmation.signatureUrl)}" alt="Consignor signature" />`
    : `<p class="muted">No signature on file.</p>`;

  const termsBlock = termsHtml.trim()
    ? termsHtml
    : `<p class="muted">Terms could not be loaded.</p>`;
  const consignmentDate =
    formatContractDate(detail.contractStartDate) ||
    formatContractDate(detail.createdAt);
  const expirationDate = formatContractDate(detail.contractExpirationDate);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Consignment Contract — ${escapeHtml(detail.sku)}</title>
  <style>
    @page { size: letter; margin: 0.75in; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: Georgia, "Times New Roman", Times, serif;
      color: #111827;
      background: #e5e7eb;
      line-height: 1.35;
      font-size: 12px;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      justify-content: flex-end;
      padding: 0.55rem 1rem;
      border-bottom: 1px solid #d1d5db;
      background: rgba(249,250,251,0.96);
    }
    .toolbar button {
      border: 0;
      border-radius: 0.4rem;
      background: #7c3aed;
      color: #fff;
      font: 600 0.8rem/1.2 system-ui, sans-serif;
      padding: 0.4rem 0.85rem;
      cursor: pointer;
    }
    .page {
      min-height: calc(100vh - 48px);
      display: flex;
      justify-content: center;
      padding: 24px 16px 40px;
    }
    .sheet {
      width: 8.5in;
      min-height: 11in;
      margin: 0 auto;
      padding: 0.75in;
      background: #fff;
      color: #111827;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 12px 28px rgba(15,23,42,0.18);
    }
    .letterhead {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 12px;
      font-family: "Times New Roman", Times, serif;
    }
    .brand-name {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 0.02em;
      line-height: 1;
    }
    .brand-address {
      margin-top: 6px;
      font-size: 11px;
      line-height: 1.35;
    }
    .doc-title {
      margin: 0 0 8px;
      font-size: 22px;
      font-weight: 700;
      text-align: right;
      line-height: 1;
      letter-spacing: 0.02em;
    }
    .meta-block {
      min-width: 11rem;
    }
    .meta-row {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
      margin-top: 2px;
      font-size: 11px;
    }
    .meta-label {
      white-space: nowrap;
      font-weight: 700;
    }
    .meta-value {
      min-width: 7rem;
      text-align: left;
      padding: 0 2px 1px;
    }
    section {
      margin: 0;
      width: 100%;
      padding: 10px 0;
      border-bottom: 1px solid #d1d5db;
    }
    section:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }
    h2 {
      margin: 0 0 4px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #6b7280;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 20px;
      width: 100%;
      align-items: baseline;
    }
    .field {
      display: inline-flex;
      flex: 0 1 auto;
      gap: 4px;
      align-items: baseline;
      max-width: 100%;
      min-width: 7.5rem;
    }
    .k {
      flex: 0 0 auto;
      color: #6b7280;
      font-size: 10px;
      white-space: nowrap;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .k::after { content: ":"; }
    .v {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 12px;
      line-height: 1.35;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
    .price { font-weight: 700; font-variant-numeric: tabular-nums; }
    .terms {
      font-size: 8px;
      line-height: 1.25;
      color: #1f2937;
    }
    .terms ul, .terms ol { margin: 0; padding-left: 1rem; }
    .terms li { margin: 0 0 2px; }
    .sig-section h2 { margin: 0 0 4px; }
    .signature {
      display: block;
      height: 40px;
      max-width: 200px;
      border: 1px solid #d1d5db;
      background: #fff;
      object-fit: contain;
      padding: 2px;
    }
    .signer { margin: 2px 0 0; font-size: 12px; font-weight: 700; }
    .muted { color: #6b7280; margin: 0; font-size: 12px; }
    @media print {
      body { background: #fff; }
      .toolbar, .page { display: contents; }
      .sheet {
        width: auto;
        min-height: 0;
        margin: 0;
        padding: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Print</button>
  </div>
  <div class="page">
    <main class="sheet">
      <div class="letterhead">
        <div>
          <div class="brand-name">THE BAG HUB</div>
          <div class="brand-address">
            The Grove Retail Row<br />
            201 2nd Floor<br />
            E. Rodriguez Jr., Ave. Pasig City
          </div>
        </div>
        <div class="meta-block">
          <h1 class="doc-title">CONSIGNMENT CONTRACT</h1>
          ${metaRow("SKU", displayValue(detail.sku))}
          ${metaRow("Consignment date", consignmentDate)}
          ${metaRow("Expiration date", expirationDate)}
        </div>
      </div>

      <section>
        <h2>Consignor details</h2>
        <div class="row">${consignorIdentityFields}</div>
        <div class="row">${consignorPaymentFields}</div>
      </section>

      <section>
        <h2>Item details</h2>
        <div class="row">${itemFields}</div>
      </section>

      <section>
        <h2>Consignment terms and conditions</h2>
        <div class="terms">${termsBlock}</div>
      </section>

      <section class="sig-section">
        <h2>Consignor signature</h2>
        ${signatureBlock}
        <p class="signer">${contractDisplay(detail.consignorName)}</p>
      </section>
    </main>
  </div>
</body>
</html>`;
}

export async function openConsignmentContractPrintTab(
  detail: ConsignmentContractDetail,
): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error(
      "Could not open print tab. Allow pop-ups for this site and try again.",
    );
  }
  printWindow.document.write(
    `<!DOCTYPE html><html><head><title>Loading contract…</title></head><body><p style="font:14px system-ui">Loading contract…</p></body></html>`,
  );
  printWindow.document.close();

  let termsHtml = "";
  try {
    const termsRes = await fetch("/terms/consignment.txt");
    if (termsRes.ok) termsHtml = (await termsRes.text()).trim();
  } catch {
    /* keep empty; document shows fallback */
  }

  const html = buildConsignmentContractHtml(detail, termsHtml);
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
