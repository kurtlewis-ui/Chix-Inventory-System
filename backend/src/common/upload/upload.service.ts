import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

/**
 * Uploads images to Cloudinary and returns a hosted URL, so the database only
 * stores a short URL instead of a large base64 data-URL (keeps Postgres small).
 *
 * Behaviour is deliberately forgiving so the app works with OR without
 * Cloudinary configured:
 *   - A `data:` URL and Cloudinary is configured  -> upload, return the https URL.
 *   - A `data:` URL and Cloudinary is NOT configured -> return the data URL
 *     unchanged (falls back to the old inline-base64 behaviour; nothing breaks
 *     before you add the env vars on Render).
 *   - An existing http(s) URL -> returned unchanged (re-saving a product that
 *     already has a Cloudinary image does NOT re-upload it).
 *   - null / '' / undefined -> returned as-is.
 *
 * Configure via env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
 * CLOUDINARY_API_SECRET.
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly configured: boolean;

  constructor(private readonly config: ConfigService) {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');

    this.configured = Boolean(cloudName && apiKey && apiSecret);
    if (this.configured) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    } else {
      this.logger.warn(
        'Cloudinary is not configured (CLOUDINARY_* env vars missing). ' +
          'Images will be stored inline (base64) until it is configured.',
      );
    }
  }

  /** True only when all three Cloudinary env vars are present. */
  isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Convert an incoming image value into what should be stored in the DB.
   * @param value  a data: URL, an existing http(s) URL, or null/''/undefined
   * @param folder Cloudinary folder to organise uploads (e.g. 'products')
   * @returns the hosted URL (or the original value when not uploadable)
   */
  async uploadDataUrl(
    value: string | null | undefined,
    folder = 'chx',
  ): Promise<string | null | undefined> {
    // Nothing to do for empty values — preserve null vs '' vs undefined so the
    // caller's existing "clear the image" logic keeps working.
    if (value === null || value === undefined || value === '') return value;

    // Already a hosted URL — never re-upload.
    if (/^https?:\/\//i.test(value)) return value;

    // Only data: URLs are uploadable. Anything else is passed through untouched.
    if (!value.startsWith('data:')) return value;

    // Not configured -> keep the old inline-base64 behaviour.
    if (!this.configured) return value;

    try {
      const result = await cloudinary.uploader.upload(value, {
        folder,
        resource_type: 'image',
        // Images are already cropped + shrunk client-side (~<=256px WebP), so we
        // don't re-transform here; just store as-is.
        overwrite: false,
      });
      return result.secure_url;
    } catch (err) {
      // If the upload fails, fall back to storing the data URL so the user's
      // save still succeeds — we never want an image hiccup to block a sale/
      // product edit. The failure is logged for visibility.
      this.logger.error(
        `Cloudinary upload failed; storing image inline as fallback. ${(err as Error)?.message ?? err}`,
      );
      return value;
    }
  }
}
