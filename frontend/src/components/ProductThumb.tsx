// Small product thumbnail used in sale/disposal item tables (the cell after
// the row number, before the name). Mirrors the Products page: a rounded
// image, or a "No Img" placeholder when there's no image (e.g. the product
// was deleted or never had one). `size` is a Tailwind size pair.
export function ProductThumb({
  src,
  alt,
  size = 'w-9 h-9',
}: {
  src?: string | null;
  alt?: string;
  size?: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt ?? ''} loading="lazy" className={`${size} rounded object-cover bg-white/10`} />;
  }
  return (
    <div className={`${size} rounded bg-white/10 flex items-center justify-center text-[10px] text-text-muted shrink-0`}>
      No Img
    </div>
  );
}
