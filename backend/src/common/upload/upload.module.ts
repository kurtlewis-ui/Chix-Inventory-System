import { Global, Module } from '@nestjs/common';
import { UploadService } from './upload.service';

/**
 * Global so any feature service (products, brands, users, auth) can inject
 * UploadService without importing this module. ConfigModule is already global,
 * so UploadService can read the CLOUDINARY_* env vars directly.
 */
@Global()
@Module({
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
