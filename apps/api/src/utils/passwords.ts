import argon2 from 'argon2';
import crypto from 'node:crypto';
import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import * as zxcvbnCommon from '@zxcvbn-ts/language-common';
import * as zxcvbnEn from '@zxcvbn-ts/language-en';

const ARGON2_PARAMS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

// Lazily-computed hash used to equalize login latency when the user does not
// exist. Without it, `if (!user) throw` returns in ~0ms while the success path
// spends ~100ms in argon2.verify, letting an attacker enumerate registered
// emails by timing. The dummy string itself is random and never matches any
// real password.
let dummyHashPromise: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash(
      '__dummy__' + crypto.randomBytes(16).toString('hex'),
      ARGON2_PARAMS,
    );
  }
  return dummyHashPromise;
}

// zxcvbn's dictionary-backed strength estimator catches common passwords,
// keyboard walks, and personalized patterns (e.g. email-prefix variants) that
// a short hardcoded list cannot. Loaded once at module init.
zxcvbnOptions.setOptions({
  translations: zxcvbnEn.translations,
  graphs: zxcvbnCommon.adjacencyGraphs,
  dictionary: { ...zxcvbnCommon.dictionary, ...zxcvbnEn.dictionary },
});

const MIN_ZXCVBN_SCORE = 3; // 0 too-guessable → 4 very-unguessable

export function checkPasswordPolicy(password: string, userInputs: string[] = []): void {
  if (password.length < 12) throw new Error('Password must be at least 12 characters.');
  const r = zxcvbn(password, userInputs);
  if (r.score < MIN_ZXCVBN_SCORE) {
    const hint = r.feedback.warning || r.feedback.suggestions[0] || 'Password is too weak.';
    throw new Error(`Password is too weak: ${hint}`);
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
