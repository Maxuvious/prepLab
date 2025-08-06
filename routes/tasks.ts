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
    let sql = "UPDATE card_tasks SET is_checked = ?, checked_by = ?, checked_at = ? WHERE id = ?";
    let params = [checked ? 1 : 0, checked ? session.id : null, checked ? "datetime('now')" : null, taskId];
    safeQuery(sql, params, "Task check update failed");
    const [[changes]] = safeQuery("SELECT changes()");
    if (changes === 0) {
      return new Response(JSON.stringify({ error: "Task not found" }), { status: 404 });
    }
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
