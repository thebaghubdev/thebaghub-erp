import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from './entities/media.entity';
import { MediaService } from './media.service';
import { S3StorageService } from './s3-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([Media])],
  providers: [MediaService, S3StorageService],
  exports: [MediaService, S3StorageService, TypeOrmModule],
})
export class MediaModule {}
