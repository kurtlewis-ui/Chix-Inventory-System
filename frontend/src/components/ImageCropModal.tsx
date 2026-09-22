'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ZoomIn } from 'lucide-react';
import { cropImageToDataUrl, fileToImage, type CropRect } from '@/lib/image';

/**
 * Square image cropper. The user picks a file, then drags to reposition and
 * uses the zoom slider to frame a square region. On confirm we render just
 * that square as a small (256px, WebP) data URL to keep DB storage tiny.
 *
 * Usage:
 *   const [file, setFile] = useState<File | null>(null);
 *   {file && (
 *     <ImageCropModal
 *       file={file}
 *       onCancel={() => setFile(null)}
 *       onCropped={(dataUrl) => { setImage(dataUrl); setFile(null); }}
 *     />
 *   )}
 */
export function ImageCropModal({
  file,
  onCancel,
  onCropped,
  outSize = 256,
  title = 'Crop image',
  shape = 'square',
}: {
  file: File;
  onCancel: () => void;
  onCropped: (dataUrl: string) => void;
  outSize?: number;
  title?: string;
  /** 'circle' shows a round frame + outputs a circular (transparent-corner)
      image — used for profile pictures. 'square' for product/brand images. */
  shape?: 'square' | 'circle';
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Zoom (1 = whole image fits the square frame) and pan offset in frame px.
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const [frameSize, setFrameSize] = useState(288);

  // Load the picked file into an <img> we can draw from.
  useEffect(() => {
    let cancelled = false;
    fileToImage(file)
      .then((loaded) => { if (!cancelled) { setImg(loaded); setZoom(1); setOffset({ x: 0, y: 0 }); } })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'Could not load image.'); });
    return () => { cancelled = true; };
  }, [file]);

  // Measure the square frame so pan math matches what the user sees.
  useEffect(() => {
    const measure = () => {
      const w = frameRef.current?.clientWidth;
      if (w) setFrameSize(w);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [img]);

  // The image is scaled so its shorter side fills the frame at zoom=1 ("cover").
  const baseScale = img ? frameSize / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const scale = baseScale * zoom;
  const dispW = img ? img.naturalWidth * scale : 0;
  const dispH = img ? img.naturalHeight * scale : 0;

  // Clamp the pan so the image always covers the frame (no empty gaps).
  const clamp = useCallback(
    (ox: number, oy: number) => {
      const minX = frameSize - dispW;
      const minY = frameSize - dispH;
      return {
        x: Math.min(0, Math.max(minX, ox)),
        y: Math.min(0, Math.max(minY, oy)),
      };
    },
    [frameSize, dispW, dispH],
  );

  useEffect(() => {
    // Re-center / re-clamp whenever zoom changes.
    setOffset((o) => {
      const cx = (frameSize - dispW) / 2;
      const cy = (frameSize - dispH) / 2;
      // On first layout, center; otherwise keep within bounds.
      if (o.x === 0 && o.y === 0) return { x: cx, y: cy };
      return clamp(o.x, o.y);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, frameSize, img]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clamp(dragRef.current.ox + dx, dragRef.current.oy + dy));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function handleConfirm() {
    if (!img) return;
    try {
      // Map the frame (0..frameSize) back to source pixels.
      const srcX = -offset.x / scale;
      const srcY = -offset.y / scale;
      const srcSize = frameSize / scale;
      const crop: CropRect = {
        x: Math.max(0, srcX),
        y: Math.max(0, srcY),
        size: Math.min(srcSize, Math.min(img.naturalWidth, img.naturalHeight)),
      };
      const dataUrl = cropImageToDataUrl(img, crop, outSize, 100_000, shape === 'circle');
      onCropped(dataUrl);
    } catch (e: any) {
      setError(e?.message ?? 'Could not crop the image.');
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div className="glass relative w-full max-w-sm rounded-xl p-5 shadow-2xl shadow-black/40">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          <button onClick={onCancel} aria-label="Close" className="rounded-lg p-1 text-text-muted transition hover:text-text-primary">
            <X size={18} />
          </button>
        </div>

        {error ? (
          <p className="py-8 text-center text-sm text-accent-red">{error}</p>
        ) : (
          <>
            {/* Crop frame — round for profile photos, square otherwise */}
            <div
              ref={frameRef}
              className={`relative mx-auto aspect-square w-full max-w-[288px] cursor-grab touch-none overflow-hidden border border-white/10 bg-black/40 active:cursor-grabbing ${shape === 'circle' ? 'rounded-full' : 'rounded-xl'}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: dispW,
                    height: dispH,
                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                    maxWidth: 'none',
                    userSelect: 'none',
                  }}
                />
              )}
              {/* subtle framing guide */}
              <div className={`pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/20 ${shape === 'circle' ? 'rounded-full' : ''}`} />
            </div>

            {/* Zoom */}
            <div className="mt-4 flex items-center gap-3">
              <ZoomIn size={16} className="shrink-0 text-text-muted" />
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-btn-primary"
                aria-label="Zoom"
              />
            </div>
            <p className="mt-2 text-center text-xs text-text-muted">Drag to reposition · slide to zoom</p>

            <div className="mt-5 flex gap-3">
              <button
                onClick={onCancel}
                className="flex h-11 flex-1 items-center justify-center rounded-lg border border-input-border text-sm font-medium text-text-primary transition hover:opacity-80"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!img}
                className="flex h-11 flex-1 items-center justify-center rounded-lg bg-btn-primary text-sm font-semibold text-btn-primary-text transition hover:opacity-90 disabled:opacity-60"
              >
                Use photo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
