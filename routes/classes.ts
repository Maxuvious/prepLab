import { safeQuery } from "../database.ts";
import { withBody, withRoot } from "../utils.ts";
interface ClassBody {
  id?: number;
  name: string;
  color: string;
}
// Validator for class body
const validateClassBody = (body: any, isPut = false): ClassBody => {
  const { id, name, color } = body;
  if (isPut) {
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid or missing id");
  }
  if (name !== undefined && (typeof name !== "string" || name.trim() === "")) throw new Error("Invalid name");
  if (color !== undefined && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Invalid color format");
  if (!isPut) {
    if (name === undefined) throw new Error("Name is required");
    if (color === undefined) throw new Error("Color is required");
  }
  return {
    id,
    name: name !== undefined ? name.trim() : undefined,
    color
  };
};
// GET /api/classes
export const getClasses = async (_req: Request) => {
  const classes = [...safeQuery("SELECT id, name, color FROM classes")].map(
    ([id, name, color]) => ({ id: id as number, name: name as string, color: color as string }),
  );
  return new Response(JSON.stringify(classes), { headers: { "Content-Type": "application/json" } });
};
// POST /api/classes
export const postClasses = withRoot(withBody(
  (body) => validateClassBody(body),
  async (_req, { name, color }) => {
    try {
      safeQuery(
        "INSERT INTO classes (name, color) VALUES (?, ?)",
        [name, color],
        "Class creation failed"
      );
      return new Response("ok");
    } catch (err) {
      if (err.message.includes("UNIQUE constraint")) {
        return new Response(JSON.stringify({ error: "Class name already exists" }), { status: 400 });
      }
      throw err;
    }
  }
));
// PUT /api/classes
export const putClasses = withRoot(withBody(
  (body) => validateClassBody(body, true),
  async (_req, { id, name, color }) => {
    try {
      const existing = [...safeQuery("SELECT id FROM classes WHERE id = ?", [id])];
      if (existing.length === 0) {
        return new Response(JSON.stringify({ error: "Class not found" }), { status: 404 });
      }
      const updates: string[] = [];
      const params: (string | number)[] = [];
      if (name !== undefined) {
        updates.push("name = ?");
        params.push(name);
      }
      if (color !== undefined) {
        updates.push("color = ?");
        params.push(color);
      }
      if (updates.length === 0) {
        return new Response(JSON.stringify({ error: "No changes provided" }), { status: 400 });
      }
      params.push(id!);
      safeQuery(`UPDATE classes SET ${updates.join(", ")} WHERE id = ?`, params, "Class update failed");
      return new Response("ok");
    } catch (err) {
      if (err.message.includes("UNIQUE constraint")) {
        return new Response(JSON.stringify({ error: "Class name already exists" }), { status: 400 });
      }
      throw err;
    }
  }
));
