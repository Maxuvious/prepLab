import { DB } from "https://deno.land/x/sqlite/mod.ts";
import { genSaltSync, hashSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const db = new DB("lab.db");

// Helper function for safe query execution with error logging
export function safeQuery(sql: string, params: any[] = [], errorMsg: string = "Database query failed") {
  try {
    return db.query(sql, params);
  } catch (err) {
    console.error(`${errorMsg}: SQL: ${sql}, Params: ${JSON.stringify(params)}`, err.stack || err.message);
    throw err;
  }
}

// Prep lab cards are associated with a class and contain card text
// e.g. equipment lists or instructions for that class.
db.execute(`
  CREATE TABLE IF NOT EXISTS prep_lab_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class TEXT NOT NULL,
    card_text TEXT NOT NULL
  )
`);

// Stock equipment by room and drawer code
// This keeps track of where each item is stored in the school.
db.execute(`
  CREATE TABLE IF NOT EXISTS stock_equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    room TEXT NOT NULL,
    drawer_code TEXT NOT NULL
  )
`);

// Link table mapping prep lab cards to the equipment they use
db.execute(`
  CREATE TABLE IF NOT EXISTS card_equipment (
    card_id INTEGER NOT NULL,
    equipment_id INTEGER NOT NULL,
    FOREIGN KEY(card_id) REFERENCES prep_lab_cards(id),
    FOREIGN KEY(equipment_id) REFERENCES stock_equipment(id)
  )
`);

// Simple user table with role and a preferred color for task check marks
db.execute(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'root')), -- Edge case: restrict roles
    color TEXT NOT NULL
  )
`);

// Tasks belong to a card and can be checked by any user
db.execute(`
  CREATE TABLE IF NOT EXISTS card_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    is_checked INTEGER DEFAULT 0,
    checked_by INTEGER,
    checked_at TEXT,
    FOREIGN KEY(card_id) REFERENCES prep_lab_cards(id),
    FOREIGN KEY(checked_by) REFERENCES users(id)
  )
`);

// Change requests for card edits, submitted by users and approved by root
db.execute(`
  CREATE TABLE IF NOT EXISTS change_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    class TEXT NOT NULL,
    card_text TEXT NOT NULL,
    FOREIGN KEY(card_id) REFERENCES prep_lab_cards(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )
`);

// Insert a few example records on first run
const row = [...safeQuery("SELECT count(*) FROM prep_lab_cards")][0][0] as number;
if (row === 0) {
  safeQuery(
    "INSERT INTO prep_lab_cards (class, card_text) VALUES (?, ?)",
    ["Biology 1005", "Basic Biology equipment"],
  );
  safeQuery(
    "INSERT INTO prep_lab_cards (class, card_text) VALUES (?, ?)",
    ["Chemistry 1111", "Chemistry lab kit"],
  );

  safeQuery(
    "INSERT INTO stock_equipment (name, room, drawer_code) VALUES (?, ?, ?)",
    ["Microscope", "101", "A1"],
  );
  safeQuery(
    "INSERT INTO stock_equipment (name, room, drawer_code) VALUES (?, ?, ?)",
    ["Test Tubes", "102", "B5"],
  );
  safeQuery(
    "INSERT INTO stock_equipment (name, room, drawer_code) VALUES (?, ?, ?)",
    ["Beaker Set", "102", "B6"],
  );

  // Retrieve inserted card and equipment ids
  const cardIds = [...safeQuery("SELECT id FROM prep_lab_cards")].map((r) => r[0]);
  const eqIds = [...safeQuery("SELECT id FROM stock_equipment")].map((r) => r[0]);

  // Assume order: first card uses first equipment, second card uses second and third
  safeQuery("INSERT INTO card_equipment (card_id, equipment_id) VALUES (?, ?)", [cardIds[0], eqIds[0]]);
  safeQuery("INSERT INTO card_equipment (card_id, equipment_id) VALUES (?, ?)", [cardIds[1], eqIds[1]]);
  safeQuery("INSERT INTO card_equipment (card_id, equipment_id) VALUES (?, ?)", [cardIds[1], eqIds[2]]);

  // Create demo users with verified hashes
  const rootPass = hashSync("rootpass", genSaltSync(10));
  const userPass = hashSync("userpass", genSaltSync(10));
  safeQuery(
    "INSERT INTO users (username, password, role, color) VALUES (?, ?, ?, ?)",
    ["root", rootPass, "root", "#ff0000"],
  );
  safeQuery(
    "INSERT INTO users (username, password, role, color) VALUES (?, ?, ?, ?)",
    ["alice", userPass, "user", "#0000ff"],
  );

  // Seed a couple of tasks for the first card
  const biologyCard = cardIds[0];
  safeQuery(
    "INSERT INTO card_tasks (card_id, description) VALUES (?, ?)",
    [biologyCard, "Clean microscopes"],
  );
  safeQuery(
    "INSERT INTO card_tasks (card_id, description) VALUES (?, ?)",
    [biologyCard, "Return slides"],
  );
}

export { db };
