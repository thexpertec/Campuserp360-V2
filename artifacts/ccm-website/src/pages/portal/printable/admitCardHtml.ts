import type { PortalUser } from "../data";
import { formatDateLong } from "@/lib/locale";
import { displayPhone } from "@/lib/format";

function fmtTestDate(iso: string | null | undefined): string {
  return formatDateLong(iso ?? null);
}

function assetUrl(name: string): string {
  if (typeof window === "undefined") return `/${name}`;
  const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL || "/";
  return `${window.location.origin}${base}${name}`;
}
const watermarkUrl = () => assetUrl("offer-letter-bg.png");
const logoUrl = () => assetUrl("logo.png");

export function admitCardHtml(user: PortalUser): string {
  const TEST_DATE = fmtTestDate(user.test_date);
  const classLabel = (user.class_applying || "").replace(/^Class\s+/i, "");
  const photo = user.student_photo;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Admit Card — ${user.name}</title>
<style>
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:13px;line-height:1.5;position:relative;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  body::before{content:"";position:fixed;inset:0;background:url('${watermarkUrl()}') no-repeat center center;background-size:cover;opacity:0.12;z-index:-1;pointer-events:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .page{max-width:820px;margin:0 auto;padding:160px 28px 24px;position:relative;z-index:1;}
  .header{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #333;padding-bottom:10px;}
  .header .logo{width:78px;height:78px;object-fit:contain;}
  .header .title{flex:1;text-align:center;}
  .header h1{margin:0;font-size:22px;font-weight:800;letter-spacing:1px;}
  .header .sub{font-size:12px;font-weight:600;letter-spacing:2px;}
  .header .tel{font-size:11px;}
  .header .spacer{width:78px;}
  .doc-title{text-align:center;font-weight:700;text-decoration:underline;font-size:16px;margin:14px 0 10px;}
  .top{display:flex;gap:12px;margin-bottom:14px;}
  table{border-collapse:collapse;}
  .top table{flex:1;width:100%;}
  td{border:1px solid #444;padding:6px 8px;font-size:13px;vertical-align:top;}
  td.k{background:#f4f4f4;font-weight:600;width:140px;}
  .roll{color:#064A1A;font-weight:700;}
  .photo{width:110px;height:140px;border:1px solid #444;display:flex;align-items:center;justify-content:center;text-align:center;font-size:10px;color:#555;padding:4px;background:#fafafa;}
  .photo img{width:100%;height:100%;object-fit:cover;}
  h4{margin:14px 0 6px;font-size:13px;}
  ol{padding-left:22px;margin:6px 0;}
  ol li{margin:8px 0;}
  .timings{margin-top:8px;width:100%;max-width:440px;}
  .timings td{padding:5px 8px;font-size:12px;}
  .sig{margin-top:36px;display:flex;justify-content:flex-end;}
  .sig .box{text-align:center;}
  .sig .line{border-top:1px solid #333;padding:4px 24px 0;font-weight:600;}
  .test-date{margin-top:18px;font-weight:700;}
  .test-tbl{margin-top:6px;width:100%;}
  .test-tbl td.k{width:180px;}
  .urdu{margin-top:18px;text-align:right;direction:rtl;font-weight:600;line-height:1.9;font-family:'Noto Nastaliq Urdu','Jameel Noori Nastaleeq',serif;}
  .contact-note{margin-top:14px;font-size:12px;}
  @media print{body{margin:0;} .page{padding:160px 28px 0;} .noprint{display:none;} body::before{position:fixed;}}
  .printbtn{margin-top:18px;background:#064A1A;color:#fff;padding:8px 18px;border:none;border-radius:6px;cursor:pointer;font-size:13px;}
</style></head><body>
<div class="page">
<div class="doc-title">ADMIT CARD</div>

<div class="top">
  <table>
    <tr><td class="k">Roll Number</td><td class="roll">${user.roll_no ?? ""}</td></tr>
    <tr><td class="k">Name</td><td>${user.name.toUpperCase()}</td></tr>
    <tr><td class="k">Class</td><td>${classLabel}</td></tr>
    <tr><td class="k">Tel</td><td>${displayPhone(user.guardian_mobile || user.phone) ?? (user.guardian_mobile || user.phone)}</td></tr>
    <tr><td class="k">Postal Address</td><td>${user.address}</td></tr>
  </table>
  <div class="photo">${photo ? `<img src="${photo}" alt="Candidate" />` : "PASTE RECENT PASSPORT-SIZE PHOTO"}</div>
</div>

<h4>Instructions:</h4>
<ol>
  <li>Bring this call letter with you. You will not be permitted to appear in the written tests without this call letter.</li>
  <li>
    <strong>ENTRY TEST TIMINGS | ${TEST_DATE}</strong>
    <table class="timings">
      <tr><td>Candidates to be seated</td><td><strong>09:00 hrs</strong></td></tr>
      <tr><td>Paper-1 (Objective)</td><td><strong>09:15 hrs to 10:15 hrs</strong></td></tr>
      <tr><td>Paper-2 (Subjective)</td><td><strong>10:55 hrs to 11:55 hrs</strong></td></tr>
      <tr><td>Interviews</td><td><strong>12:05 hrs &amp; onwards</strong></td></tr>
    </table>
  </li>
  <li>Parents / Guardians are not permitted to enter in the examination Center / Hall.</li>
  <li>Result of successful candidates only, will be communicated.</li>
</ol>

<div class="sig">
  <div class="box">
    <div style="height:34px;"></div>
    <div class="line">In-charge Admission Cell</div>
  </div>
</div>

<div class="test-date">Entry Test Date: ${TEST_DATE}</div>
<table class="test-tbl">
  <tr><td class="k">Proposed Center</td><td>${user.exam_center}</td></tr>
  <tr><td class="k">Test Center / Venue</td><td>${user.test_venue ?? ""}</td></tr>
  <tr><td class="k">Address</td><td>${user.test_center_address ?? "—"}</td></tr>
  <tr><td class="k">Contact</td><td>${user.test_focal_person ?? "—"}</td></tr>
</table>

<p class="urdu">نوٹ: آن لائن فیس جمع نہ کروانے کی صورت میں ٹیسٹ والے دن مبلغ 3000 روپے یا دیر سے جمع کروانے پر 6000 روپے ہمراہ لائے، ورنہ ٹیسٹ میں بیٹھنے کی اجازت نہیں ہوگی۔</p>

<p class="contact-note">If you have any questions or need assistance, please contact the admission department at <strong>03000304520</strong> / <strong>03009543823</strong>.</p>

<button class="printbtn noprint" onclick="window.print()">🖨️ Print Admit Card</button>

</div>
</body></html>`;
}
