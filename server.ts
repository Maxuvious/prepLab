import { serveFile } from "std/http/file_server.ts";
import { serve } from "std/http/server.ts";
import { create, verify } from "djwt";
import { getCards, postCards, putCards } from "./routes/cards.ts";
import { getChangeRequests, postChangeRequests, postApproveChangeRequests, postRejectChangeRequests } from "./routes/change_requests.ts";
import { postTaskCheck, postResetSemester } from "./routes/tasks.ts";
import { getEquipment } from "./routes/equipment.ts";
import { postLogin } from "./routes/login.ts";
import { getUsers, postUsers, putUsers } from "./routes/users.ts";

export const JWT_KEY = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-512" }, true, ["sign", "verify"]);

export async function createToken(payload: object) {
  return await create({ alg: "HS512", typ: "JWT" }, payload, JWT_KEY);
}

const isDev = Deno.env.get("DEV") === "true";

const sockets = new Set<WebSocket>();
globalThis.sockets = sockets; // Make available to routes for broadcasting

async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // WebSocket for real-time updates
  if (url.pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(request);
    sockets.add(socket);
    socket.onclose = () => sockets.delete(socket);
    return response;
  }

  // Simple greet endpoint
  if (url.pathname === "/api/greet") {
    return new Response(JSON.stringify({ message: "Hello from Deno!" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Authentication endpoints
  if (url.pathname === "/api/login" && request.method === "POST") {
    return postLogin(request);
  }

  // User management (root only)
  if (url.pathname === "/api/users") {
    if (request.method === "GET") return getUsers(request);
    if (request.method === "POST") return postUsers(request);
    if (request.method === "PUT") return putUsers(request);
    return new Response("Method not allowed", { status: 405 });
  }

  // Equipment list
  if (url.pathname === "/api/equipment" && request.method === "GET") {
    return getEquipment();
  }

  // Card management
  if (url.pathname === "/api/cards") {
    if (request.method === "GET") return getCards(request);
    if (request.method === "POST") return postCards(request);
    if (request.method === "PUT") return putCards(request);
    return new Response("Method not allowed", { status: 405 });
  }

  // Change requests
  if (url.pathname === "/api/change-requests") {
    if (request.method === "POST") return postChangeRequests(request);
    if (request.method === "GET") return getChangeRequests(request);
    return new Response("Method not allowed", { status: 405 });
  }
  if (url.pathname === "/api/change-requests/approve" && request.method === "POST") {
    return postApproveChangeRequests(request);
  }
  if (url.pathname === "/api/change-requests/reject" && request.method === "POST") {
    return postRejectChangeRequests(request);
  }

  // Task checking
  if (url.pathname === "/api/tasks/check" && request.method === "POST") {
    return postTaskCheck(request);
  }

  // Reset semester (root only)
  if (url.pathname === "/api/reset-semester" && request.method === "POST") {
    return postResetSemester(request);
  }

  // Static file serving
  const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  try {
    return await serveFile(request, `public${filePath}`);
  } catch (_e) {
    return new Response("Not Found", { status: 404 });
  }
}

let PORT = "8000";
try {
  const envPort = Deno.env.get("PORT");
  if (envPort) PORT = envPort;
} catch (_) {
  // Ignore if env access not allowed
}

console.log(`Server running on http://localhost:${PORT}`);
serve(handler, { port: parseInt(PORT) });
