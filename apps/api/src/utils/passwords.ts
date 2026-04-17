import argon2 from 'argon2';

const ARGON2_PARAMS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

// Minimal common-passwords list. In production, bundle top-10k.
const COMMON_PASSWORDS = new Set<string>([
  'password123456',
  'qwertyuiop1234',
  'letmein12345678',
  '123456789012',
  'adminadmin1234',
  'welcome12345678',
  'iloveyouyou1234',
  'changemechangeme',
]);

export function checkPasswordPolicy(password: string): void {
  if (password.length < 12) throw new Error('Password must be at least 12 characters.');
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new Error('Password is too common.');
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_PARAMS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, ARGON2_PARAMS);
}
