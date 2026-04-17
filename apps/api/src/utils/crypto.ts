import crypto from 'node:crypto';
import { getConfig } from '../config.js';

const IV_LEN = 12;
const TAG_LEN = 16;

function keyBuf(): Buffer {
  return Buffer.from(getConfig().TOTP_ENCRYPTION_KEY, 'base64');
}

export function encryptSecret(plain: string): Buffer {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]);
}

export function decryptSecret(stored: Buffer): string {
  if (stored.length < IV_LEN + TAG_LEN) throw new Error('ciphertext too short');
  const iv = stored.subarray(0, IV_LEN);
  const tag = stored.subarray(stored.length - TAG_LEN);
  const ct = stored.subarray(IV_LEN, stored.length - TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
