import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Printer } from "lucide-react";
import type { PortalUser } from "../data";
import { admitCardHtml } from "../printable/admitCardHtml";
import { printHtml } from "../printable/offerLetterHtml";
import { formatDateLong } from "@/lib/locale";
import { fetchActiveTemplateByPurpose, buildTemplateHtml, type ActiveTemplate } from "../api";

const WATERMARK_URL = `${import.meta.env.BASE_URL}offer-letter-bg.png`;

function fmtTestDate(iso: string | null | undefined): string {
  return formatDateLong(iso ?? null);
}

export default function AdmitCardSection({ user }: { user: PortalUser }) {
  const [customTemplate, setCustomTemplate] = useState<ActiveTemplate | null>(null);

  useEffect(() => {
    fetchActiveTemplateByPurpose("admit-card-entry-test").then(tpl => setCustomTemplate(tpl));
  }, []);

  const TEST_DATE = fmtTestDate(user.test_date);

  if (!user.roll_no) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-4"
      >
        <h1 className="text-3xl font-bold text-primary">🎫 Admit Card / Roll Number Slip</h1>
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span>⏳ Your admit card will be available once the entry test is scheduled. Check back soon.</span>
        </div>
      </motion.div>
    );
  }

  const classLabel = (user.class_applying || "").replace(/^Class\s+/i, "");
  const photo = user.student_photo;

  function handlePrint() {
    if (customTemplate) {
      const issueDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
      const values: Record<string, string> = {
        serial_no:                       user.roll_no ?? "",
        student_name:                    user.name.toUpperCase(),
        father_name:                     user.father_name ?? "",
        class:                           user.class_applying ?? "",
        mobile_no:                       user.guardian_mobile || user.phone || "",
        present_address:                 user.address ?? "",
        test_city:                       user.exam_center ?? "",
        test_center_name:                user.test_venue ?? "",
        test_center_address:             user.test_center_address ?? "",
        test_focal_person_phone_number:  user.test_focal_person ?? "",
        exam_date:                       TEST_DATE,
        student_photo:                   photo
          ? `<span style="display:inline-block;width:110px;height:140px;overflow:hidden;vertical-align:middle;line-height:0;"><img src="${photo}" style="width:100%;height:100%;object-fit:cover;display:block;" /></span>`
          : "",
        issue_date:                      issueDate,
      };
      printHtml(buildTemplateHtml(customTemplate, values));
    } else {
      printHtml(admitCardHtml(user));
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      <h1 className="text-3xl font-bold text-primary">🎫 Admit Card / Roll Number Slip</h1>

      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
        <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <span>
          Your entry test is scheduled on <strong>{TEST_DATE}</strong> at <strong>{user.test_venue}</strong>.
        </span>
      </div>

      {/* Printable admit card — same format as offer letter */}
      <div className="relative bg-white border border-border rounded-2xl p-6 md:p-10 text-[13px] leading-relaxed text-foreground overflow-hidden">
        {/* Full-page crest background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-no-repeat bg-top"
          style={{ backgroundImage: `url(${WATERMARK_URL})`, backgroundSize: "100% 100%" }}
        />
        <div className="relative pt-40">
          <h3 className="text-center text-lg font-bold underline mt-4 mb-3">ADMIT CARD</h3>

          {/* Top info table + photo */}
          <div className="flex gap-3 mb-4">
            <table className="flex-1 border-collapse text-[13px]">
              <tbody>
                <tr>
                  <td className="border border-foreground/60 px-2 py-1.5 font-semibold bg-foreground/[0.03] w-[140px]">Roll Number</td>
                  <td className="border border-foreground/60 px-2 py-1.5 font-bold text-primary">{user.roll_no}</td>
                </tr>
                <tr>
                  <td className="border border-foreground/60 px-2 py-1.5 font-semibold bg-foreground/[0.03]">Name</td>
                  <td className="border border-foreground/60 px-2 py-1.5">{user.name.toUpperCase()}</td>
                </tr>
                <tr>
                  <td className="border border-foreground/60 px-2 py-1.5 font-semibold bg-foreground/[0.03]">Class</td>
                  <td className="border border-foreground/60 px-2 py-1.5">{classLabel}</td>
                </tr>
                <tr>
                  <td className="border border-foreground/60 px-2 py-1.5 font-semibold bg-foreground/[0.03]">Tel</td>
                  <td className="border border-foreground/60 px-2 py-1.5">{user.guardian_mobile || user.phone}</td>
                </tr>
                <tr>
                  <td className="border border-foreground/60 px-2 py-1.5 font-semibold bg-foreground/[0.03]">Postal Address</td>
                  <td className="border border-foreground/60 px-2 py-1.5">{user.address}</td>
                </tr>
              </tbody>
            </table>
            <div className="w-[110px] h-[140px] border border-foreground/60 flex items-center justify-center text-[10px] text-foreground/60 text-center p-1 bg-foreground/[0.02]">
              {photo ? (
                <img src={photo} alt="Candidate" className="w-full h-full object-cover" />
              ) : (
                "PASTE RECENT PASSPORT-SIZE PHOTO"
              )}
            </div>
          </div>

          {/* Instructions */}
          <p className="font-bold mb-2">Instructions:</p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>Bring this call letter with you. You will not be permitted to appear in the written tests without this call letter.</li>
            <li>
              <span className="font-semibold">ENTRY TEST TIMINGS | {TEST_DATE}</span>
              <table className="mt-2 border-collapse text-[12px] w-full max-w-md">
                <tbody>
                  <tr>
                    <td className="border border-foreground/60 px-2 py-1">Candidates to be seated</td>
                    <td className="border border-foreground/60 px-2 py-1 font-semibold">09:00 hrs</td>
                  </tr>
                  <tr>
                    <td className="border border-foreground/60 px-2 py-1">Paper-1 (Objective)</td>
                    <td className="border border-foreground/60 px-2 py-1 font-semibold">09:15 hrs to 10:15 hrs</td>
                  </tr>
                  <tr>
                    <td className="border border-foreground/60 px-2 py-1">Paper-2 (Subjective)</td>
                    <td className="border border-foreground/60 px-2 py-1 font-semibold">10:55 hrs to 11:55 hrs</td>
                  </tr>
                  <tr>
                    <td className="border border-foreground/60 px-2 py-1">Interviews</td>
                    <td className="border border-foreground/60 px-2 py-1 font-semibold">12:05 hrs &amp; onwards</td>
                  </tr>
                </tbody>
              </table>
            </li>
            <li>Parents / Guardians are not permitted to enter in the examination Center / Hall.</li>
            <li>Result of successful candidates only, will be communicated.</li>
          </ol>

          {/* Signature */}
          <div className="mt-8 flex justify-end">
            <div className="text-center">
              <div className="h-10" />
              <div className="border-t border-foreground/70 pt-1 px-6 font-semibold">In-charge Admission Cell</div>
            </div>
          </div>

          {/* Test details */}
          <p className="mt-6 font-bold">Entry Test Date: {TEST_DATE}</p>
          <table className="mt-2 w-full border-collapse text-[13px]">
            <tbody>
              <tr>
                <td className="border border-foreground/60 px-2 py-1.5 font-semibold bg-foreground/[0.03] w-[180px]">Proposed Center</td>
                <td className="border border-foreground/60 px-2 py-1.5">{user.exam_center}</td>
              </tr>
              <tr>
                <td className="border border-foreground/60 px-2 py-1.5 font-semibold bg-foreground/[0.03]">Test Center / Venue</td>
                <td className="border border-foreground/60 px-2 py-1.5">{user.test_venue}</td>
              </tr>
              <tr>
                <td className="border border-foreground/60 px-2 py-1.5 font-semibold bg-foreground/[0.03]">Address</td>
                <td className="border border-foreground/60 px-2 py-1.5">{user.test_center_address || "—"}</td>
              </tr>
              <tr>
                <td className="border border-foreground/60 px-2 py-1.5 font-semibold bg-foreground/[0.03]">Contact</td>
                <td className="border border-foreground/60 px-2 py-1.5">{user.test_focal_person || "—"}</td>
              </tr>
            </tbody>
          </table>

          {/* Urdu note */}
          <p
            className="mt-5 text-right font-semibold leading-loose"
            style={{ direction: "rtl", fontFamily: "'Noto Nastaliq Urdu','Jameel Noori Nastaleeq',serif" }}
          >
            نوٹ: آن لائن فیس جمع نہ کروانے کی صورت میں ٹیسٹ والے دن مبلغ 3000 روپے یا دیر سے جمع کروانے پر 6000 روپے ہمراہ لائے، ورنہ ٹیسٹ میں بیٹھنے کی اجازت نہیں ہوگی۔
          </p>

          <p className="mt-4 text-[12px] text-foreground/80">
            If you have any questions or need assistance, please contact the admission department at <strong>03000304520</strong> / <strong>03009543823</strong>.
          </p>
        </div>
      </div>

      <div className="h-px bg-border" />

      <Button
        onClick={handlePrint}
        className="bg-primary hover:bg-primary/90"
        data-testid="download-admit"
      >
        <Printer className="w-4 h-4 mr-1.5" /> Print / Save as PDF
      </Button>
    </motion.div>
  );
}
