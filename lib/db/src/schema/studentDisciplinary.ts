import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";

export const studentDisciplinaryTable = pgTable(
  "student_disciplinary",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    studentId:    uuid("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
    incidentDate: text("incident_date").notNull(),   // YYYY-MM-DD
    severity:     text("severity").notNull().default("minor"),  // minor | moderate | severe
    type:         text("type").notNull(),             // warning | detention | suspension | fine
    description:  text("description").notNull(),
    actionTaken:  text("action_taken"),
    reportedBy:   text("reported_by"),
    status:       text("status").notNull().default("open"),     // open | closed
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    studentIdx: index("stu_disc_student_idx").on(t.studentId),
    dateIdx:    index("stu_disc_date_idx").on(t.studentId, t.incidentDate),
  }),
);

export type StudentDisciplinary = typeof studentDisciplinaryTable.$inferSelect;
