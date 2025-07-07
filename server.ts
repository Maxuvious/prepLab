import { serveFile } from "https://deno.land/std@0.214.0/http/file_server.ts";
import { serve } from "https://deno.land/std@0.214.0/http/server.ts";
import { db } from "./database.ts";

async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/greet") {
    const body = JSON.stringify({ message: "Hello from Deno!" });
    return new Response(body, {
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
      }
    }

    return new Response(JSON.stringify(cards), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  try {
    return await serveFile(request, `public${filePath}`);
  } catch (_e) {
    return new Response("Not Found", { status: 404 });
  }
}

console.log("Server running on http://localhost:8000");
await serve(handler, { addr: ":8000" });
