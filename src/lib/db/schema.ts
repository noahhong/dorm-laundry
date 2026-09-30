import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const buildings = sqliteTable("buildings", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  campus: text("campus"),
  createdAt: integer("created_at").notNull(),
});

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    buildingId: text("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    locationHint: text("location_hint"),
    washLocationCode: text("wash_location_code"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("rooms_building_slug").on(t.buildingId, t.slug)],
);

export const machines = sqliteTable(
  "machines",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    kind: text("kind", { enum: ["washer", "dryer"] }).notNull(),
    label: text("label").notNull(),
    washMachineNumber: text("wash_machine_number"),
    position: integer("position").notNull().default(0),
    adminState: text("admin_state", { enum: ["out_of_order"] }),
    adminNote: text("admin_note"),
    statusResetAt: integer("status_reset_at"),
    retiredAt: integer("retired_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("machines_room").on(t.roomId, t.position)],
);

export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
    outcome: text("outcome").notNull(),
    setting: text("setting"),
    symptoms: text("symptoms", { mode: "json" }).$type<string[]>().notNull().default([]),
    errorCode: text("error_code"),
    minutes: integer("minutes"),
    loadSize: text("load_size"),
    note: text("note"),
    deviceHash: text("device_hash").notNull(),
    ipHash: text("ip_hash").notNull(),
    trust: real("trust").notNull().default(1),
    hiddenAt: integer("hidden_at"),
    /** Set when the reporter undoes it. Kept (not deleted) so undo can't be used to reset rate limits. */
    undoneAt: integer("undone_at"),
  },
  (t) => [
    index("reports_machine_time").on(t.machineId, t.createdAt),
    index("reports_device_time").on(t.deviceHash, t.createdAt),
    index("reports_ip_time").on(t.ipHash, t.createdAt),
  ],
);

/** Failed admin logins by salted IP hash, for brute-force throttling that works across serverless instances. */
export const loginFailures = sqliteTable(
  "login_failures",
  {
    id: text("id").primaryKey(),
    ipHash: text("ip_hash").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("login_failures_ip_time").on(t.ipHash, t.createdAt)],
);

export type Building = typeof buildings.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type Machine = typeof machines.$inferSelect;
export type Report = typeof reports.$inferSelect;
