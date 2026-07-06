/** Field/resource definitions driving the inline Collection Manager. */

export type FieldType = "text" | "textarea" | "number" | "boolean" | "image" | "file";

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
};

export type ResourceDef = {
  /** API path segment under /api/admin/website/. */
  path: string;
  /** Plural label for the picker. */
  label: string;
  /** Singular label for buttons/dialogs. */
  singular: string;
  /** Field used as the list-row title. */
  titleField: string;
  /** Optional field used as the list-row subtitle. */
  subtitleField?: string;
  /** Optional image field used for the list-row thumbnail. */
  imageField?: string;
  fields: FieldDef[];
};

const PUBLISHED: FieldDef = { name: "isPublished", label: "Published (visible on site)", type: "boolean" };

export const RESOURCES: ResourceDef[] = [
  {
    path: "announcements", label: "Announcements", singular: "Announcement",
    titleField: "title", subtitleField: "category", imageField: "imageUrl",
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "body", label: "Body", type: "textarea" },
      { name: "category", label: "Category", type: "text" },
      { name: "imageUrl", label: "Image", type: "image" },
      PUBLISHED,
    ],
  },
  {
    path: "events", label: "Events", singular: "Event",
    titleField: "title", subtitleField: "date", imageField: "imageUrl",
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "date", label: "Date (display text)", type: "text", placeholder: "e.g. 14 Aug 2025" },
      { name: "category", label: "Category", type: "text" },
      { name: "imageUrl", label: "Image", type: "image" },
      { name: "imageAlt", label: "Image alt text", type: "text" },
      PUBLISHED,
    ],
  },
  {
    path: "gallery", label: "Gallery", singular: "Gallery item",
    titleField: "title", subtitleField: "category", imageField: "imageUrl",
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "category", label: "Category", type: "text" },
      { name: "imageUrl", label: "Image", type: "image", required: true },
      { name: "imageAlt", label: "Image alt text", type: "text" },
      { name: "author", label: "Author / credit", type: "text" },
      PUBLISHED,
    ],
  },
  {
    path: "faculty", label: "Faculty", singular: "Faculty member",
    titleField: "name", subtitleField: "department", imageField: "photoUrl",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "department", label: "Department", type: "text" },
      { name: "subject", label: "Subject", type: "text" },
      { name: "designation", label: "Designation", type: "text" },
      { name: "photoUrl", label: "Photo", type: "image" },
      PUBLISHED,
    ],
  },
  {
    path: "features", label: "Features", singular: "Feature",
    titleField: "title", subtitleField: "iconName",
    fields: [
      { name: "iconName", label: "Icon name (lucide)", type: "text" },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      PUBLISHED,
    ],
  },
  {
    path: "facilities", label: "Facilities", singular: "Facility",
    titleField: "title", subtitleField: "iconName", imageField: "imageUrl",
    fields: [
      { name: "iconName", label: "Icon name (lucide)", type: "text" },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "imageUrl", label: "Image", type: "image" },
      PUBLISHED,
    ],
  },
  {
    path: "quick-links", label: "Quick Links", singular: "Quick link",
    titleField: "title", subtitleField: "href",
    fields: [
      { name: "iconName", label: "Icon name (lucide)", type: "text" },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "cta", label: "Button text", type: "text" },
      { name: "href", label: "Link URL", type: "text" },
      { name: "isExternal", label: "Opens in new tab", type: "boolean" },
      PUBLISHED,
    ],
  },
  {
    path: "testimonials", label: "Testimonials", singular: "Testimonial",
    titleField: "name", subtitleField: "role", imageField: "photoUrl",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "role", label: "Role / relation", type: "text" },
      { name: "quote", label: "Quote", type: "textarea", required: true },
      { name: "photoUrl", label: "Photo", type: "image" },
      PUBLISHED,
    ],
  },
  {
    path: "downloads", label: "Downloads", singular: "Download",
    titleField: "title", subtitleField: "category", imageField: "imageUrl",
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "subtitle", label: "Subtitle", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "category", label: "Category", type: "text" },
      { name: "imageUrl", label: "Image", type: "image" },
      { name: "fileUrl", label: "File", type: "file" },
      { name: "fileName", label: "File name", type: "text" },
      PUBLISHED,
    ],
  },
  {
    path: "results", label: "Results", singular: "Result",
    titleField: "className", subtitleField: "examName",
    fields: [
      { name: "examName", label: "Exam name", type: "text" },
      { name: "className", label: "Class/Program", type: "text", required: true },
      { name: "academicYear", label: "Academic year", type: "text" },
      { name: "resultDate", label: "Result date (display text)", type: "text" },
      { name: "downloadUrl", label: "Result file", type: "file" },
      { name: "notes", label: "Notes", type: "textarea" },
      PUBLISHED,
    ],
  },
  {
    path: "alumni", label: "Alumni Stories", singular: "Alumnus",
    titleField: "name", subtitleField: "role", imageField: "photoUrl",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "batch", label: "Batch (e.g. Class of 2005)", type: "text" },
      { name: "category", label: "Category", type: "text", placeholder: "armed_forces · medical · engineering · civil_services · academia" },
      { name: "role", label: "Role / title", type: "text" },
      { name: "organization", label: "Organization", type: "text" },
      { name: "location", label: "Location", type: "text" },
      { name: "quote", label: "Quote", type: "textarea" },
      { name: "story", label: "Story (one paragraph per blank line)", type: "textarea" },
      { name: "achievements", label: "Achievements (one per line)", type: "textarea" },
      { name: "badge", label: "Honour badge (optional)", type: "text" },
      { name: "photoUrl", label: "Photo", type: "image" },
      { name: "featured", label: "Featured story", type: "boolean" },
      PUBLISHED,
    ],
  },
  {
    path: "fee-structure", label: "Fee Structure", singular: "Fee item",
    titleField: "className", subtitleField: "feeType",
    fields: [
      { name: "className", label: "Class/Program", type: "text", required: true },
      { name: "feeType", label: "Fee type", type: "text", required: true },
      { name: "amount", label: "Amount", type: "number" },
      { name: "currency", label: "Currency", type: "text", placeholder: "PKR" },
      { name: "notes", label: "Notes", type: "textarea" },
      PUBLISHED,
    ],
  },
];

export function resourceByPath(path: string): ResourceDef | undefined {
  return RESOURCES.find((r) => r.path === path);
}
