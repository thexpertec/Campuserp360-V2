import {
  pgTable, uuid, text, boolean, integer, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const omitTs = { id: true, createdAt: true, updatedAt: true } as const;

// ── Hostel Blocks ─────────────────────────────────────────────────────────────
export const hostelBlocksTable = pgTable("hostel_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  blockType: text("block_type").notNull().default("boys"), // boys | girls | staff
  floors: integer("floors").notNull().default(1),
  capacity: integer("capacity").notNull().default(0),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("hostel_blocks_active_idx").on(t.active),
  tenantNameIdx: uniqueIndex("hostel_blocks_tenant_name_idx").on(t.tenantId, t.name),
}));

// ── Room Types ────────────────────────────────────────────────────────────────
export const hostelRoomTypesTable = pgTable("hostel_room_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull().default(1),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("hostel_room_types_active_idx").on(t.active),
  tenantNameIdx: uniqueIndex("hostel_room_types_tenant_name_idx").on(t.tenantId, t.name),
}));

// ── Rooms ─────────────────────────────────────────────────────────────────────
export const hostelRoomsTable = pgTable("hostel_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  blockId: uuid("block_id").notNull().references(() => hostelBlocksTable.id, { onDelete: "restrict" }),
  roomNumber: text("room_number").notNull(),
  roomTypeId: uuid("room_type_id").references(() => hostelRoomTypesTable.id, { onDelete: "set null" }),
  floor: integer("floor").notNull().default(1),
  capacity: integer("capacity").notNull().default(1),
  status: text("status").notNull().default("available"), // available | occupied | maintenance
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  blockIdx: index("hostel_rooms_block_idx").on(t.blockId),
  statusIdx: index("hostel_rooms_status_idx").on(t.status),
  tenantIdx: index("hostel_rooms_tenant_idx").on(t.tenantId),
}));

// ── Allocations ───────────────────────────────────────────────────────────────
export const hostelAllocationsTable = pgTable("hostel_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id"),              // soft ref to students
  studentName: text("student_name").notNull().default(""),
  applicantId: text("applicant_id"),
  classCode: text("class_code"),
  roomId: uuid("room_id").notNull().references(() => hostelRoomsTable.id, { onDelete: "restrict" }),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date"),
  status: text("status").notNull().default("active"), // active | vacated
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  roomIdx: index("hostel_allocations_room_idx").on(t.roomId),
  studentIdx: index("hostel_allocations_student_idx").on(t.studentId),
  statusIdx: index("hostel_allocations_status_idx").on(t.status),
}));

// ── Insert schemas ────────────────────────────────────────────────────────────
export const insertHostelBlockSchema = createInsertSchema(hostelBlocksTable).omit(omitTs);
export const insertHostelRoomTypeSchema = createInsertSchema(hostelRoomTypesTable).omit(omitTs);
export const insertHostelRoomSchema = createInsertSchema(hostelRoomsTable).omit(omitTs);
export const insertHostelAllocationSchema = createInsertSchema(hostelAllocationsTable).omit(omitTs);

export type HostelBlock = typeof hostelBlocksTable.$inferSelect;
export type HostelRoomType = typeof hostelRoomTypesTable.$inferSelect;
export type HostelRoom = typeof hostelRoomsTable.$inferSelect;
export type HostelAllocation = typeof hostelAllocationsTable.$inferSelect;
export type InsertHostelBlock = z.infer<typeof insertHostelBlockSchema>;
export type InsertHostelRoomType = z.infer<typeof insertHostelRoomTypeSchema>;
export type InsertHostelRoom = z.infer<typeof insertHostelRoomSchema>;
export type InsertHostelAllocation = z.infer<typeof insertHostelAllocationSchema>;
