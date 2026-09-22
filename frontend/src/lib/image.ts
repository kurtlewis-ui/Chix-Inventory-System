// Read an image File and return a downscaled data URL so photos stay small
// enough to store directly in the database (no external file storage).
//
// Goals:
// - Accept any input image size/dimensions.
// - Never crop: the aspect ratio is always preserved (the image is only scaled
//   down to fit within `maxSize`, never up).
// - Always compress the result to stay within `maxBytes`, lowering quality and,
//   if needed, dimensions, so the upload never fails because it is too large.

/** Approximate the decoded byte size of a data URL from its base64 payload. */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

/** True if this browser can encode WebP from a canvas (much smaller files). */
function canEncodeWebp(): boolean {
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

export function fileToResizedDataUrl(
  file: File,
  maxSize = 512,
  quality = 0.85,
  maxBytes = 700_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load the image.'));
      img.onload = () => {
        try {
          const srcW = img.naturalWidth || img.width;
          const srcH = img.naturalHeight || img.height;
          if (!srcW || !srcH) {
            reject(new Error('Could not load the image.'));
            return;
          }

          // Keep transparency for PNG/WebP/GIF sources; otherwise use JPEG.
          const supportsAlpha = /image\/(png|webp|gif)/.test(file.type);

          // Render the (possibly downscaled) image to a canvas at `targetMax`,
          // preserving aspect ratio. Returns a data URL.
          const render = (targetMax: number, q: number, forceJpeg: boolean): string => {
            // Only downscale, never upscale, and never crop.
            const scale = Math.min(1, targetMax / Math.max(srcW, srcH));
            const w = Math.max(1, Math.round(srcW * scale));
            const h = Math.max(1, Math.round(srcH * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('unsupported');
            const useJpeg = forceJpeg || !supportsAlpha;
            if (useJpeg) {
              // Flatten transparency onto white so it doesn't turn black.
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, w, h);
            }
            ctx.drawImage(img, 0, 0, w, h);
            return canvas.toDataURL(useJpeg ? 'image/jpeg' : 'image/png', q);
          };

          let curMax = Math.min(Math.max(srcW, srcH), maxSize);
          let q = quality;
          let forceJpeg = false;
          let best = render(curMax, q, forceJpeg);

          // If a transparent PNG is over budget, re-encode as JPEG for size.
          if (!forceJpeg && supportsAlpha && dataUrlBytes(best) > maxBytes) {
            forceJpeg = true;
            best = render(curMax, q, forceJpeg);
          }

          let attempts = 0;
          while (dataUrlBytes(best) > maxBytes && attempts < 12) {
            if (q > 0.5) {
              q = Math.max(0.5, q - 0.12);
            } else {
              curMax = Math.max(64, Math.round(curMax * 0.82));
            }
            forceJpeg = forceJpeg || !supportsAlpha;
            best = render(curMax, q, forceJpeg);
            attempts++;
          }

          resolve(best);
        } catch {
          reject(new Error('Image processing is not supported in this browser.'));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Square crop → tiny thumbnail. Used by the image cropper UI: the user frames
// a square region of their photo, and we render ONLY that square, downscaled
// to a small size and encoded as WebP (falling back to JPEG) so the stored
// image stays tiny — important because images live inline in the DB (@db.Text)
// and we want to keep Neon storage small. A 256px WebP thumbnail is typically
// well under ~100KB, roughly 9x smaller than the old 512px/700KB output.
// ---------------------------------------------------------------------------

export interface CropRect {
  /** Source-pixel coordinates of the square crop region. */
  x: number;
  y: number;
  size: number;
}

/**
 * Crop a square out of an already-loaded image element and return a small
 * data URL. `outSize` is the output square edge in px (default 256).
 * When `circle` is true, the output is masked to a circle (transparent
 * corners) — used for profile pictures — and encoded as WebP/PNG to keep
 * that transparency.
 */
export function cropImageToDataUrl(
  img: HTMLImageElement,
  crop: CropRect,
  outSize = 256,
  maxBytes = 100_000,
  circle = false,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image cropping is not supported in this browser.');

  const webp = canEncodeWebp();

  ctx.imageSmoothingQuality = 'high';

  if (circle) {
    // Keep transparent corners: clip to a circle, then draw (no white fill).
    ctx.save();
    ctx.beginPath();
    ctx.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, outSize, outSize);
    ctx.restore();
  } else {
    // Flatten onto white first so any transparency doesn't become black in JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outSize, outSize);
    ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, outSize, outSize);
  }

  // A circle needs an alpha-capable format; WebP supports alpha, PNG is the
  // fallback. Square thumbnails prefer WebP, then JPEG.
  const mime = webp ? 'image/webp' : circle ? 'image/png' : 'image/jpeg';
  let q = 0.82;
  let out = canvas.toDataURL(mime, q);

  // Nudge quality down until under the byte cap (thumbnails only need to be
  // small and crisp, not archival quality).
  let attempts = 0;
  while (dataUrlBytes(out) > maxBytes && q > 0.4 && attempts < 8) {
    q -= 0.1;
    out = canvas.toDataURL(mime, q);
    attempts++;
  }
  return out;
}

/** Load a File into an HTMLImageElement (for the cropper). */
export function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load the image.'));
      img.onload = () => resolve(img);
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
