import { DB } from "https://deno.land/x/sqlite/mod.ts";

const db = new DB("lab.db");

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

// Insert a few example records on first run
const row = [...db.query("SELECT count(*) FROM prep_lab_cards")][0][0] as number;
if (row === 0) {
  db.query(
    "INSERT INTO prep_lab_cards (class, card_text) VALUES (?, ?)",
    ["Biology 1005", "Basic Biology equipment"],
  );
  db.query(
    "INSERT INTO prep_lab_cards (class, card_text) VALUES (?, ?)",
    ["Chemistry 1111", "Chemistry lab kit"],
  );

  db.query(
    "INSERT INTO stock_equipment (name, room, drawer_code) VALUES (?, ?, ?)",
    ["Microscope", "101", "A1"],
  );
  db.query(
    "INSERT INTO stock_equipment (name, room, drawer_code) VALUES (?, ?, ?)",
    ["Test Tubes", "102", "B5"],
  );
  db.query(
    "INSERT INTO stock_equipment (name, room, drawer_code) VALUES (?, ?, ?)",
    ["Beaker Set", "102", "B6"],
  );

  // Retrieve inserted card and equipment ids
  const cardIds = [...db.query("SELECT id FROM prep_lab_cards")].map((r) => r[0]);
  const eqIds = [...db.query("SELECT id FROM stock_equipment")].map((r) => r[0]);

  // Assume order: first card uses first equipment, second card uses second and third
  db.query("INSERT INTO card_equipment (card_id, equipment_id) VALUES (?, ?)", [cardIds[0], eqIds[0]]);
  db.query("INSERT INTO card_equipment (card_id, equipment_id) VALUES (?, ?)", [cardIds[1], eqIds[1]]);
  db.query("INSERT INTO card_equipment (card_id, equipment_id) VALUES (?, ?)", [cardIds[1], eqIds[2]]);
}

export { db };
