import { db, safeQuery } from "../database.ts";
import { withAuth, withBody, withRoot } from "../utils.ts";

interface ChangeRequestBody {
  card_id: number;
  class: string;
  card_text: string;
}

interface ApproveRejectBody {
  requestId: number;
}

// Validator for change request body
const validateChangeRequestBody = (body: any): ChangeRequestBody => {
  const { card_id, class: cls, card_text } = body;
  if (!Number.isInteger(card_id) || card_id <= 0) throw new Error("Invalid card_id");
  if (!cls || typeof cls !== "string" || cls.trim() === "") throw new Error("Invalid class");
  if (!card_text || typeof card_text !== "string" || card_text.trim() === "") throw new Error("Invalid card_text");
  return { card_id, class: cls.trim(), card_text: card_text.trim() };
};

const validateApproveRejectBody = (body: any): ApproveRejectBody => {
  const { requestId } = body;
  if (!Number.isInteger(requestId) || requestId <= 0) throw new Error("Invalid requestId");
  return { requestId };
};

// POST /api/change-requests
export const postChangeRequests = withAuth(withBody(
  validateChangeRequestBody,
  async (_req, { card_id, class: cls, card_text }, session) => {
    const existing = [...safeQuery("SELECT id FROM prep_lab_cards WHERE id = ?", [card_id])];
    if (existing.length === 0) {
      return new Response(JSON.stringify({ error: "Card not found" }), { status: 404 });
    }
    safeQuery(
      "INSERT INTO change_requests (card_id, user_id, class, card_text) VALUES (?, ?, ?, ?)",
      [card_id, session.id, cls, card_text],
      "Change request creation failed"
    );
    return new Response("ok");
  }
));

// GET /api/change-requests
export const getChangeRequests = withRoot(async (_req) => {
  const requests = [...safeQuery(
    `SELECT cr.id, cr.card_id, cr.class, cr.card_text, u.username
     FROM change_requests cr
     JOIN users u ON cr.user_id = u.id`
  )].map(([id, card_id, cls, card_text, username]) => ({
    id: id as number,
    card_id: card_id as number,
    class: cls as string,
    card_text: card_text as string,
    username: username as string
  }));
  return new Response(JSON.stringify(requests), { headers: { "Content-Type": "application/json" } });
});

// POST /api/change-requests/approve
export const postApproveChangeRequests = withRoot(withBody(
  validateApproveRejectBody,
  async (_req, { requestId }) => {
    const req = [...safeQuery(
      "SELECT card_id, class, card_text FROM change_requests WHERE id = ?",
      [requestId]
    )][0];
    if (!req) return new Response(JSON.stringify({ error: "Request not found" }), { status: 404 });
    const [card_id, cls, card_text] = req;
    safeQuery(
      "UPDATE prep_lab_cards SET class = ?, card_text = ? WHERE id = ?",
      [cls, card_text, card_id],
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
