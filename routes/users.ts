import { db, safeQuery } from "../database.ts";
import { hashSync } from "bcrypt";
import { withBody, withRoot } from "../utils.ts";

interface UserBody {
  id?: number;
  username?: string;
  password?: string;
  role?: string;
  color?: string;
}

// Validator for user body
const validateUserBody = (body: any, isPut = false): UserBody => {
  const { id, username, password, role, color } = body;
  if (isPut) {
    if (id === undefined || !Number.isInteger(id) || id <= 0) throw new Error("Invalid or missing id");
  }
  if (username !== undefined && (typeof username !== "string" || username.trim() === "")) throw new Error("Invalid username");
  if (password !== undefined && typeof password !== "string") throw new Error("Invalid password");
  if (role !== undefined && !['user', 'root'].includes(role)) throw new Error("Invalid role");
  if (color !== undefined && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Invalid color format");
  if (!isPut) {
    if (username === undefined) throw new Error("Username is required");
    if (password === undefined) throw new Error("Password is required");
    if (role === undefined) throw new Error("Role is required");
    if (color === undefined) throw new Error("Color is required");
  }
  return {
    id,
    username: username !== undefined ? username.trim() : undefined,
    password,
    role,
    color
  };
};

// GET /api/users
export const getUsers = withRoot(async (_req) => {
  const users = [...safeQuery("SELECT id, username, role, color FROM users")].map(
    ([id, username, role, color]) => ({ id: id as number, username: username as string, role: role as string, color: color as string }),
  );
  return new Response(JSON.stringify(users), { headers: { "Content-Type": "application/json" } });
});

// POST /api/users
export const postUsers = withRoot(withBody(
  (body) => validateUserBody(body),
  async (_req, { username, password, role, color }) => {
    // Edge case: password required for create
    if (!password) throw new Error("Password is required for new user");
    try {
      const hashedPassword = hashSync(password);
      safeQuery(
        "INSERT INTO users (username, password, role, color) VALUES (?, ?, ?, ?)",
        [username, hashedPassword, role, color],
        "User creation failed"
      );
      return new Response("ok");
    } catch (err) {
      if (err.message.includes("UNIQUE constraint")) {
        return new Response(JSON.stringify({ error: "Username already exists" }), { status: 400 });
      }
      throw err; // Rethrow for 500
    }
  }
));

// PUT /api/users
// PUT /api/users
export const putUsers = withRoot(withBody(
  (body) => validateUserBody(body, true),
  async (_req, { id, username, password, role, color }) => {
    try {
      const existing = [...safeQuery("SELECT id FROM users WHERE id = ?", [id])];
      if (existing.length === 0) {
        return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
      }
      const updates: string[] = [];
      const params: (string | number)[] = [];
      if (username !== undefined) {
        updates.push("username = ?");
        params.push(username);
      }
      if (password !== undefined) {
        updates.push("password = ?");
        params.push(hashSync(password));
      }
      if (role !== undefined) {
        updates.push("role = ?");
        params.push(role);
      }
      if (color !== undefined) {
        updates.push("color = ?");
        params.push(color);
      }
      if (updates.length === 0) {
        return new Response(JSON.stringify({ error: "No changes provided" }), { status: 400 });
      }
      params.push(id!);
      safeQuery(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params, "User update failed");
      return new Response("ok");
    } catch (err) {
      if (err.message.includes("UNIQUE constraint")) {
        return new Response(JSON.stringify({ error: "Username already exists" }), { status: 400 });
      }
      throw err;
    }
  }
));
