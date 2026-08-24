import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE_NAME = "stockpro_session";
const SESSION_DURATION_SECONDS = 8 * 60 * 60;
const MAX_TOKEN_LENGTH = 2048;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionPayload = {
  sub: string;
  iat: number;
  exp: number;
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || !secret.trim()) {
    throw new Error("SESSION_SECRET não configurado.");
  }

  return secret;
}

function sign(encodedPayload: string) {
  return createHmac("sha256", getSessionSecret())
    .update(encodedPayload, "utf8")
    .digest();
}

function encodeSession(payload: SessionPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const signature = sign(encodedPayload).toString("base64url");

  return `${encodedPayload}.${signature}`;
}

function hasOnlySessionFields(value: Record<string, unknown>) {
  const fields = Object.keys(value).sort();

  return (
    fields.length === 3 &&
    fields[0] === "exp" &&
    fields[1] === "iat" &&
    fields[2] === "sub"
  );
}

function decodeAndValidateSession(token: string): SessionPayload | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, encodedSignature] = parts;
  const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

  if (
    !base64UrlPattern.test(encodedPayload) ||
    !base64UrlPattern.test(encodedSignature)
  ) {
    return null;
  }

  let receivedSignature: Buffer;

  try {
    receivedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }

  const expectedSignature = sign(encodedPayload);

  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    return null;
  }

  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    );
  } catch {
    return null;
  }

  if (
    parsedPayload === null ||
    typeof parsedPayload !== "object" ||
    Array.isArray(parsedPayload)
  ) {
    return null;
  }

  const payload = parsedPayload as Record<string, unknown>;

  if (
    !hasOnlySessionFields(payload) ||
    typeof payload.sub !== "string" ||
    !UUID_PATTERN.test(payload.sub) ||
    typeof payload.iat !== "number" ||
    !Number.isSafeInteger(payload.iat) ||
    typeof payload.exp !== "number" ||
    !Number.isSafeInteger(payload.exp)
  ) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  if (
    payload.iat > now + 60 ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat !== SESSION_DURATION_SECONDS ||
    payload.exp <= now
  ) {
    return null;
  }

  return {
    sub: payload.sub,
    iat: payload.iat,
    exp: payload.exp,
  };
}

export async function createSession(profileId: string) {
  const normalizedProfileId = profileId.trim();

  if (!UUID_PATTERN.test(normalizedProfileId)) {
    throw new TypeError("profileId deve ser um UUID válido.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + SESSION_DURATION_SECONDS;
  const token = encodeSession({
    sub: normalizedProfileId,
    iat: issuedAt,
    exp: expiresAt,
  });
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
    expires: new Date(expiresAt * 1000),
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function getAuthenticatedProfile() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = decodeAndValidateSession(token);

  if (!session) {
    return null;
  }

  const profile = await prisma.profiles.findUnique({
    where: {
      id: session.sub,
    },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      name: true,
      document: true,
      phone: true,
      cep: true,
      city: true,
      street: true,
      number: true,
      no_number: true,
      neighborhood: true,
      access_code: true,
      seller_code: true,
      manager_code: true,
      responsible_seller_id: true,
      responsible_manager_id: true,
      created_by: true,
      permissions: true,
      approval_notes: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!profile || profile.status !== "approved") {
    return null;
  }

  return profile;
}
