import { randomUUID } from 'node:crypto';
import type { UploadFileInput } from '../media/media.types';

export const DIRECT_PURCHASE_PAYMENT_CHECK_NUMBER_MAX_LENGTH = 64;
export const DIRECT_PURCHASE_PAYMENT_PHOTO_MAX_COUNT = 20;
export const DIRECT_PURCHASE_PAYMENT_PHOTO_MAX_BYTES = 25 * 1024 * 1024;

export const ALLOWED_DIRECT_PURCHASE_PAYMENT_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

export function extFromDirectPurchasePaymentImageMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m === 'image/jpeg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/heic' || m === 'image/heif') return 'heic';
  return 'bin';
}

export function checkPhotoStorageKey(
  paymentId: string,
  file: UploadFileInput,
): string {
  const mime = file.mimetype?.toLowerCase() ?? '';
  return `direct-purchase-payments/${paymentId}/check/${randomUUID()}.${extFromDirectPurchasePaymentImageMime(mime)}`;
}

export function depositSlipStorageKey(
  paymentId: string,
  file: UploadFileInput,
): string {
  const mime = file.mimetype?.toLowerCase() ?? '';
  return `direct-purchase-payments/${paymentId}/deposit-slip/${randomUUID()}.${extFromDirectPurchasePaymentImageMime(mime)}`;
}

export function unableToSendPhotoStorageKey(
  paymentId: string,
  file: UploadFileInput,
): string {
  const mime = file.mimetype?.toLowerCase() ?? '';
  return `direct-purchase-payments/${paymentId}/unable-to-send/${randomUUID()}.${extFromDirectPurchasePaymentImageMime(mime)}`;
}

export function parseRetainedPhotoKeys(raw: string | undefined): string[] {
  if (raw == null || raw.trim() === '') return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (key): key is string => typeof key === 'string' && key.trim() !== '',
    );
  } catch {
    return [];
  }
}
