import { safeQuery } from "../database.ts";

export const getEquipment = async () => {
  const equipment = [...safeQuery(
    "SELECT id, name, room, drawer_code FROM stock_equipment",
  )].map(([id, name, room, drawer_code]) => ({
    id: id as number,
    name: name as string,
    room: room as string,
    drawer_code: drawer_code as string,
  }));
  return new Response(JSON.stringify(equipment), { headers: { "Content-Type": "application/json" } });
};
