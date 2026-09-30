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
    /** Dryer settings this room's dryers actually have (subset of the heat ladder). null = all five. */
    dryerSettings: text("dryer_settings", { mode: "json" }).$type<string[] | null>(),
    /** Minutes one payment buys on a dryer here, shown as a hint. */
    minutesPerCycle: integer("minutes_per_cycle"),
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
    /** What was in the load (FABRICS in labels.ts), when the reporter said. Recorded for learning per-fabric settings later. */
    fabrics: text("fabrics", { mode: "json" }).$type<string[] | null>(),
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

/** "I started it": a resident marks a machine as running so others see when it should be free. Auto-expires via ends_at. */
export const machineRuns = sqliteTable(
  "machine_runs",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    startedAt: integer("started_at").notNull(),
    /** Estimated finish: started_at + the minutes the resident picked. */
    endsAt: integer("ends_at").notNull(),
    /** Set when the starter cancels, reports how it went, or a newer run replaces it. */
    endedAt: integer("ended_at"),
    deviceHash: text("device_hash").notNull(),
    ipHash: text("ip_hash").notNull(),
  },
  (t) => [
    index("machine_runs_machine_time").on(t.machineId, t.startedAt),
    index("machine_runs_device_time").on(t.deviceHash, t.startedAt),
    index("machine_runs_ip_time").on(t.ipHash, t.startedAt),
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

/** Admin-editable configuration, one row per key (see src/lib/config.ts). Missing rows mean "use the default". */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull().$type<unknown>(),
  updatedAt: integer("updated_at").notNull(),
});

/** Who changed what and when, for everything an admin does. */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    at: integer("at").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown> | null>(),
  },
  (t) => [index("audit_log_at").on(t.at)],
);

/** Browsers waiting for a broken machine to be fixed (Web Push). One-shot: deleted once notified or cancelled. */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** Same hash as reports.device_hash; caps how many machines one phone can watch. */
    deviceHash: text("device_hash").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("push_subscriptions_machine_endpoint").on(t.machineId, t.endpoint),
    index("push_subscriptions_device").on(t.deviceHash),
    index("push_subscriptions_created").on(t.createdAt),
  ],
);

export type Building = typeof buildings.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type Machine = typeof machines.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type MachineRun = typeof machineRuns.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
