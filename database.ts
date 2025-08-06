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
// Classes table for names and colors
db.execute(`
  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL DEFAULT '#000000'
  )
`);
// Prep lab cards are associated with a class_id and contain card text
db.execute(`
  CREATE TABLE IF NOT EXISTS prep_lab_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL,
    card_text TEXT NOT NULL,
    FOREIGN KEY(class_id) REFERENCES classes(id)
  )
`);
// Stock equipment by room and drawer code
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
    new_class TEXT NOT NULL,
    new_card_text TEXT NOT NULL,
    FOREIGN KEY(card_id) REFERENCES prep_lab_cards(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )
`);
// Events for calendar
db.execute(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    description TEXT
  )
`);
// Carts with capacity and usage
db.execute(`
  CREATE TABLE IF NOT EXISTS carts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    current_usage INTEGER DEFAULT 0
  )
`);
// Global settings for theme
db.execute(`
  CREATE TABLE IF NOT EXISTS global_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);
safeQuery("INSERT OR IGNORE INTO global_settings (key, value) VALUES ('theme', 'default')");
// Insert a few example records on first run
const row = [...safeQuery("SELECT count(*) FROM prep_lab_cards")][0][0] as number;
if (row === 0) {
  // Insert classes
  safeQuery(
    "INSERT INTO classes (name, color) VALUES (?, ?)",
    ["Biology 1005", "#00ff00"],
  );
  safeQuery(
    "INSERT INTO classes (name, color) VALUES (?, ?)",
    ["Chemistry 1111", "#0000ff"],
  );
  const classIds = [...safeQuery("SELECT id FROM classes")].map((r) => r[0] as number);
  safeQuery(
    "INSERT INTO prep_lab_cards (class_id, card_text) VALUES (?, ?)",
    [classIds[0], "Basic Biology equipment"],
  );
  safeQuery(
    "INSERT INTO prep_lab_cards (class_id, card_text) VALUES (?, ?)",
    [classIds[1], "Chemistry lab kit"],
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
  // Seed example events
  safeQuery(
    "INSERT INTO events (title, date, description) VALUES (?, ?, ?)",
    ["Lab Meeting", "2025-08-10", "Discuss prep for semester"],
  );
  safeQuery(
    "INSERT INTO events (title, date, description) VALUES (?, ?, ?)",
    ["Inventory Check", "2025-08-15", "Full stock review"],
  );
  // Seed example carts
  safeQuery(
    "INSERT INTO carts (name, capacity, current_usage) VALUES (?, ?, ?)",
    ["Cart 1", 100, 40],
  );
  safeQuery(
    "INSERT INTO carts (name, capacity, current_usage) VALUES (?, ?, ?)",
    ["Cart 2", 100, 70],
  );
}
export { db };
