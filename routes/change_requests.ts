import { db, safeQuery } from "../database.ts";
import { withAuth, withBody, withRoot } from "../utils.ts";
interface ChangeRequestBody {
  card_id: number;
  new_class: string;
  new_card_text: string;
}
interface ApproveRejectBody {
  requestId: number;
}
// Validator for change request body
const validateChangeRequestBody = (body: any): ChangeRequestBody => {
  const { card_id, class: new_class, card_text: new_card_text } = body;
  if (!Number.isInteger(card_id) || card_id <= 0) throw new Error("Invalid card_id");
  if (!new_class || typeof new_class !== "string" || new_class.trim() === "") throw new Error("Invalid new_class");
  if (!new_card_text || typeof new_card_text !== "string" || new_card_text.trim() === "") throw new Error("Invalid new_card_text");
  return { card_id, new_class: new_class.trim(), new_card_text: new_card_text.trim() };
};
const validateApproveRejectBody = (body: any): ApproveRejectBody => {
  const { requestId } = body;
  if (!Number.isInteger(requestId) || requestId <= 0) throw new Error("Invalid requestId");
  return { requestId };
};
// POST /api/change-requests
export const postChangeRequests = withAuth(withBody(
  validateChangeRequestBody,
  async (_req, { card_id, new_class, new_card_text }, session) => {
    const existing = [...safeQuery("SELECT id FROM prep_lab_cards WHERE id = ?", [card_id])];
    if (existing.length === 0) {
      return new Response(JSON.stringify({ error: "Card not found" }), { status: 404 });
    }
    safeQuery(
      "INSERT INTO change_requests (card_id, user_id, new_class, new_card_text) VALUES (?, ?, ?, ?)",
      [card_id, session.id, new_class, new_card_text],
      "Change request creation failed"
    );
    return new Response("ok");
  }
));
// GET /api/change-requests
export const getChangeRequests = withRoot(async (_req) => {
  const requests = [...safeQuery(
    `SELECT cr.id, cr.card_id, cr.new_class, cr.new_card_text, u.username
     FROM change_requests cr
     JOIN users u ON cr.user_id = u.id`
  )].map(([id, card_id, new_class, new_card_text, username]) => ({
    id: id as number,
    card_id: card_id as number,
    new_class: new_class as string,
    new_card_text: new_card_text as string,
    username: username as string
  }));
  return new Response(JSON.stringify(requests), { headers: { "Content-Type": "application/json" } });
});
// POST /api/change-requests/approve
export const postApproveChangeRequests = withRoot(withBody(
  validateApproveRejectBody,
  async (_req, { requestId }) => {
    const reqRow = [...safeQuery(
      "SELECT card_id, new_class, new_card_text FROM change_requests WHERE id = ?",
      [requestId]
    )][0];
    if (!reqRow) return new Response(JSON.stringify({ error: "Request not found" }), { status: 404 });
    const [card_id, new_class, new_card_text] = reqRow;
    // Find or create class_id for new_class
    let classRow = [...safeQuery("SELECT id FROM classes WHERE name = ?", [new_class])][0];
    let classId: number;
    if (classRow) {
      classId = classRow[0] as number;
    } else {
      const insertRes = safeQuery(
        "INSERT INTO classes (name, color) VALUES (?, '#000000') RETURNING id",
        [new_class]
      )[0];
      classId = insertRes[0] as number;
    }
    safeQuery(
      "UPDATE prep_lab_cards SET class_id = ?, card_text = ? WHERE id = ?",
      [classId, new_card_text, card_id],
      "Change request approve failed"
    );
    safeQuery("DELETE FROM change_requests WHERE id = ?", [requestId]);
    // Broadcast reset
    if (globalThis.sockets) {
      for (const s of globalThis.sockets) {
        try { s.send(JSON.stringify({ type: "reset" })); } catch (_) {}
      }
    }
    return new Response("ok");
  }
));
// POST /api/change-requests/reject
export const postRejectChangeRequests = withRoot(withBody(
  validateApproveRejectBody,
  async (_req, { requestId }) => {
    safeQuery("DELETE FROM change_requests WHERE id = ?", [requestId], "Change request reject failed");
    return new Response("ok");
  }
));
