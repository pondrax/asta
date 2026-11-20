import { SignJWT } from 'jose';

const email = process.argv[2] || 'pondra@mojokertokota.go.id';
const baseUrl = (process.argv[3] || process.env.AUTH_BASE_URL || 'http://localhost:7173').replace(/\/$/, '');
const secret = process.env.APP_SECRET;

if (!secret) {
  console.error('APP_SECRET is not set');
  process.exit(1);
}

const token = await new SignJWT({ email })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('7d')
  .sign(new TextEncoder().encode(secret));

console.log(`${baseUrl}/auth/auto-login?token=${encodeURIComponent(token)}`);
