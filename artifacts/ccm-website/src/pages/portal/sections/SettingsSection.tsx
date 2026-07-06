import { useState } from "react";
import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, Phone, Loader2 } from "lucide-react";
import type { PortalUser } from "../data";
import { portalChangePassword } from "../api";

export default function SettingsSection({
  user,
  onPasswordChange,
}: {
  user: PortalUser;
  onPasswordChange: (newPwd: string) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!current) {
      setMsg({ type: "error", text: "Current password is required." });
      return;
    }
    if (next.length < 4) {
      setMsg({ type: "error", text: "New password must be at least 4 characters." });
      return;
    }
    if (next !== confirm) {
      setMsg({ type: "error", text: "Passwords do not match." });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      await portalChangePassword(current, next);
      setMsg({ type: "success", text: "✅ Password updated successfully!" });
      setCurrent("");
      setNext("");
      setConfirm("");
      onPasswordChange(next);
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to update password." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      <h1 className="text-3xl font-bold text-primary">⚙️ Settings</h1>

      <Accordion type="multiple" defaultValue={["pwd"]} className="space-y-2">
        <AccordionItem value="pwd" className="border border-border rounded-xl px-4 bg-card">
          <AccordionTrigger className="font-semibold">🔑 Change Password</AccordionTrigger>
          <AccordionContent>
            <form onSubmit={handleUpdate} className="space-y-3 pt-2" data-testid="pwd-form">
              <div className="space-y-1.5">
                <Label htmlFor="curpw">Current Password</Label>
                <Input id="curpw" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newpw">New Password</Label>
                <Input id="newpw" type="password" value={next} onChange={(e) => setNext(e.target.value)} disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confpw">Confirm New Password</Label>
                <Input id="confpw" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={loading} />
              </div>
              {msg && (
                <div
                  className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                    msg.type === "error"
                      ? "bg-rose-50 border border-rose-200 text-rose-700"
                      : "bg-emerald-50 border border-emerald-200 text-emerald-800"
                  }`}
                >
                  {msg.type === "error" ? (
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  )}
                  <span>{msg.text}</span>
                </div>
              )}
              <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Update Password
              </Button>
            </form>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="contact" className="border border-border rounded-xl px-4 bg-card">
          <AccordionTrigger className="font-semibold">📧 Contact Information</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-1.5 text-sm pt-2">
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Phone:</strong> {user.phone}</p>
              <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
                <Phone className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>To update contact information, please contact the admissions office at <strong>0304-1111024</strong>.</span>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="account" className="border border-border rounded-xl px-4 bg-card">
          <AccordionTrigger className="font-semibold">ℹ️ Account Information</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-1.5 text-sm pt-2">
              <p><strong>Applicant ID:</strong> {user.ref_id}</p>
              <p><strong>Name:</strong> {user.name}</p>
              <p><strong>Session:</strong> {user.session}</p>
              <p><strong>Class/Program:</strong> {user.class_applying}</p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </motion.div>
  );
}
