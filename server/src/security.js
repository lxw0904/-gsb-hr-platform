import crypto from 'node:crypto';
import { config } from './config.js';

const SCRYPT_KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, storedValue) {
  if (!storedValue || typeof storedValue !== 'string') return false;
  const [algorithm, salt, expectedHex] = storedValue.split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  try {
    const actual = crypto.scryptSync(String(password), salt, SCRYPT_KEY_LENGTH);
    const expected = Buffer.from(expectedHex, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function encryptionKey() {
  return crypto.createHash('sha256').update(config.appSecret).digest();
}

export function encryptSensitive(value) {
  if (value === null || value === undefined || value === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1$${iv.toString('base64')}$${tag.toString('base64')}$${encrypted.toString('base64')}`;
}

export function decryptSensitive(value) {
  if (!value) return '';
  const [version, ivBase64, tagBase64, payloadBase64] = String(value).split('$');
  if (version !== 'v1' || !ivBase64 || !tagBase64 || !payloadBase64) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(payloadBase64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

export function maskIdCard(value) {
  if (!value) return '';
  const text = String(value);
  return text.length >= 10 ? `${text.slice(0, 6)}********${text.slice(-4)}` : '********';
}
