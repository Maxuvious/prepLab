import { db, safeQuery } from "../database.ts";
import { withBody, withRoot } from "../utils.ts";
interface CardBody {
  id?: number;
  class_id: number;
  card_text: string;
}
// Validator for card body
const validateCardBody = (body: any, isPut = false): CardBody => {
  const { id, class_id, card_text } = body;
  if (isPut) {
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid or missing id");
  }
  if (!Number.isInteger(class_id) || class_id <= 0) throw new Error("Invalid class_id");
  if (!card_text || typeof card_text !== "string" || card_text.trim() === "") throw new Error("Invalid card_text");
  return { id, class_id, card_text: card_text.trim() };
};
// GET /api/cards
export const getCards = async (req: Request) => {
  const url = new URL(req.url);
  const includeItems = url.searchParams.get("items") === "1";
  const classId = parseInt(url.searchParams.get("class_id") || "0");
  let where = "";
  const params: any[] = [];
  if (classId > 0) {
    where = "WHERE plc.class_id = ?";
    params.push(classId);
  }
  const cards = [...safeQuery(
    `SELECT plc.id, cl.name AS class, cl.color AS class_color, plc.card_text
     FROM prep_lab_cards plc
     JOIN classes cl ON plc.class_id = cl.id
     ${where}`,
    params,
  )].map(([id, cls, clsColor, cardText]) => ({
    id: id as number,
    class: cls as string,
    class_color: clsColor as string,
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
  async (_req, { class_id, card_text }) => {
    // Check if class_id exists
    const classExists = [...safeQuery("SELECT id FROM classes WHERE id = ?", [class_id])].length > 0;
    if (!classExists) {
      return new Response(JSON.stringify({ error: "Class not found" }), { status: 400 });
    }
    safeQuery(
      "INSERT INTO prep_lab_cards (class_id, card_text) VALUES (?, ?)",
      [class_id, card_text],
      "Card creation failed"
    );
    // Broadcast reset if sockets defined
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
  async (_req, { id, class_id, card_text }) => {
    const existing = [...safeQuery("SELECT id FROM prep_lab_cards WHERE id = ?", [id])];
    if (existing.length === 0) {
      return new Response(JSON.stringify({ error: "Card not found" }), { status: 404 });
    }
    const classExists = [...safeQuery("SELECT id FROM classes WHERE id = ?", [class_id])].length > 0;
    if (!classExists) {
      return new Response(JSON.stringify({ error: "Class not found" }), { status: 400 });
    }
    safeQuery(
      "UPDATE prep_lab_cards SET class_id = ?, card_text = ? WHERE id = ?",
      [class_id, card_text, id],
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
