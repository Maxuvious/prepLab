import { db, safeQuery } from "../database.ts";
import { withAuth, withBody, withRoot } from "../utils.ts";

interface TaskBody {
  taskId: number;
  checked: boolean;
}

// Validator for task body
const validateTaskBody = (body: any): TaskBody => {
  const { taskId, checked } = body;
  if (!Number.isInteger(taskId) || taskId <= 0) throw new Error("Invalid taskId");
  if (typeof checked !== "boolean") throw new Error("Invalid checked value");
  return { taskId, checked };
};

// POST /api/tasks/check
export const postTaskCheck = withAuth(withBody(
  validateTaskBody,
  async (_req, { taskId, checked }, session) => {
    safeQuery(
      `UPDATE card_tasks SET is_checked = ?, checked_by = ?, checked_at = datetime('now') WHERE id = ?`,
      [checked ? 1 : 0, session.id, taskId],
      "Task check update failed"
    );
    const uRow = [...safeQuery("SELECT color FROM users WHERE id = ?", [session.id])][0];
    const color = uRow ? uRow[0] as string : null;
    const payload = { taskId, checked, user: session.username, color };
    // Broadcast to sockets
    if (globalThis.sockets) {
      for (const s of globalThis.sockets) {
        try { s.send(JSON.stringify(payload)); } catch (_) {}
      }
    }
    return new Response("ok");
  }
));

// POST /api/reset-semester
export const postResetSemester = withRoot(async (_req) => {
  safeQuery("UPDATE card_tasks SET is_checked = 0, checked_by = NULL, checked_at = NULL", [], "Semester reset failed");
  // Broadcast reset
  if (globalThis.sockets) {
    for (const s of globalThis.sockets) {
      try { s.send(JSON.stringify({ type: "reset" })); } catch (_) {}
    }
  }
  return new Response("ok");
});
