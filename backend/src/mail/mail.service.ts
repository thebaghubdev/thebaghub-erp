import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  /** True when SMTP env is present; otherwise client signup skips verification email. */
  isConfigured(): boolean {
    const host = this.config.get<string>('MAIL_HOST', '')?.trim();
    const user = this.config.get<string>('MAIL_USER', '')?.trim();
    return Boolean(host && user);
  }

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }
    const host = this.config.get<string>('MAIL_HOST', '')?.trim();
    const port = Number(this.config.get<string>('MAIL_PORT', '587'));
    const user = this.config.get<string>('MAIL_USER', '')?.trim();
    const passRaw = this.config.get<string>('MAIL_PASSWORD', '') ?? '';
    const pass = passRaw.replace(/\s+/g, '');
    if (!host || !user) {
      throw new Error('Mail is not configured (MAIL_HOST / MAIL_USER).');
    }
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    return this.transporter;
  }

  async sendClientEmailVerification(params: {
    to: string;
    firstName: string;
    verifyUrl: string;
  }): Promise<void> {
    const fromName =
      this.config.get<string>('MAIL_FROM_NAME', '')?.trim() || 'The Bag Hub';
    const fromAddr = this.config.get<string>('MAIL_FROM', '')?.trim();
    if (!fromAddr) {
      throw new Error('MAIL_FROM is not set.');
    }
    const from = `${fromName} <${fromAddr}>`;
    const subject = 'Verify your email — The Bag Hub';
    const text = `Hi ${params.firstName},

Please verify your email address by opening this link:
${params.verifyUrl}

If you did not create an account, you can ignore this message.`;

    const html = `<p>Hi ${escapeHtml(params.firstName)},</p>
<p>Please verify your email address by clicking the link below:</p>
<p><a href="${escapeHtml(params.verifyUrl)}">Verify my email</a></p>
<p style="color:#64748b;font-size:12px">If you did not create an account, you can ignore this message.</p>`;

    await this.getTransporter().sendMail({
      from,
      to: params.to,
      subject,
      text,
      html,
    });
    this.logger.log(`Sent verification email to ${params.to}`);
  }

  /**
   * Notifies the consignor that an offer exists; does not include offer details.
   * Uses the same SMTP config as verification mail.
   */
  async sendConsignorInquiryOfferAvailable(params: {
    to: string;
    firstName: string;
    viewOfferUrl: string;
  }): Promise<void> {
    const fromName =
      this.config.get<string>('MAIL_FROM_NAME', '')?.trim() || 'The Bag Hub';
    const fromAddr = this.config.get<string>('MAIL_FROM', '')?.trim();
    if (!fromAddr) {
      throw new Error('MAIL_FROM is not set.');
    }
    const from = `${fromName} <${fromAddr}>`;
    const subject = 'Your consignment inquiry has an offer — The Bag Hub';
    const text = `Hi ${params.firstName},

We have prepared an offer for your consignment inquiry.

Please sign in to your client account and open this link to review and confirm your offer:
${params.viewOfferUrl}

If you did not expect this message, you can ignore it or contact support.`;

    const html = `<p>Hi ${escapeHtml(params.firstName)},</p>
<p>We have prepared an offer for your consignment inquiry. Please sign in to review them.</p>
<p><a href="${escapeHtml(params.viewOfferUrl)}">View and confirm your offer</a></p>
<p style="color:#64748b;font-size:12px">If you did not expect this message, you can ignore it or contact support.</p>`;

    await this.getTransporter().sendMail({
      from,
      to: params.to,
      subject,
      text,
      html,
    });
    this.logger.log(`Sent inquiry offer notification to ${params.to}`);
  }

  /**
   * Consignor must confirm / complete steps after a reauthentication request (3rd party auth).
   */
  async sendConsignorThirdPartyAuthNotice(params: {
    to: string;
    firstName: string;
    /** e.g. "Gucci Marmont" from inquiry snapshot; may be a short fallback. */
    itemBrandAndModel: string;
    viewInquiryUrl: string;
  }): Promise<void> {
    const fromName =
      this.config.get<string>('MAIL_FROM_NAME', '')?.trim() || 'The Bag Hub';
    const fromAddr = this.config.get<string>('MAIL_FROM', '')?.trim();
    if (!fromAddr) {
      throw new Error('MAIL_FROM is not set.');
    }
    const from = `${fromName} <${fromAddr}>`;
    const subject =
      'Action Required: Confirm Reauthentication Request - The Bag Hub';
    const itemWords = params.itemBrandAndModel.trim();
    const itemPhrasePlain = itemWords ? ` *${itemWords}*` : '';
    const itemPhraseHtml = itemWords
      ? ` <strong>${escapeHtml(itemWords)}</strong>`
      : '';
    const text = `Hi ${params.firstName},

We are asking that your consignment item${itemPhrasePlain} complete third-party authentication as the next step. Use the link below to read the details and confirm.

${params.viewInquiryUrl}`;

    const html = `<p>Hi ${escapeHtml(params.firstName)},</p>
<p>We are asking that your consignment item${itemPhraseHtml} complete third-party authentication as the next step. Use the link below to read the details and confirm.</p>
<p><a href="${escapeHtml(params.viewInquiryUrl)}">View consignment inquiry</a></p>
<p style="color:#64748b;font-size:12px">If you did not expect this message, contact support.</p>`;

    await this.getTransporter().sendMail({
      from,
      to: params.to,
      subject,
      text,
      html,
    });
    this.logger.log(`Sent reauthentication request notice to ${params.to}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
