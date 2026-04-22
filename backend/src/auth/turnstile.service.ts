import { Injectable } from '@nestjs/common';

type SiteverifyResponse = {
  success: boolean;
  'error-codes'?: string[];
};

@Injectable()
export class TurnstileService {
  async verifyToken(
    responseToken: string,
    secretKey: string,
  ): Promise<boolean> {
    const body = new URLSearchParams({
      secret: secretKey,
      response: responseToken,
    });
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );
    if (!res.ok) {
      return false;
    }
    const data = (await res.json()) as SiteverifyResponse;
    return data.success === true;
  }
}
