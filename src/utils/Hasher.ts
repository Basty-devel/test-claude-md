import { createHash } from 'crypto';

/**
 * Hasher provides deterministic content hashing using SHA-256.
 *
 * Contract:
 *  - hash(content: string): string — always returns a 64-character lowercase hex digest.
 *  - Deterministic: identical input always yields identical output across calls and processes.
 *  - Empty/whitespace-only input is hashed like any other string (no special-casing).
 */
export class Hasher {
  static hash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}