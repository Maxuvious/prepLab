import { safeQuery } from "../database.ts";
import { withBody, withRoot } from "../utils.ts";
interface EventBody {
  id?: number;
  title: string;
  date: string; // YYYY-MM-DD
  description?: string;
}
// Validator for event body
const validateEventBody = (body: any, isPut = false): EventBody => {
  const { id, title, date, description } = body;
  if (isPut) {
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid or missing id");
  }
  if (!title || typeof title !== "string" || title.trim() === "") throw new Error("Invalid title");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date format (YYYY-MM-DD)");
  if (description !== undefined && typeof description !== "string") throw new Error("Invalid description");
  return { id, title: title.trim(), date, description: description?.trim() };
};
// GET /api/events
export const getEvents = async (_req: Request) => {
  const events = [...safeQuery("SELECT id, title, date, description FROM events")].map(
    ([id, title, date, description]) => ({ id: id as number, title: title as string, date: date as string, description: description as string }),
  );
  return new Response(JSON.stringify(events), { headers: { "Content-Type": "application/json" } });
};
// POST /api/events
export const postEvents = withRoot(withBody(
  (body) => validateEventBody(body),
  async (_req, { title, date, description }) => {
    safeQuery(
      "INSERT INTO events (title, date, description) VALUES (?, ?, ?)",
      [title, date, description || null],
      "Event creation failed"
    );
    return new Response("ok");
  }
));
// PUT /api/events
export const putEvents = withRoot(withBody(
  (body) => validateEventBody(body, true),
  async (_req, { id, title, date, description }) => {
    const existing = [...safeQuery("SELECT id FROM events WHERE id = ?", [id])];
    if (existing.length === 0) {
      return new Response(JSON.stringify({ error: "Event not found" }), { status: 404 });
    }
    safeQuery(
      "UPDATE events SET title = ?, date = ?, description = ? WHERE id = ?",
      [title, date, description || null, id],
      "Event update failed"
    );
    return new Response("ok");
  }
));
