import { env } from '$env/dynamic/private';
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(env.APP_SECRET);

export async function createJWT(payload: Record<string, any>) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifyJWT(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload;
}
