import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

/**
 * Generate a numeric code with leading zeros allowed.
 * Default length = 6.
 */
export function generateNumericCode(length = 6): string {
  const max = 10 ** length;
  const n = Math.floor(Math.random() * max);
  return String(n).padStart(length, '0');
}

/**
 * Sign a pickup token using JWT.
 *
 * Important: do NOT include "exp" (or iat/nbf) in the payload object.
 * We pass ttlSeconds to jwt.sign via options.expiresIn so jsonwebtoken
 * is responsible for setting exp.
 *
 * Returns the signed token string.
 */
export function signPickupToken(payload: Record<string, any>, secret: string, ttlSeconds = 60 * 30): string {
  if (!secret) throw new Error('Missing secret to sign pickup token');

  // Build a minimal payload and ensure no exp/iat/nbf exist
  const minimal: Record<string, any> = {
    order_id: payload.order_id,
    code: payload.code,
  };

  // Defensive: strip any accidental JWT claims (if caller passed them)
  delete minimal.exp;
  delete minimal.iat;
  delete minimal.nbf;
  delete minimal.aud;
  delete minimal.iss;
  delete minimal.sub;

  // sign using expiresIn option
  return jwt.sign(minimal, secret, { algorithm: 'HS256', expiresIn: ttlSeconds });
}

/**
 * Verify pickup token and return decoded payload or null on failure.
 * Uses HS256 by default.
 */
export function verifyPickupToken(token: string, secret: string): any | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * Optional HMAC token helpers (alternate approach).
 */
export function signHmacToken(obj: any, secret: string): string {
  const payload = Buffer.from(JSON.stringify(obj)).toString('base64');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyHmacToken(token: string, secret: string): any | null {
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const payload = parts[0];
  const sig = parts[1];
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch (e) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
}
