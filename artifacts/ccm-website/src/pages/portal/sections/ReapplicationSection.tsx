import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Clock, Bell, ArrowRight } from "lucide-react";
import type { PortalUser, SectionKey } from "../data";

const TIPS = [
  "Focus on English grammar, comprehension, and vocabulary",
  "Practice mental math and basic algebra daily",
  "Read Urdu prose and poetry from the national curriculum",
  "Solve past papers of entry tests",
  "Improve your IQ / verbal reasoning score through practice tests",
  "Maintain 80%+ marks in current class",
];

export default function ReapplicationSection({
  user,
  onNavigate,
}: {
  user: PortalUser;
  onNavigate: (k: SectionKey) => void;
}) {
  const { toast } = useToast();
  const result = user.result_status;
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [classOptions, setClassOptions] = useState<{ value: string; label: string }[]>([]);
  const [notifyClass, setNotifyClass] = useState("");
  useEffect(() => {
    fetch("/api/classes")
      .then(r => r.ok ? r.json() : [])
      .then((data: { code: string; name: string }[]) => {
        const opts = data.map(c => ({ value: c.code, label: c.name }));
        setClassOptions(opts);
        if (opts.length > 0) setNotifyClass(opts[0].value);
      })
      .catch(() => {});
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    toast({
      title: "✅ Notification subscribed",
      description: `We'll notify you at ${email} and ${phone} when ${classOptions.find(c => c.value === notifyClass)?.label ?? notifyClass} admissions open for 2027-28.`,
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      <h1 className="text-3xl font-bold text-primary">🔄 Re-application</h1>

      {result === "selected" && (
        <>
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
            <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>🎉 You have already been selected! No re-application is needed.</span>
          </div>
          <p>Please proceed to the <strong>Joining Instructions</strong> page for next steps.</p>
          <Button onClick={() => onNavigate("joining")} className="bg-primary hover:bg-primary/90">
            View Joining Instructions <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </>
      )}

      {result === "wait_listed" && (
        <>
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
            <Clock className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>⏳ You are currently on the <strong>Wait List</strong>.</span>
          </div>
          <ul className="space-y-1.5 text-sm">
            <li className="flex gap-2"><span className="text-primary">•</span>Wait-listed candidates are contacted <strong>in merit order</strong> as seats become available.</li>
            <li className="flex gap-2"><span className="text-primary">•</span>If a seat opens before <strong>30 June 2026</strong>, you will receive an SMS and email.</li>
            <li className="flex gap-2"><span className="text-primary">•</span>If you do not receive a call by 30 June, you may re-apply for the <strong>next session (2027-28)</strong>.</li>
          </ul>
          <div className="h-px bg-border" />
        </>
      )}

      {(result === "not_selected" || result === "wait_listed") && (
        <div>
          <h2 className="text-xl font-bold text-primary mb-2">📝 Apply for Next Session</h2>
          <p className="text-sm text-foreground/75 mb-3">
            Applications for <strong>Session 2027-28</strong> will open in <strong>January 2027</strong>. To be notified
            when admissions open:
          </p>
          <form
            onSubmit={handleSubmit}
            className="bg-card border border-border rounded-xl p-5 space-y-4"
            data-testid="notify-form"
          >
            <div className="space-y-1.5">
              <Label htmlFor="notify-email">Your Email</Label>
              <Input id="notify-email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notify-phone">Your Phone</Label>
              <Input id="notify-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Class/Program for Next Session</Label>
              <Select value={notifyClass} onValueChange={setNotifyClass}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {classOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90">
              <Bell className="w-4 h-4 mr-1.5" /> Notify Me When Admissions Open
            </Button>
          </form>
        </div>
      )}

      <div className="h-px bg-border" />

      <div>
        <h3 className="font-bold mb-2">💡 Tips to Improve for Next Session:</h3>
        <ul className="space-y-1.5 text-sm">
          {TIPS.map((t) => (
            <li key={t} className="flex gap-2">
              <span>✏️</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="h-px bg-border" />

      <Link
        href="/admissions"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm"
      >
        🌐 View Online Admission Portal <ArrowRight className="w-4 h-4" />
      </Link>
    </motion.div>
  );
}
