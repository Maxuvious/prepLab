import { db, safeQuery } from "../database.ts";
import { withBody, withRoot } from "../utils.ts";

interface CardBody {
  id?: number;
  class: string;
  card_text: string;
}

// Validator for card body
const validateCardBody = (body: any, isPut = false): CardBody => {
  const { id, class: cls, card_text } = body;
  if (isPut) {
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid or missing id");
  }
  if (!cls || typeof cls !== "string" || cls.trim() === "") throw new Error("Invalid class");
  if (!card_text || typeof card_text !== "string" || card_text.trim() === "") throw new Error("Invalid card_text");
  return { id, class: cls.trim(), card_text: card_text.trim() };
};

// GET /api/cards
export const getCards = async (req: Request) => {
  const url = new URL(req.url);
  const includeItems = url.searchParams.get("items") === "1";
  const cards = [...safeQuery(
    "SELECT id, class, card_text FROM prep_lab_cards",
  )].map(([id, cls, cardText]) => ({
    id: id as number,
    class: cls as string,
    card_text: cardText as string,
    items: includeItems ? [] : undefined,
    tasks: includeItems ? [] : undefined,
  }));

  if (includeItems) {
    for (const card of cards) {
      card.items = [...safeQuery(
        `SELECT se.id, se.name, se.room, se.drawer_code
         FROM card_equipment ce
         JOIN stock_equipment se ON ce.equipment_id = se.id
         WHERE ce.card_id = ?`,
        [card.id],
      )].map(([id, name, room, drawer]) => ({
        id: id as number,
        name: name as string,
        room: room as string,
        drawer_code: drawer as string,
      }));
      card.tasks = [...safeQuery(
        `SELECT ct.id, ct.description, ct.is_checked, ct.checked_by, ct.checked_at, u.username, u.color
           FROM card_tasks ct
           LEFT JOIN users u ON ct.checked_by = u.id
           WHERE ct.card_id = ?`,
        [card.id],
      )].map(([tid, desc, checked, by, at, user, color]) => ({
        id: tid as number,
        description: desc as string,
        is_checked: !!checked,
        checked_by: by as number | undefined,
        checked_at: at as string | undefined,
        username: user as string | undefined,
        color: color as string | undefined,
      }));
    }
  }

  return new Response(JSON.stringify(cards), { headers: { "Content-Type": "application/json" } });
};

// POST /api/cards
export const postCards = withRoot(withBody(
  (body) => validateCardBody(body),
  async (_req, { class: cls, card_text }) => {
    safeQuery(
      "INSERT INTO prep_lab_cards (class, card_text) VALUES (?, ?)",
      [cls, card_text],
      "Card creation failed"
    );
    // Broadcast reset if sockets defined (assume from server.ts)
    if (globalThis.sockets) {
      for (const s of globalThis.sockets) {
        try { s.send(JSON.stringify({ type: "reset" })); } catch (_) {}
      }
    }
    return new Response("ok");
  }
));

// PUT /api/cards
export const putCards = withRoot(withBody(
  (body) => validateCardBody(body, true),
  async (_req, { id, class: cls, card_text }) => {
    const existing = [...safeQuery("SELECT id FROM prep_lab_cards WHERE id = ?", [id])];
    if (existing.length === 0) {
      return new Response(JSON.stringify({ error: "Card not found" }), { status: 404 });
    }
    safeQuery(
      "UPDATE prep_lab_cards SET class = ?, card_text = ? WHERE id = ?",
      [cls, card_text, id],
      "Card update failed"
    );
    // Broadcast reset
    if (globalThis.sockets) {
      for (const s of globalThis.sockets) {
        try { s.send(JSON.stringify({ type: "reset" })); } catch (_) {}
      }
    }
    return new Response("ok");
  }
));
