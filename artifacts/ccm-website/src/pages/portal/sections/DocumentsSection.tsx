import { useState, type Dispatch, type SetStateAction } from "react";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Upload, CheckCircle2, AlertCircle, Loader2, XCircle } from "lucide-react";
import type { PortalUser } from "../data";
import StatusBadge from "../components/StatusBadge";
import { portalUploadDocument } from "../api";
import { useToast } from "@/hooks/use-toast";

const DOC_DESCRIPTIONS: Record<string, string> = {
  "Birth Certificate": "Original birth certificate issued by NADRA / Union Council",
  "B-Form (Child CNIC)": "Child's NADRA B-Form (Form B)",
  "School Leaving Cert": "School Leaving / Transfer Certificate from previous school",
  "Student Photo": "Recent passport-size photograph (white background)",
  "Medical Fitness Cert": "Medical fitness certificate from a registered doctor",
};

type Props = {
  user: PortalUser;
  uploaded: Record<string, string>;
  setUploaded: Dispatch<SetStateAction<Record<string, string>>>;
  onRefresh?: () => Promise<void>;
};

export default function DocumentsSection({ user, uploaded, setUploaded, onRefresh }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  async function handleFile(name: string, file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrors((e) => ({ ...e, [name]: "File exceeds 5 MB limit." }));
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setErrors((e) => ({ ...e, [name]: "Only JPG, PNG, and PDF files are accepted." }));
      return;
    }
    setErrors((e) => ({ ...e, [name]: "" }));
    setUploading((u) => ({ ...u, [name]: true }));
    try {
      await portalUploadDocument(name, file);
      setUploaded((u) => ({ ...u, [name]: file.name }));
      toast({ title: "✅ Document uploaded", description: `${name} submitted for review.` });
      await onRefresh?.();
    } catch (err) {
      setErrors((e) => ({ ...e, [name]: err instanceof Error ? err.message : "Upload failed." }));
    } finally {
      setUploading((u) => ({ ...u, [name]: false }));
    }
  }

  const total = Object.keys(user.docs).length;
  const done = Object.entries(user.docs).filter(
    ([n, d]) => d.uploaded || n in uploaded,
  ).length;
  const missing = Object.entries(user.docs)
    .filter(([n, d]) => !d.uploaded && !(n in uploaded))
    .map(([n]) => n);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      <div>
        <h1 className="text-3xl font-bold text-primary">📂 Documents</h1>
        <p className="text-sm text-foreground/60 mt-1">
          Upload required documents. All files must be clear scans/photos (JPG, PNG, PDF). Max size: 5 MB.
        </p>
      </div>

      <div className="space-y-3">
        {Object.entries(user.docs).map(([name, info]) => {
          const isUp = info.uploaded || name in uploaded;
          const isVer = info.verified;
          const isRej = info.rejected;
          const isUploading = uploading[name] ?? false;
          return (
            <div key={name} className={`bg-card border rounded-xl p-4 ${isRej ? "border-rose-200" : "border-border"}`}>
              <div className="grid md:grid-cols-[2.5fr_1fr_1.5fr] gap-3 items-center">
                <div>
                  <div className="font-semibold">{name}</div>
                  <p className="text-xs text-foreground/60 mt-0.5">{DOC_DESCRIPTIONS[name]}</p>
                  {isRej && info.rejection_reason && (
                    <p className="text-xs text-rose-600 mt-1">⚠️ {info.rejection_reason}</p>
                  )}
                </div>
                <div>
                  {isVer ? (
                    <StatusBadge variant="selected">✅ Verified</StatusBadge>
                  ) : isRej ? (
                    <StatusBadge variant="not">❌ Rejected</StatusBadge>
                  ) : isUp ? (
                    <StatusBadge variant="wait">🔍 Under Review</StatusBadge>
                  ) : (
                    <StatusBadge variant="not">❌ Not Uploaded</StatusBadge>
                  )}
                </div>
                <div>
                  {isUploading ? (
                    <div className="flex items-center gap-2 text-sm text-primary">
                      <Loader2 className="w-4 h-4 animate-spin" /> Uploading…
                    </div>
                  ) : isVer ? (
                    <div className="text-sm text-foreground/70">
                      <div>📄 Verified — no action needed.</div>
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-primary/40 text-sm text-primary cursor-pointer hover:bg-primary/5 transition-colors w-full justify-center">
                      <Upload className="w-4 h-4" />
                      <span>{isUp || isRej ? "Re-upload" : "Choose file"}</span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.pdf"
                        className="hidden"
                        onChange={(e) => handleFile(name, e.target.files?.[0] ?? null)}
                        data-testid={`upload-${name}`}
                      />
                    </label>
                  )}
                  {!isUploading && isUp && !isVer && !isRej && (
                    <div className="text-xs text-foreground/55 mt-1">
                      {uploaded[name] ? `📄 ${uploaded[name]}` : "File submitted"}
                    </div>
                  )}
                  {errors[name] && (
                    <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                      <XCircle className="w-3 h-3" />{errors[name]}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="h-px bg-border" />

      <div>
        <p className="font-semibold mb-2 text-sm">
          Progress: {done}/{total} documents submitted
        </p>
        <Progress value={total > 0 ? (done / total) * 100 : 0} className="h-2" />
        {missing.length > 0 ? (
          <div className="flex items-start gap-2 mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Still required: {missing.join(", ")}</span>
          </div>
        ) : (
          <div className="flex items-start gap-2 mt-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>🎉 All documents submitted! The admissions team will verify them within 2–3 working days.</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
