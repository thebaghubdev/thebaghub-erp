import { randomUUID } from 'node:crypto';
import type { UploadFileInput } from '../media/media.types';

export const CONSIGNOR_PAYMENT_CHECK_NUMBER_MAX_LENGTH = 64;
export const CONSIGNOR_PAYMENT_CHECK_PHOTO_MAX_COUNT = 20;
export const CONSIGNOR_PAYMENT_CHECK_PHOTO_MAX_BYTES = 25 * 1024 * 1024;

export const ALLOWED_CONSIGNOR_PAYMENT_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

export function extFromConsignorPaymentImageMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m === 'image/jpeg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/heic' || m === 'image/heif') return 'heic';
  return 'bin';
}

export function assertConsignorPaymentImageFiles(files: UploadFileInput[]): void {
  for (const file of files) {
    const mime = file.mimetype?.toLowerCase() ?? '';
    if (!ALLOWED_CONSIGNOR_PAYMENT_IMAGE_MIMES.has(mime)) {
      throw new Error(`Unsupported image type: ${file.mimetype || 'unknown'}`);
    }
  }
}

export function checkPhotoStorageKey(
  groupId: string,
  file: UploadFileInput,
): string {
  const mime = file.mimetype?.toLowerCase() ?? '';
  return `consignor-payments/groups/${groupId}/check/${randomUUID()}.${extFromConsignorPaymentImageMime(mime)}`;
}

export function depositSlipStorageKey(
  groupId: string,
  file: UploadFileInput,
): string {
  const mime = file.mimetype?.toLowerCase() ?? '';
  return `consignor-payments/groups/${groupId}/deposit-slip/${randomUUID()}.${extFromConsignorPaymentImageMime(mime)}`;
}

export function parseRetainedCheckPhotoKeys(raw: string | undefined): string[] {
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
