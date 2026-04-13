import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>('AWS_S3_BUCKET_NAME');
    this.region = this.config.getOrThrow<string>('AWS_REGION');
    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  /** Public object URL (requires bucket/policy to allow read if used in browser). */
  getPublicUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }
}
