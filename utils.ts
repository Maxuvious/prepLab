// utils.ts - Reusable wrappers for auth, root access, and body validation

import { verify } from "djwt";
import { JWT_KEY } from "./server.ts"; // Assume JWT_KEY is exported from server.ts

interface Session {
  id: number;
  username: string;
  role: string;
}

export function withAuth(fn: (req: Request, session: Session) => Promise<Response>) {
  return async (req: Request) => {
    const auth = req.headers.get("authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const token = auth.replace("Bearer ", "");
    const session = await verify(token, JWT_KEY).catch(() => null);
    if (!session) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    return fn(req, session as Session);
  };
}

export function withRoot(fn: (req: Request, session: Session) => Promise<Response>) {
  return withAuth(async (req, session) => {
    if (session.role !== "root") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    return fn(req, session);
  });
}

export function withBody<T>(validator: (body: any) => T, fn: (req: Request, body: T, session?: Session) => Promise<Response>) {
  return async (req: Request, session?: Session) => {
    try {
      const body = await req.json();
      const validated = validator(body);
      return fn(req, validated, session);
    } catch (err) {
      return new Response(JSON.stringify({ error: `Invalid body: ${err.message}` }), { status: 400 });
    }
  };
}
