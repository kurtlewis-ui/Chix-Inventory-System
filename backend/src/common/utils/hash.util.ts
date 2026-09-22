import * as bcrypt from 'bcrypt';

const DEFAULT_ROUNDS = 12;

/**
 * Hash a plain text value (e.g., password) using bcrypt.
 */
export async function hashValue(
  value: string,
  rounds: number = DEFAULT_ROUNDS,
): Promise<string> {
  return bcrypt.hash(value, rounds);
}

/**
 * Compare a plain text value against a bcrypt hash.
 */
export async function compareHash(
  value: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(value, hash);
}
