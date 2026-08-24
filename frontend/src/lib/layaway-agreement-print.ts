import { formatPhpDisplay } from "./format-php";
import { isInstallmentApprovalStatus } from "./order-status-filter-options";
import {
  courierServiceLabel,
  pickupBranchLabel,
  pickupOptionLabel,
} from "./order-pickup-labels";
import type { OrderInstallmentRow } from "./order-installments";

export type LayawayAgreementCustomer = {
  name: string;
  email: string;
  contactNumber: string;
  completeAddress: string | null;
};

export type LayawayAgreementDetail = {
  orderNumber: number;
  createdAt?: string | null;
  customer: LayawayAgreementCustomer;
  inventoryItem: {
    sku: string;
    itemLabel: string;
  };
  layawayMonths: number | null;
  layawayPrice: string | null;
  layawayMonthlyPayment: string | null;
  layawayPaymentStartDate: string | null;
  pickupOption: string | null;
  pickupBranch: string | null;
  courierService: string | null;
  installments: OrderInstallmentRow[];
  signatureUrl: string | null;
};

function escapeHtml(raw: unknown): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function displayValue(raw: unknown): string {
  const s = str(raw);
  if (!s || s === "—") return "";
  return escapeHtml(s);
}

function displayOrDash(raw: unknown): string {
  const s = str(raw);
  if (!s || s === "—") return "—";
  return escapeHtml(s);
}

function formatAgreementDate(raw: string | null | undefined): string {
  const formatted = formatContractDate(raw);
  return formatted || "—";
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

export function canPrintLayawayAgreement(detail: {
  paymentType: string;
  status: string;
}): boolean {
  if (detail.paymentType !== "layaway") return false;
  if (isInstallmentApprovalStatus(detail.status)) return false;
  const key = detail.status.trim().toLowerCase();
  return key !== "declined" && key !== "cancelled" && key !== "expired";
}

const PRINT_STYLES = `
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
    .terms p { margin: 0 0 4px; }
    .schedule-wrap { overflow-x: auto; margin-top: 4px; }
    table.schedule {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    table.schedule th,
    table.schedule td {
      border: 1px solid #d1d5db;
      padding: 4px 6px;
      text-align: left;
    }
    table.schedule th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
    }
    table.schedule td.amount {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
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
    }`;

export function buildLayawayAgreementHtml(
  detail: LayawayAgreementDetail,
  termsHtml: string,
): string {
  const field = (label: string, value: string) =>
    `<div class="field"><span class="k">${label}</span><span class="v">${value}</span></div>`;

  const customerFields = [
    field("Name", displayOrDash(detail.customer.name)),
    field("Contact", displayOrDash(detail.customer.contactNumber)),
    field("Email", displayOrDash(detail.customer.email)),
    field("Address", displayOrDash(detail.customer.completeAddress)),
  ].join("");

  const itemFields = [
    field("Product", displayOrDash(detail.inventoryItem.itemLabel)),
  ].join("");

  const paymentFields = [
    field("Layaway term", displayOrDash(detail.layawayMonths)),
    field(
      "Layaway price",
      `<span class="price">${escapeHtml(formatPhpDisplay(detail.layawayPrice))}</span>`,
    ),
    field(
      "Monthly payment",
      `<span class="price">${escapeHtml(formatPhpDisplay(detail.layawayMonthlyPayment))}</span>`,
    ),
    field(
      "Payment start date",
      formatAgreementDate(detail.layawayPaymentStartDate),
    ),
    ...(detail.pickupOption
      ? [
          field(
            "Pick-up option",
            escapeHtml(pickupOptionLabel(detail.pickupOption)),
          ),
        ]
      : []),
    ...(detail.pickupBranch
      ? [
          field(
            "Branch",
            escapeHtml(pickupBranchLabel(detail.pickupBranch)),
          ),
        ]
      : []),
    ...(detail.courierService
      ? [
          field(
            "Courier service",
            escapeHtml(courierServiceLabel(detail.courierService)),
          ),
        ]
      : []),
  ].join("");

  const scheduleRows =
    detail.installments.length > 0
      ? detail.installments
          .map(
            (row) =>
              `<tr>
                <td>${escapeHtml(row.installmentLabel)}</td>
                <td>${formatAgreementDate(row.dueDate)}</td>
                <td class="amount">${escapeHtml(formatPhpDisplay(row.scheduledAmount))}</td>
              </tr>`,
          )
          .join("")
      : `<tr><td colspan="3" class="muted">No schedule on file.</td></tr>`;

  const scheduleBlock = `
    <div class="schedule-wrap">
      <table class="schedule">
        <thead>
          <tr>
            <th>Installment</th>
            <th>Due date</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>${scheduleRows}</tbody>
      </table>
    </div>`;

  const signatureBlock = detail.signatureUrl
    ? `<img class="signature" src="${escapeHtml(detail.signatureUrl)}" alt="Customer signature" />`
    : `<p class="muted">No signature on file.</p>`;

  const termsBlock = termsHtml.trim()
    ? termsHtml
    : `<p class="muted">Terms could not be loaded.</p>`;
  const agreementDate =
    formatContractDate(detail.layawayPaymentStartDate) ||
    formatContractDate(detail.createdAt);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Layaway Agreement — Order #${escapeHtml(detail.orderNumber)}</title>
  <style>${PRINT_STYLES}</style>
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
          <h1 class="doc-title">LAYAWAY AGREEMENT</h1>
          ${metaRow("Order no.", `#${escapeHtml(detail.orderNumber)}`)}
          ${metaRow("SKU", displayValue(detail.inventoryItem.sku))}
          ${metaRow("Agreement date", agreementDate)}
        </div>
      </div>

      <section>
        <h2>Customer details</h2>
        <div class="row">${customerFields}</div>
      </section>

      <section>
        <h2>Item details</h2>
        <div class="row">${itemFields}</div>
      </section>

      <section>
        <h2>Payment arrangements</h2>
        <div class="row">${paymentFields}</div>
        ${scheduleBlock}
      </section>

      <section>
        <h2>Layaway terms and conditions</h2>
        <div class="terms">${termsBlock}</div>
      </section>

      <section class="sig-section">
        <h2>Customer signature</h2>
        ${signatureBlock}
        <p class="signer">${displayOrDash(detail.customer.name)}</p>
      </section>
    </main>
  </div>
</body>
</html>`;
}

export async function openLayawayAgreementPrintTab(
  detail: LayawayAgreementDetail,
): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error(
      "Could not open print tab. Allow pop-ups for this site and try again.",
    );
  }
  printWindow.document.write(
    `<!DOCTYPE html><html><head><title>Loading agreement…</title></head><body><p style="font:14px system-ui">Loading agreement…</p></body></html>`,
  );
  printWindow.document.close();

  let termsHtml = "";
  try {
    const termsRes = await fetch("/terms/layaway.txt");
    if (termsRes.ok) termsHtml = (await termsRes.text()).trim();
  } catch {
    /* keep empty; document shows fallback */
  }

  const html = buildLayawayAgreementHtml(detail, termsHtml);
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
