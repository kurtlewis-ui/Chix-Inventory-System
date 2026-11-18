import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';

/** Historical IDs retain identity across renames; missing IDs use saved labels. */
export function historicalProductIdentity(key: string): { id: string } | { name: string; brand: string } {
  if (isUUID(key)) return { id: key };
  if (key.startsWith('snapshot:')) {
    try {
      const labels = JSON.parse(key.slice(9));
      if (Array.isArray(labels) && labels.length === 2 && labels.every(v => typeof v === 'string')) {
        return { name: labels[0], brand: labels[1] };
      }
    } catch { /* Reject malformed keys below. */ }
  }
  throw new BadRequestException('Choose a valid exact product.');
}
