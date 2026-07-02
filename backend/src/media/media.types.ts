export type MediaKeyUrl = { key: string; url: string };

export type MediaKeyUrlPosition = {
  key: string;
  url: string;
  position: number | null;
};

export type UploadFileInput = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size?: number;
};

export type InquiryMediaAuditSnapshot = {
  imageCount: number;
  offerSignaturePresent: boolean;
};
