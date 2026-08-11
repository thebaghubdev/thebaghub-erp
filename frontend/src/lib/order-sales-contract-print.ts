import { formatPhpDisplay } from "./format-php";
import { isForPickupOrderStatus, pickupOptionLabel } from "./order-pickup-labels";
import {
  isInstallmentPaymentType,
  isItemReceivedOrderStatus,
  paymentTypeLabel,
} from "./order-status-filter-options";
import type { OrderInstallmentRow } from "./order-installments";
import type { OrderPaymentRow } from "./order-payments";
import { isOrderPaymentConfirmedStatus } from "./order-payments";

export type OrderSalesContractCustomer = {
  name: string;
  email: string;
  contactNumber: string;
  completeAddress: string | null;
};

export type OrderSalesContractDetail = {
  orderNumber: number;
  status: string;
  paymentType: string;
  documentDate: string | null;
  customer: OrderSalesContractCustomer;
  inventoryItem: {
    sku: string;
    itemLabel: string;
  };
  orderTotalPrice: string | null;
  layawayPrice: string | null;
  pickupOption: string | null;
  assignedToName: string | null;
  installments: OrderInstallmentRow[];
  payments: OrderPaymentRow[];
  signatureUrl: string | null;
};

const ACKNOWLEDGEMENT_PARAGRAPHS = [
  "I hereby confirm that I have fully inspected and seen the item/s bought, and hereby accept its current condition. I understand that the item is pre-owned and the item shall solely be my responsibility upon receipt. The Bag Hub shall not be held liable for any damage/issue that shall subsequently occur from receipt of the item.",
  "I hereby declare that the check(s) I have issued are fully funded and that I am legally obligated to fulfill all financial responsibilities associated with the terms and conditions agreed upon by me and The Bag Hub.",
  "By signing this contract, the client acknowledges and agrees to all terms and conditions outlined on the back page of this Acknowledgement Receipt, as set forth by The Bag Hub.",
];

const TABLE_ROW_COUNT = 10;

function escapeHtml(raw: unknown): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function displayValue(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s || s === "—") return "";
  return escapeHtml(s);
}

function formatContractDate(raw: string | null | undefined): string {
  if (raw == null || raw.trim() === "") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return escapeHtml(raw);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return escapeHtml(
    new Date(y, mo - 1, d).toLocaleDateString(undefined, {
      dateStyle: "medium",
    }),
  );
}

function formatIsoContractDate(raw: string | null | undefined): string {
  if (raw == null || raw.trim() === "") return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return escapeHtml(
    parsed.toLocaleDateString(undefined, { dateStyle: "medium" }),
  );
}

function sourceOfSalesLabel(pickupOption: string | null): string {
  if (!pickupOption) return "";
  return pickupOptionLabel(pickupOption);
}

function collectPaymentModes(detail: OrderSalesContractDetail): string {
  const modes = new Set<string>();
  for (const payment of detail.payments) {
    if (
      payment.modeOfPayment &&
      isOrderPaymentConfirmedStatus(payment.status)
    ) {
      modes.add(payment.modeOfPayment.trim());
    }
  }
  for (const installment of detail.installments) {
    if (
      installment.modeOfPayment &&
      installment.status.trim().toLowerCase() === "paid"
    ) {
      modes.add(installment.modeOfPayment.trim());
    }
  }
  if (modes.size > 0) return [...modes].join(", ");
  return paymentTypeLabel(detail.paymentType);
}

function buildPaymentSchedule(detail: OrderSalesContractDetail): string {
  if (
    isInstallmentPaymentType(detail.paymentType) &&
    detail.installments.length > 0
  ) {
    return detail.installments
      .map((row) => {
        const due = formatContractDate(row.dueDate);
        const amount = formatPhpDisplay(row.scheduledAmount);
        return due
          ? `${row.installmentLabel} — ${due} — ${amount}`
          : `${row.installmentLabel} — ${amount}`;
      })
      .join("\n");
  }

  const confirmedPayments = detail.payments.filter((row) =>
    isOrderPaymentConfirmedStatus(row.status),
  );
  if (confirmedPayments.length === 0) {
    return isInstallmentPaymentType(detail.paymentType)
      ? paymentTypeLabel(detail.paymentType)
      : "Full payment";
  }
  if (confirmedPayments.length === 1) {
    const date = formatContractDate(confirmedPayments[0].paymentDate);
    return date ? `Full payment — ${date}` : "Full payment";
  }
  return confirmedPayments
    .map((row, index) => {
      const date = formatContractDate(row.paymentDate);
      const amount = formatPhpDisplay(row.amountPaid);
      return date
        ? `Payment ${index + 1} — ${date} — ${amount}`
        : `Payment ${index + 1} — ${amount}`;
    })
    .join("\n");
}

function lineAmount(detail: OrderSalesContractDetail): string {
  if (isInstallmentPaymentType(detail.paymentType)) {
    return formatPhpDisplay(detail.layawayPrice ?? detail.orderTotalPrice);
  }
  return formatPhpDisplay(detail.orderTotalPrice);
}

function isSoldInventoryStatus(status: string | null | undefined): boolean {
  const key = status?.trim().toLowerCase() ?? "";
  return key === "sold final" || key === "sold under warranty";
}

export function canPrintOrderSalesContract(
  status: string,
  inventoryStatus?: string | null,
): boolean {
  if (isForPickupOrderStatus(status) || isItemReceivedOrderStatus(status)) {
    return true;
  }
  return isSoldInventoryStatus(inventoryStatus);
}

const PRINT_STYLES = `
    @page { size: letter; margin: 0.5in; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Times New Roman", Times, serif;
      color: #111827;
      background: #e5e7eb;
      line-height: 1.35;
      font-size: 11px;
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
      padding: 0.45in 0.55in;
      background: #fff;
      color: #111827;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 12px 28px rgba(15,23,42,0.18);
    }
    .letterhead {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 10px;
    }
    .brand-name {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 0.02em;
      line-height: 1;
    }
    .brand-contact {
      margin-top: 2px;
      font-size: 11px;
    }
    .doc-title {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      text-align: right;
      line-height: 1.25;
    }
    .meta-block {
      margin-top: 8px;
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
      border-bottom: 1px solid #111827;
      text-align: left;
      padding: 0 2px 1px;
    }
    .sold-block {
      margin: 8px 0 10px;
    }
    .sold-row {
      display: flex;
      gap: 8px;
      margin-top: 4px;
      font-size: 11px;
    }
    .sold-label {
      flex: 0 0 auto;
      font-weight: 700;
      white-space: nowrap;
    }
    .sold-value {
      flex: 1 1 auto;
      border-bottom: 1px solid #111827;
      min-height: 1.1rem;
      padding: 0 2px 1px;
    }
    table.items {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10px;
    }
    table.items th,
    table.items td {
      border: 1px solid #111827;
      padding: 4px 5px;
      vertical-align: top;
    }
    table.items th {
      font-weight: 700;
      text-align: center;
    }
    table.items td.num {
      width: 8%;
      text-align: center;
    }
    table.items td.desc { width: 42%; }
    table.items td.schedule { width: 30%; white-space: pre-wrap; }
    table.items td.amount {
      width: 20%;
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .detail-grid {
      margin-top: 8px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 6px 12px;
      font-size: 10px;
    }
    .detail-item {
      display: flex;
      gap: 4px;
      align-items: baseline;
      min-width: 0;
    }
    .detail-item.wide {
      grid-column: span 2;
    }
    .detail-label {
      flex: 0 0 auto;
      font-weight: 700;
      white-space: nowrap;
    }
    .detail-value {
      flex: 1 1 auto;
      border-bottom: 1px solid #111827;
      min-height: 1rem;
      padding: 0 2px 1px;
      overflow-wrap: anywhere;
    }
    .acknowledgement {
      margin-top: 10px;
      font-size: 9.5px;
      line-height: 1.4;
      text-align: justify;
    }
    .acknowledgement p {
      margin: 0 0 6px;
    }
    .acknowledgement p:last-child {
      margin-bottom: 0;
    }
    .signatures {
      margin-top: 14px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px 24px;
      font-size: 10px;
      align-items: start;
    }
    .sig-right-col {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .sig-block {
      min-width: 0;
    }
    .sig-label {
      font-weight: 700;
      margin-bottom: 18px;
    }
    .sig-line {
      border-bottom: 1px solid #111827;
      min-height: 1rem;
      padding-bottom: 2px;
    }
    .sig-caption {
      margin-top: 2px;
      font-size: 9px;
      color: #374151;
    }
    .signature {
      display: block;
      max-height: 36px;
      max-width: 180px;
      margin-bottom: 2px;
      object-fit: contain;
    }
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

function metaRow(label: string, value: string): string {
  return `<div class="meta-row"><span class="meta-label">${escapeHtml(label)}</span><span class="meta-value">${value || "&nbsp;"}</span></div>`;
}

function soldRow(label: string, value: string): string {
  return `<div class="sold-row"><span class="sold-label">${escapeHtml(label)}</span><span class="sold-value">${value || "&nbsp;"}</span></div>`;
}

function detailItem(
  label: string,
  value: string,
  wide = false,
): string {
  return `<div class="detail-item${wide ? " wide" : ""}"><span class="detail-label">${escapeHtml(label)}</span><span class="detail-value">${value || "&nbsp;"}</span></div>`;
}

function buildItemTableRows(detail: OrderSalesContractDetail): string {
  const schedule = escapeHtml(buildPaymentSchedule(detail));
  const amount = escapeHtml(lineAmount(detail));
  const description = displayValue(
    `${detail.inventoryItem.itemLabel}${detail.inventoryItem.sku ? ` (${detail.inventoryItem.sku})` : ""}`,
  );

  const rows: string[] = [
    `<tr>
      <td class="num">1</td>
      <td class="desc">${description || "&nbsp;"}</td>
      <td class="schedule">${schedule || "&nbsp;"}</td>
      <td class="amount">${amount || "&nbsp;"}</td>
    </tr>`,
  ];

  for (let i = 2; i <= TABLE_ROW_COUNT; i += 1) {
    rows.push(
      `<tr>
        <td class="num">${i}</td>
        <td class="desc">&nbsp;</td>
        <td class="schedule">&nbsp;</td>
        <td class="amount">&nbsp;</td>
      </tr>`,
    );
  }

  return rows.join("");
}

function buildSignatureBlock(
  label: string,
  name: string,
  signatureUrl: string | null,
): string {
  const signature = signatureUrl
    ? `<img class="signature" src="${escapeHtml(signatureUrl)}" alt="${escapeHtml(label)} signature" />`
    : "";
  return `<div class="sig-block">
    <div class="sig-label">${escapeHtml(label)}:</div>
    ${signature}
    <div class="sig-line">${displayValue(name) || "&nbsp;"}</div>
    <div class="sig-caption">Print name &amp; signature</div>
  </div>`;
}

export function buildOrderSalesContractHtml(
  detail: OrderSalesContractDetail,
): string {
  const documentDate =
    formatIsoContractDate(detail.documentDate) ||
    formatContractDate(detail.documentDate);
  const paymentMethod = escapeHtml(collectPaymentModes(detail));
  const total = escapeHtml(formatPhpDisplay(detail.orderTotalPrice));
  const sourceOfSales = escapeHtml(sourceOfSalesLabel(detail.pickupOption));
  const customerStatus = displayValue(detail.status);
  const acknowledgementHtml = ACKNOWLEDGEMENT_PARAGRAPHS.map(
    (paragraph) => `<p>${escapeHtml(paragraph)}</p>`,
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Acknowledgement Receipt &amp; Sales Contract — Order #${escapeHtml(detail.orderNumber)}</title>
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
          <div class="brand-contact">www.thebaghub.com</div>
          <div class="brand-contact">thebaghub10@gmail.com</div>
        </div>
        <div class="meta-block">
          <h1 class="doc-title">ACKNOWLEDGEMENT RECEIPT<br />&amp; SALES CONTRACT</h1>
          ${metaRow("Document No.", displayValue(detail.orderNumber))}
          ${metaRow("Date", documentDate)}
          ${metaRow("Contact No.", displayValue(detail.customer.contactNumber))}
        </div>
      </div>

      <div class="sold-block">
        ${soldRow("Sold To", displayValue(detail.customer.name))}
        ${soldRow("Address", displayValue(detail.customer.completeAddress))}
      </div>

      <table class="items">
        <thead>
          <tr>
            <th>Item No.</th>
            <th>Item Description</th>
            <th>Payment Schedule</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>${buildItemTableRows(detail)}</tbody>
      </table>

      <div class="detail-grid">
        ${detailItem("Payment Method", paymentMethod)}
        ${detailItem("Bank", "")}
        ${detailItem("TOTAL", total)}
        ${detailItem("Condition of the Item", "")}
        ${detailItem("Reference No.", "")}
        ${detailItem("Check No./Nos.", "")}
        ${detailItem("Source of Sales", sourceOfSales, true)}
        ${detailItem("Customer Status", customerStatus)}
      </div>

      <div class="acknowledgement">${acknowledgementHtml}</div>

      <div class="signatures">
        ${buildSignatureBlock("Received By", detail.customer.name, detail.signatureUrl)}
        <div class="sig-right-col">
          ${buildSignatureBlock("Seller", detail.assignedToName ?? "", null)}
          ${buildSignatureBlock("Released By", "", null)}
        </div>
      </div>
    </main>
  </div>
</body>
</html>`;
}

export async function openOrderSalesContractPrintTab(
  detail: OrderSalesContractDetail,
): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error(
      "Could not open print tab. Allow pop-ups for this site and try again.",
    );
  }
  printWindow.document.write(
    `<!DOCTYPE html><html><head><title>Loading receipt…</title></head><body><p style="font:14px system-ui">Loading receipt…</p></body></html>`,
  );
  printWindow.document.close();

  const html = buildOrderSalesContractHtml(detail);
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
