import { serveFile } from "https://deno.land/std@0.214.0/http/file_server.ts";
import { serve } from "https://deno.land/std@0.214.0/http/server.ts";
import { db } from "./database.ts";
import { createToken, verifyToken } from "./auth.ts";

const sockets = new Set<WebSocket>();

async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(request);
    sockets.add(socket);
    socket.onclose = () => sockets.delete(socket);
    return response;
  }
  if (url.pathname === "/api/greet") {
    const body = JSON.stringify({ message: "Hello from Deno!" });
    return new Response(body, {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname === "/api/login" && request.method === "POST") {
    const { username, password } = await request.json();
    const row = [...db.query(
      "SELECT id, password, role, color FROM users WHERE username = ?",
      [username],
    )][0];
    if (!row) {
      return new Response("invalid", { status: 401 });
    }
    const [id, hash, role] = [row[0], row[1], row[2]];
    const bcrypt = await import("https://deno.land/x/bcrypt/mod.ts");
    const ok = await bcrypt.compare(password, hash);
    if (!ok) return new Response("invalid", { status: 401 });
    const token = await createToken({ id, username, role });
    return new Response(JSON.stringify({ token, role }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname === "/api/users" && request.method === "GET") {
    const auth = request.headers.get("authorization");
    if (!auth) return new Response("unauthorized", { status: 401 });
    const session = await verifyToken(auth.replace("Bearer ", ""));
    if (!session || session.role !== "root") {
      return new Response("forbidden", { status: 403 });
    }
    const users = [...db.query("SELECT id, username, role, color FROM users")].map(
      ([id, user, role, color]) => ({ id, username: user, role, color }),
    );
    return new Response(JSON.stringify(users), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname === "/api/equipment") {
    const equipment = [...db.query(
      "SELECT id, name, room, drawer_code FROM stock_equipment",
    )].map(([id, name, room, drawer_code]) => ({
      id,
      name,
      room,
      drawer_code,
    }));
    return new Response(JSON.stringify(equipment), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname === "/api/cards") {
    const includeItems = url.searchParams.get("items") === "1";
    const cards = [...db.query(
      "SELECT id, class, card_text FROM prep_lab_cards",
    )].map(([id, cls, cardText]) => ({
      id,
      class: cls,
      card_text: cardText,
    }));

    if (includeItems) {
      for (const card of cards) {
        card.items = [...db.query(
          `SELECT se.id, se.name, se.room, se.drawer_code
           FROM card_equipment ce
           JOIN stock_equipment se ON ce.equipment_id = se.id
           WHERE ce.card_id = ?`,
          [card.id],
        )].map(([id, name, room, drawer]) => ({
          id,
          name,
          room,
          drawer_code: drawer,
        }));
        card.tasks = [...db.query(
          `SELECT ct.id, ct.description, ct.is_checked, ct.checked_by, ct.checked_at, u.username, u.color
             FROM card_tasks ct
             LEFT JOIN users u ON ct.checked_by = u.id
             WHERE ct.card_id = ?`,
          [card.id],
        )].map(([tid, desc, checked, by, at, user, color]) => ({
          id: tid,
          description: desc,
          is_checked: !!checked,
          checked_by: by,
          checked_at: at,
          username: user,
          color,
        }));
      }
    }

    return new Response(JSON.stringify(cards), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname === "/api/tasks/check" && request.method === "POST") {
    const auth = request.headers.get("authorization");
    if (!auth) return new Response("unauthorized", { status: 401 });
    const token = auth.replace("Bearer ", "");
    const session = await verifyToken(token);
    if (!session) return new Response("unauthorized", { status: 401 });

    const { taskId, checked } = await request.json();
    db.query(
      `UPDATE card_tasks SET is_checked = ?, checked_by = ?, checked_at = datetime('now') WHERE id = ?`,
      [checked ? 1 : 0, session.id, taskId],
    );
    const uRow = [...db.query("SELECT color FROM users WHERE id = ?", [session.id])][0];
    const color = uRow ? uRow[0] : null;
    const payload = { taskId, checked, user: session.username, color };
    for (const s of sockets) {
      try { s.send(JSON.stringify(payload)); } catch (_) {}
    }
    return new Response("ok");
  }

  if (url.pathname === "/api/reset-semester" && request.method === "POST") {
    const auth = request.headers.get("authorization");
    if (!auth) return new Response("unauthorized", { status: 401 });
    const token = auth.replace("Bearer ", "");
    const session = await verifyToken(token);
    if (!session || session.role !== "root") {
      return new Response("forbidden", { status: 403 });
    }
    db.query("UPDATE card_tasks SET is_checked = 0, checked_by = NULL, checked_at = NULL");
    for (const s of sockets) {
      try { s.send(JSON.stringify({ type: "reset" })); } catch (_) {}
    }
    return new Response("ok");
  }

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
  // ignore if env access not allowed
}

console.log(`Server running on http://localhost:${PORT}`);
try {
  await serve(handler, { addr: `:${PORT}` });
} catch (err) {
  if (err instanceof Deno.errors.AddrInUse) {
    console.error(`Port ${PORT} already in use.`);
  } else {
    throw err;
  }
}
