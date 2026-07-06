import type { PrintSettings } from "@/lib/print-utils";
import { formatDate } from "@/lib/locale";

export type AttendanceSheetRow = {
  referenceId: string;
  fullName: string;
  fatherName: string | null;
  classApplying: string;
  guardianMobile: string | null;
  examCenter: string;
  feeStatus: string | null;
  photoFilename: string | null;
};

export function buildAttendanceSheetHtml(
  rows: AttendanceSheetRow[],
  settings: PrintSettings,
  origin: string,
  filterLabel?: string,
): string {
  const { marginTop, marginRight, marginBottom, marginLeft, bgImageUrl } = settings;
  const bgAbsoluteUrl = bgImageUrl ?? null;
  const today = formatDate(new Date());

  const sorted = [...rows].sort((a, b) => a.referenceId.localeCompare(b.referenceId));

  const tableRows = sorted.map((r, i) => {
    const photoSrc = r.photoFilename
      ? (r.photoFilename.startsWith("http") || r.photoFilename.startsWith("/") ? r.photoFilename : `${origin}/uploads/${r.photoFilename}`)
      : "";
    const photoCell = photoSrc
      ? `<img src="${photoSrc}" onerror="this.parentElement.innerHTML='<span style=\\"color:#bbb;font-size:9pt\\">No Photo</span>'" style="width:45px;height:55px;object-fit:cover;border:1px solid #ccc;" />`
      : `<span style="color:#bbb;font-size:9pt">No Photo</span>`;
    const payStatus = r.feeStatus === "paid" ? `<span style="color:#166534;font-weight:600">Paid</span>` : `<span style="color:#991b1b;">Unpaid</span>`;

    return `<tr>
      <td style="text-align:center;width:32px">${i + 1}</td>
      <td style="text-align:center;width:60px;padding:3px">${photoCell}</td>
      <td style="font-family:monospace;font-weight:600;font-size:9.5pt;white-space:nowrap">${r.referenceId}</td>
      <td><div style="font-weight:600;font-size:9.5pt">${r.fullName}</div></td>
      <td style="font-size:9pt">${r.fatherName ?? "—"}</td>
      <td style="font-size:9pt;text-align:center">${r.classApplying}</td>
      <td style="font-size:9pt;white-space:nowrap">${r.guardianMobile ?? "—"}</td>
      <td style="font-size:9pt">${r.examCenter}</td>
      <td style="text-align:center">${payStatus}</td>
      <td style="width:80px">&nbsp;</td>
    </tr>`;
  }).join("\n");

  const filterLine = filterLabel ? `<p style="margin:2px 0 6px;font-size:9pt;color:#555">${filterLabel}</p>` : "";

  const contentHtml = `
<div style="font-family:'Times New Roman',Georgia,serif;">
  <table style="width:100%;border:none;margin-bottom:4px;">
    <tr>
      <td style="border:none;padding:0;vertical-align:top">
        <div style="font-size:13pt;font-weight:700;text-transform:uppercase;letter-spacing:0.04em">Attendance Sheet — Entry Test / Exam</div>
        <div style="font-size:9pt;color:#555;margin-top:2px">Date Printed: ${today}</div>
        ${filterLine}
      </td>
      <td style="border:none;padding:0;text-align:right;vertical-align:top">
        ${settings.showInstituteName !== false ? `<div style="font-size:15pt;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">${settings.instituteName || "Institution"}</div>` : ""}
        <div style="font-size:9pt;color:#555;margin-top:2px">Total Candidates: ${rows.length}</div>
      </td>
    </tr>
  </table>
  <hr style="border:none;border-top:2px solid #111;margin:4px 0 6px;" />

  <table style="width:100%;border-collapse:collapse;font-size:9.5pt;">
    <thead>
      <tr style="background:#f0f0f0;">
        <th style="border:1px solid #999;padding:5px 4px;text-align:center;font-size:8.5pt">#</th>
        <th style="border:1px solid #999;padding:5px 4px;text-align:center;font-size:8.5pt">Photo</th>
        <th style="border:1px solid #999;padding:5px 4px;font-size:8.5pt">Reg. Code</th>
        <th style="border:1px solid #999;padding:5px 4px;font-size:8.5pt">Name</th>
        <th style="border:1px solid #999;padding:5px 4px;font-size:8.5pt">Father Name</th>
        <th style="border:1px solid #999;padding:5px 4px;text-align:center;font-size:8.5pt">Class</th>
        <th style="border:1px solid #999;padding:5px 4px;font-size:8.5pt">Mobile No</th>
        <th style="border:1px solid #999;padding:5px 4px;font-size:8.5pt">Exam Center</th>
        <th style="border:1px solid #999;padding:5px 4px;text-align:center;font-size:8.5pt">Payment</th>
        <th style="border:1px solid #999;padding:5px 4px;text-align:center;font-size:8.5pt">Signature</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
</div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Attendance Sheet — Entry Test</title>
  <style>
    @page {
      size: A4 landscape;
      margin: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      font-family: 'Times New Roman', Georgia, serif;
      font-size: 10pt;
      color: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    ${bgAbsoluteUrl ? `body {
      background-image: url("${bgAbsoluteUrl}");
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }` : ""}
    table { border-collapse: collapse; }
    td, th { vertical-align: middle; }
    tr:nth-child(even) td { background: #f9f9f9; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>${contentHtml}</body>
</html>`;
}
