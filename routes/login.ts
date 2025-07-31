import { safeQuery } from "../database.ts";
import { compareSync } from "bcrypt";
import { createToken } from "../server.ts"; // Assume exported from server.ts

interface LoginBody {
  username: string;
  password: string;
}

// Validator for login body
const validateLoginBody = (body: any): LoginBody => {
  const { username, password } = body;
  if (!username || typeof username !== "string" || username.trim() === "") throw new Error("Invalid username");
  if (!password || typeof password !== "string") throw new Error("Invalid password");
  return { username: username.trim(), password };
};

// POST /api/login
export const postLogin = async (req: Request) => {
  try {
    const { username, password } = validateLoginBody(await req.json());
    const row = [...safeQuery(
      "SELECT id, username, password, role, color FROM users WHERE username = ?",
      [username],
    )][0];
    if (!row) {
      console.error(`Login attempt failed: User '${username}' not found`);
      return new Response(JSON.stringify({ error: "Invalid username" }), { status: 401 });
    }
    const [id, username_db, hash_db, role, color] = [row[0], row[1], row[2], row[3], row[4]];
    const ok = compareSync(password, hash_db as string);
    if (!ok) {
      console.error(`Login attempt failed: Invalid password for user '${username}'`);
      return new Response(JSON.stringify({ error: "Invalid password" }), { status: 401 });
    }
    const token = await createToken({ id: id as number, username: username_db as string, role: role as string });
    return new Response(JSON.stringify({ token, role, color }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Login failed" }), { status: 400 });
  }
};
