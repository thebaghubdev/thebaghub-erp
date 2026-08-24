import { randomUUID } from 'node:crypto';
import type { UploadFileInput } from '../media/media.types';

export const TASK_ATTACHMENT_MAX_COUNT = 20;
export const TASK_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const FILE_MIMES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const MIME_FROM_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const EXT_FROM_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
};

function extFromFilename(filename: string | undefined): string {
  const name = filename?.trim().toLowerCase() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1);
}

export function resolveTaskAttachmentMime(file: UploadFileInput): string {
  const raw = file.mimetype?.toLowerCase().trim() ?? '';
  if (IMAGE_MIMES.has(raw) || FILE_MIMES.has(raw)) {
    return raw === 'image/jpg' ? 'image/jpeg' : raw;
  }
  const fromExt = MIME_FROM_EXT[extFromFilename(file.originalname)];
  if (fromExt) return fromExt;
  return raw;
}

export function isAllowedTaskAttachmentMime(mime: string): boolean {
  const normalized = mime === 'image/jpg' ? 'image/jpeg' : mime;
  return IMAGE_MIMES.has(normalized) || FILE_MIMES.has(normalized);
}

export function storedTaskAttachmentMime(mime: string): string {
  return mime.length <= 64 ? mime : 'application/octet-stream';
}

export function extFromTaskAttachmentMime(
  mime: string,
  originalname?: string,
): string {
  const fromMime = EXT_FROM_MIME[mime.toLowerCase()];
  if (fromMime) return fromMime;
  const fromName = extFromFilename(originalname);
  if (fromName) return fromName.replace(/[^a-z0-9]/g, '') || 'bin';
  return 'bin';
}

export function assertTaskAttachmentFiles(files: UploadFileInput[]): void {
  if (files.length > TASK_ATTACHMENT_MAX_COUNT) {
    throw new Error(
      `At most ${TASK_ATTACHMENT_MAX_COUNT} attachments are allowed`,
    );
  }
  for (const file of files) {
    const mime = resolveTaskAttachmentMime(file);
    if (!isAllowedTaskAttachmentMime(mime)) {
      throw new Error(
        `Unsupported file type: ${file.originalname || file.mimetype || 'unknown'}`,
      );
    }
  }
}

export function toTaskAttachmentUpload(file: UploadFileInput): UploadFileInput {
  const mime = storedTaskAttachmentMime(resolveTaskAttachmentMime(file));
  return {
    buffer: file.buffer,
    mimetype: mime,
    originalname: file.originalname,
    size: file.size,
  };
}

export function taskAttachmentStorageKey(
  taskId: string,
  file: UploadFileInput,
): string {
  const mime = resolveTaskAttachmentMime(file);
  return `tasks/${taskId}/attachments/${randomUUID()}.${extFromTaskAttachmentMime(mime, file.originalname)}`;
}

export function parseRetainedAttachmentKeys(raw: string | undefined): string[] {
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
