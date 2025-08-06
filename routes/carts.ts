import { safeQuery } from "../database.ts";
import { withBody, withRoot } from "../utils.ts";
interface CartBody {
  id?: number;
  name: string;
  capacity: number;
  current_usage?: number;
}
// Validator for cart body
const validateCartBody = (body: any, isPut = false): CartBody => {
  const { id, name, capacity, current_usage } = body;
  if (isPut) {
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid or missing id");
  }
  if (name !== undefined && (typeof name !== "string" || name.trim() === "")) throw new Error("Invalid name");
  if (capacity !== undefined && (!Number.isInteger(capacity) || capacity <= 0)) throw new Error("Invalid capacity");
  if (current_usage !== undefined && (!Number.isInteger(current_usage) || current_usage < 0)) throw new Error("Invalid current_usage");
  if (!isPut) {
    if (name === undefined) throw new Error("Name is required");
    if (capacity === undefined) throw new Error("Capacity is required");
  }
  return { id, name: name?.trim(), capacity, current_usage };
};
// GET /api/carts
export const getCarts = async (_req: Request) => {
  const carts = [...safeQuery("SELECT id, name, capacity, current_usage FROM carts")].map(
    ([id, name, capacity, current_usage]) => ({ id: id as number, name: name as string, capacity: capacity as number, current_usage: current_usage as number }),
  );
  return new Response(JSON.stringify(carts), { headers: { "Content-Type": "application/json" } });
};
// POST /api/carts
export const postCarts = withRoot(withBody(
  (body) => validateCartBody(body),
  async (_req, { name, capacity, current_usage }) => {
    safeQuery(
      "INSERT INTO carts (name, capacity, current_usage) VALUES (?, ?, ?)",
      [name, capacity, current_usage || 0],
      "Cart creation failed"
    );
    return new Response("ok");
  }
));
// PUT /api/carts
export const putCarts = withRoot(withBody(
  (body) => validateCartBody(body, true),
  async (_req, { id, name, capacity, current_usage }) => {
    const existing = [...safeQuery("SELECT id FROM carts WHERE id = ?", [id])];
    if (existing.length === 0) {
      return new Response(JSON.stringify({ error: "Cart not found" }), { status: 404 });
    }
    const updates: string[] = [];
    const params: (string | number)[] = [];
    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name);
    }
    if (capacity !== undefined) {
      updates.push("capacity = ?");
      params.push(capacity);
    }
    if (current_usage !== undefined) {
      updates.push("current_usage = ?");
      params.push(current_usage);
    }
    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: "No changes provided" }), { status: 400 });
    }
    params.push(id!);
    safeQuery(`UPDATE carts SET ${updates.join(", ")} WHERE id = ?`, params, "Cart update failed");
    return new Response("ok");
  }
));
