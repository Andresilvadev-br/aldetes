import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';

// OWASP-recommended Argon2id parameters (m=19MiB, t=2, p=1)
const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (pw: string) => argon2.hash(pw, ARGON_OPTS);
export const verifyPassword = async (hash: string, pw: string) => {
  try {
    return await argon2.verify(hash, pw);
  } catch {
    return false;
  }
};
export const needsRehash = (hash: string) => argon2.needsRehash(hash, ARGON_OPTS);

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

const INVITE_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function inviteCode(len = 8): string {
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += INVITE_ALPHABET[bytes[i]! % INVITE_ALPHABET.length];
  return s;
}
