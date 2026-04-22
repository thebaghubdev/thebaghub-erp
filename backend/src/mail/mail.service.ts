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
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
