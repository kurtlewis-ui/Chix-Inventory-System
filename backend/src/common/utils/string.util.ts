/**
 * Generate a slug from a string (lowercase, hyphenated).
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

/**
 * Generate a sequential document number with a prefix and date.
 * Example: generateDocumentNumber('SALE', 1) => 'SALE-20260611-0001'
 */
export function generateDocumentNumber(prefix: string, sequence: number): string {
  const date = new Date();
  const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}${String(date.getDate()).padStart(2, '0')}`;
  const seqPart = String(sequence).padStart(4, '0');
  return `${prefix}-${datePart}-${seqPart}`;
}

/**
 * Mask an email address for logging (e.g., jo***@example.com).
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}
