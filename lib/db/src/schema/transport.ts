import {
  pgTable, uuid, text, boolean, integer, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const omitTs = { id: true, createdAt: true, updatedAt: true } as const;

// ── Vehicles ──────────────────────────────────────────────────────────────────
export const transportVehiclesTable = pgTable("transport_vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  regNo: text("reg_no").notNull(),
  make: text("make").notNull().default(""),
  model: text("model").notNull().default(""),
  vehicleType: text("vehicle_type").notNull().default("bus"), // bus | van | car
  capacity: integer("capacity").notNull().default(0),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("transport_vehicles_active_idx").on(t.active),
  tenantRegNoUniq: uniqueIndex("transport_vehicles_tenant_regno_uniq").on(t.tenantId, t.regNo),
}));

// ── Routes ────────────────────────────────────────────────────────────────────
export const transportRoutesTable = pgTable("transport_routes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  origin: text("origin").notNull().default(""),
  destination: text("destination").notNull().default(""),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("transport_routes_active_idx").on(t.active),
  tenantNameUniq: uniqueIndex("transport_routes_tenant_name_uniq").on(t.tenantId, t.name),
}));

// ── Drivers ───────────────────────────────────────────────────────────────────
export const transportDriversTable = pgTable("transport_drivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  cnic: text("cnic"),
  licenseNumber: text("license_number"),
  licenseType: text("license_type").notNull().default("LTV"), // LTV | HTV | PSV
  licenseExpiry: text("license_expiry"),      // YYYY-MM-DD
  phone: text("phone"),
  address: text("address"),
  status: text("status").notNull().default("active"), // active | inactive
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({ statusIdx: index("transport_drivers_status_idx").on(t.status) }));

// ── Trips ─────────────────────────────────────────────────────────────────────
export const transportTripsTable = pgTable("transport_trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  routeId: uuid("route_id").references(() => transportRoutesTable.id, { onDelete: "set null" }),
  vehicleId: uuid("vehicle_id").references(() => transportVehiclesTable.id, { onDelete: "set null" }),
  driverId: uuid("driver_id").references(() => transportDriversTable.id, { onDelete: "set null" }),
  tripDate: text("trip_date").notNull(),      // YYYY-MM-DD
  departureTime: text("departure_time"),
  arrivalTime: text("arrival_time"),
  status: text("status").notNull().default("scheduled"), // scheduled | completed | cancelled
  passengerCount: integer("passenger_count").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  dateIdx: index("transport_trips_date_idx").on(t.tripDate),
  statusIdx: index("transport_trips_status_idx").on(t.status),
  routeIdx: index("transport_trips_route_idx").on(t.routeId),
}));

// ── Insert schemas ────────────────────────────────────────────────────────────
export const insertTransportVehicleSchema = createInsertSchema(transportVehiclesTable).omit(omitTs);
export const insertTransportRouteSchema = createInsertSchema(transportRoutesTable).omit(omitTs);
export const insertTransportDriverSchema = createInsertSchema(transportDriversTable).omit(omitTs);
export const insertTransportTripSchema = createInsertSchema(transportTripsTable).omit(omitTs);

export type TransportVehicle = typeof transportVehiclesTable.$inferSelect;
export type TransportRoute = typeof transportRoutesTable.$inferSelect;
export type TransportDriver = typeof transportDriversTable.$inferSelect;
export type TransportTrip = typeof transportTripsTable.$inferSelect;
export type InsertTransportVehicle = z.infer<typeof insertTransportVehicleSchema>;
export type InsertTransportRoute = z.infer<typeof insertTransportRouteSchema>;
export type InsertTransportDriver = z.infer<typeof insertTransportDriverSchema>;
export type InsertTransportTrip = z.infer<typeof insertTransportTripSchema>;
