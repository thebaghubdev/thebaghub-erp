/** Multer file type (avoids relying on global Express namespace in strict builds). */
export type MulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};
