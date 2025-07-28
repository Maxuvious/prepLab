import { create, getNumericDate, verify } from "https://deno.land/x/djwt/mod.ts";


let JWT_SECRET = "verysecret";
try {
  const secret = Deno.env.get("JWT_SECRET");
  if (secret) JWT_SECRET = secret;
} catch (_) {
  // ignore if env access is not allowed
}

export interface Session {
  id: number;
  username: string;
  role: string;
}

export async function createToken(session: Session): Promise<string> {
  return await create({ alg: "HS256", typ: "JWT" }, {
    id: session.id,
    username: session.username,
    role: session.role,
    exp: getNumericDate(60 * 60 * 8),
  }, JWT_SECRET);
}

export async function verifyToken(token: string): Promise<Session | null> {
  try {
    const payload = await verify(token, JWT_SECRET, "HS256");
    return payload as Session;
  } catch {
    return null;
  }
}
