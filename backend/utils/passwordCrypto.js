import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scryptCb);
const SCRYPT_PREFIX = 'scrypt$';
const KEY_LEN = 64;

export function isPasswordHashed(stored) {
  return typeof stored === 'string' && stored.startsWith(SCRYPT_PREFIX);
}

/**
 * Hashes a plaintext password with a 16-byte CSPRNG salt using Node's native crypto.scrypt.
 */
export async function hashPassword(plainPassword) {
  const clean = String(plainPassword ?? '');
  if (!clean) {
    throw new Error('Password cannot be empty');
  }
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(clean, salt, KEY_LEN);
  return `${SCRYPT_PREFIX}${salt}$${Buffer.from(derived).toString('hex')}`;
}

/**
 * Constant-time password verification supporting both `scrypt$<salt>$<hash>` and legacy
 * unmigrated plaintext records (returning `needsUpgrade: true` so login transparently upgrades).
 */
export async function verifyPassword(inputPassword, storedPasswordHash) {
  const input = String(inputPassword ?? '');
  const stored = String(storedPasswordHash ?? '');

  if (!input || !stored) {
    return { match: false, needsUpgrade: false };
  }

  if (isPasswordHashed(stored)) {
    const parts = stored.split('$');
    if (parts.length !== 3) {
      return { match: false, needsUpgrade: false };
    }
    const [, salt, expectedHex] = parts;
    try {
      const expectedBuf = Buffer.from(expectedHex, 'hex');
      const actualBuf = Buffer.from(await scryptAsync(input, salt, expectedBuf.length));
      if (actualBuf.length !== expectedBuf.length) {
        return { match: false, needsUpgrade: false };
      }
      return {
        match: timingSafeEqual(actualBuf, expectedBuf),
        needsUpgrade: false,
      };
    } catch {
      return { match: false, needsUpgrade: false };
    }
  }

  // Constant-time SHA-256 comparison for legacy plaintext records before transparent upgrade
  const a = createHash('sha256').update(input, 'utf8').digest();
  const b = createHash('sha256').update(stored, 'utf8').digest();
  const matched = timingSafeEqual(a, b);
  return {
    match: matched,
    needsUpgrade: matched,
  };
}

