import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await derive(password, salt, 64)).toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const [, salt, hash] = encoded.split('$');
  return timingSafeEqual(await derive(password, salt, 64), Buffer.from(hash, 'hex'));
}
