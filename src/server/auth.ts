import { randomBytes, randomUUID } from 'node:crypto';
import type { Request } from 'express';

export function createParticipantId(): string {
  return randomUUID();
}

export function createToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokenFromRequest(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token;
}
