import "server-only";

import argon2 from "argon2";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { pool } from "../db/pool";

export const COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-nomi_session"
    : "nomi_session";

export const SESSION_SECONDS = 7 * 24 * 60 * 60;

const secret = process.env.JWT_SECRET;

if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
  throw new Error("JWT_SECRET must contain at least 32 bytes");
}

const jwtKey = new TextEncoder().encode(secret);

export interface AuthUser {
  id: number;
  name: string;
  email: string;
}

interface SessionPayload extends JWTPayload {
  sub: string;
  sid: string;
}

export async function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function createSession(userId: number) {
  const sessionId = randomUUID();

  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);

  await pool.query(
    `INSERT INTO user_sessions
       (id, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [sessionId, userId, expiresAt],
  );

  const token = await new SignJWT({
    sid: sessionId,
  })
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
    })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .setIssuer("nomi")
    .setAudience("nomi-web")
    .sign(jwtKey);

  return token;
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtKey, {
      algorithms: ["HS256"],
      issuer: "nomi",
      audience: "nomi-web",
    });

    if (!payload.sub || typeof payload.sid !== "string") {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return null;

  const payload = await verifySessionToken(token);

  if (!payload) return null;

  const userId = Number(payload.sub);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return null;
  }

  const result = await pool.query<AuthUser & { session_id: string }>(
    `SELECT
       u.id,
       u.name,
       u.email,
       s.id AS session_id
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1
       AND s.user_id = $2
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
     LIMIT 1`,
    [payload.sid, userId],
  );

  if (result.rowCount === 0) return null;

  const row = result.rows[0];

  return {
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
    },
    sessionId: row.session_id,
  };
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}
