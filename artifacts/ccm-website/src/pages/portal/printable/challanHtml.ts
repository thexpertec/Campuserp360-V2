import type { PortalUser } from "../data";

export function challanHtml(user: PortalUser): string {
  const f = user.fee;
  const grossAmt    = f.gross_amount ?? f.amount;
  const discountAmt = f.discount_amount ?? (grossAmt > f.amount ? grossAmt - f.amount : 0);
  const hasDiscount = discountAmt > 0;
  const schoolName  = user.school_name || "Cadet College Murree";
  const showName    = user.show_institute_name !== false;

  const concessionRow = hasDiscount
    ? `<tr><td style="color:#059669;">Fee Concession</td><td style="color:#059669;">− PKR ${discountAmt.toLocaleString()}</td></tr>`
    : "";
  const grossRow = hasDiscount
    ? `<tr><td>Gross Fee</td><td>PKR ${grossAmt.toLocaleString()}</td></tr>`
    : "";

  return `<!DOCTYPE html><html><head><title>Fee Challan</title>
<style>body{font-family:'Courier New',monospace;max-width:600px;margin:40px auto;}
.h{background:#064A1A;color:#fff;padding:12px 20px;text-align:center;}
.h h2{margin:0;font-size:20px;} .h p{margin:4px 0 0;font-size:12px;opacity:.85;}
table{width:100%;border-collapse:collapse;margin:12px 0;}
td{padding:6px 10px;border-bottom:1px dotted #ccc;font-size:13px;}
td:last-child{text-align:right;font-weight:600;}
.amt{font-size:22px;font-weight:900;color:#064A1A;text-align:center;
      padding:10px;background:#f0fdf4;border:1px solid #064A1A;border-radius:4px;margin:8px 0;}
.note{background:#fffbeb;border:1px solid #fcd34d;padding:10px;border-radius:4px;font-size:12px;margin-top:10px;}
@media print{body{margin:0;} button{display:none;}}
</style></head><body>
<div class="h">${showName ? `<h2>🏛️ ${schoolName}</h2>` : ""}
<p>Fee Challan — Entry Test Application 2026-27</p></div>
<table>
<tr><td>Challan No.</td><td>${f.challan_no}</td></tr>
<tr><td>Applicant Name</td><td>${user.name}</td></tr>
<tr><td>Father's Name</td><td>${user.father_name}</td></tr>
<tr><td>Class/Program Applying</td><td>${user.class_applying}</td></tr>
<tr><td>Applicant ID</td><td>${user.ref_id}</td></tr>
<tr><td>Bank Name</td><td>${f.bank}${f.bank_branch ? ` — ${f.bank_branch}` : ""}</td></tr>
${f.account_title ? `<tr><td>Account Title</td><td>${f.account_title}</td></tr>` : ""}
<tr><td>Account No.</td><td>${f.account}</td></tr>
<tr><td>Due Date</td><td>${f.due_date}</td></tr>
${grossRow}
${concessionRow}
</table>
<div class="amt">PKR ${f.amount.toLocaleString()} /-</div>
${f.challan_instructions ? `<div class="note">${f.challan_instructions}</div>` : `<div class="note">⚠️ Please keep this challan safe. Submit the original to the college along with your documents. Quote your Applicant ID on the back of the deposit slip.</div>`}
<br><button onclick="window.print()" style="background:#064A1A;color:#fff;padding:8px 20px;border:none;border-radius:6px;cursor:pointer;font-size:14px;">🖨️ Print Challan</button>
</body></html>`;
}
