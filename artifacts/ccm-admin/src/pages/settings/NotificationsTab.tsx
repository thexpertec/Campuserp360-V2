import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, Mail, MessageSquare, ChevronDown, ChevronRight,
  Save, Loader2, CheckCircle2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ccm_notification_settings";

type ChannelConfig = {
  smsEnabled: boolean;
  emailEnabled: boolean;
  smsApiKey: string;
  smsSenderId: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  smtpFromName: string;
  smtpFromEmail: string;
  smtpSsl: boolean;
};

type NotifEvent = {
  key: string;
  category: string;
  label: string;
  description: string;
  enabled: boolean;
  sms: boolean;
  email: boolean;
  smsTemplate: string;
  emailSubject: string;
  emailTemplate: string;
};

// ── Placeholder codes per event ───────────────────────────────────────────────
const EVENT_CODES: Record<string, string[]> = {
  app_received:     ["{name}", "{ref}", "{date}", "{institute_name}"],
  app_shortlisted:  ["{name}", "{ref}", "{date}", "{venue}", "{link}"],
  app_rejected:     ["{name}", "{ref}", "{institute_name}"],
  app_selected:     ["{name}", "{ref}", "{date}", "{institute_name}"],
  result_published: ["{name}", "{exam}", "{date}", "{portal_url}"],
  attendance_low:   ["{name}", "{pct}", "{date}", "{class}"],
  fee_due:          ["{name}", "{amount}", "{date}", "{challan_no}"],
  fee_paid:         ["{name}", "{amount}", "{receipt}", "{date}"],
  fee_overdue:      ["{name}", "{amount}", "{date}", "{phone}"],
  hostel_leave:     ["{name}", "{from}", "{to}", "{reason}"],
};

const DEFAULT_EVENTS: NotifEvent[] = [
  { key: "app_received",    category: "Admissions", enabled: true,  label: "Application Received",    description: "Sent when a new application is submitted.",           sms: true,  email: true,  smsTemplate: "Dear {name}, your application to CCM (Ref: {ref}) has been received. We will contact you shortly.",          emailSubject: "Application Received — CCM",      emailTemplate: "Dear {name},\n\nThank you for applying to Cadet College Murree. Your application reference is {ref}.\n\nWe will review your application and contact you.\n\nRegards,\nCCM Admissions Office" },
  { key: "app_shortlisted", category: "Admissions", enabled: true,  label: "Application Shortlisted", description: "Sent when an applicant is shortlisted for the test.",  sms: true,  email: true,  smsTemplate: "Congratulations {name}! You have been shortlisted for CCM entry test on {date} at {venue}. Admit Card: {link}", emailSubject: "Shortlisted for Entry Test — CCM",  emailTemplate: "Dear {name},\n\nWe are pleased to inform you that your application has been shortlisted.\n\nEntry Test Date: {date}\nVenue: {venue}\n\nPlease download your admit card: {link}\n\nRegards,\nCCM Admissions Office" },
  { key: "app_rejected",    category: "Admissions", enabled: true,  label: "Application Rejected",    description: "Sent when an application is rejected.",               sms: false, email: true,  smsTemplate: "",                                                                                                                emailSubject: "Application Status — CCM",         emailTemplate: "Dear {name},\n\nThank you for applying to Cadet College Murree. After careful review, we regret to inform you that your application (Ref: {ref}) has not been successful at this time.\n\nRegards,\nCCM Admissions Office" },
  { key: "app_selected",    category: "Admissions", enabled: true,  label: "Candidate Selected",      description: "Sent when a candidate is finally selected.",          sms: true,  email: true,  smsTemplate: "Congratulations {name}! You have been selected for admission to CCM. Please report on {date} with all documents.", emailSubject: "Admission Offer — CCM",             emailTemplate: "Dear {name},\n\nCongratulations! We are delighted to offer you admission to Cadet College Murree.\n\nPlease report on {date} with all required documents.\n\nRegards,\nCCM Admissions Office" },
  { key: "result_published",category: "Academic",   enabled: true,  label: "Results Published",       description: "Sent when exam results are published.",               sms: true,  email: false, smsTemplate: "Dear {name}, your {exam} results are now available. Login to the portal to view your result.",                     emailSubject: "Results Available — CCM",          emailTemplate: "" },
  { key: "attendance_low",  category: "Academic",   enabled: true,  label: "Low Attendance Alert",    description: "Sent when a student's attendance falls below 75%.",  sms: true,  email: true,  smsTemplate: "Alert: {name}'s attendance has fallen to {pct}%. Please ensure regular attendance.",                              emailSubject: "Attendance Alert — CCM",           emailTemplate: "Dear Parent/Guardian,\n\nThis is to inform you that {name}'s attendance has fallen to {pct}%, below the required 75%.\n\nKindly ensure regular attendance.\n\nRegards,\nCCM Academic Office" },
  { key: "fee_due",         category: "Finance",    enabled: true,  label: "Fee Due Reminder",        description: "Sent before fee due date.",                          sms: true,  email: false, smsTemplate: "Reminder: Fee of Rs.{amount} for {name} is due on {date}. Please pay before the due date to avoid late charges.", emailSubject: "Fee Due — CCM",                    emailTemplate: "" },
  { key: "fee_paid",        category: "Finance",    enabled: true,  label: "Fee Payment Confirmed",   description: "Sent when a fee payment is recorded.",               sms: true,  email: false, smsTemplate: "Fee of Rs.{amount} received for {name}. Receipt No: {receipt}. Thank you.",                                      emailSubject: "Payment Confirmed — CCM",          emailTemplate: "" },
  { key: "fee_overdue",     category: "Finance",    enabled: true,  label: "Fee Overdue",             description: "Sent when fee is overdue.",                          sms: true,  email: true,  smsTemplate: "OVERDUE: Fee of Rs.{amount} for {name} is overdue. Late charges will apply. Contact: {phone}",                   emailSubject: "Fee Overdue — CCM",                emailTemplate: "Dear Parent/Guardian,\n\nFee of Rs.{amount} for {name} is overdue. Please pay immediately to avoid suspension.\n\nRegards,\nCCM Finance Office" },
  { key: "hostel_leave",    category: "Hostel",     enabled: true,  label: "Leave Approval",          description: "Sent when a leave request is approved.",             sms: true,  email: false, smsTemplate: "{name}'s leave from {from} to {to} has been approved. Please ensure timely return.",                              emailSubject: "Leave Approved — CCM",             emailTemplate: "" },
];

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as { channels: ChannelConfig; events: NotifEvent[] };
  } catch {}
  return {
    channels: {
      smsEnabled: false, emailEnabled: false,
      smsApiKey: "", smsSenderId: "CCM",
      smtpHost: "", smtpPort: "587", smtpUser: "", smtpPassword: "",
      smtpFromName: "Cadet College Murree", smtpFromEmail: "noreply@ccm.edu.pk",
      smtpSsl: true,
    },
    events: DEFAULT_EVENTS,
  };
}

const CATEGORIES = Array.from(new Set(DEFAULT_EVENTS.map((e) => e.category)));

function TestBadge({ ok }: { ok: boolean }) {
  return ok
    ? <Badge className="bg-green-100 text-green-800 gap-1 text-[11px]"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>
    : <Badge variant="secondary" className="gap-1 text-[11px]"><AlertCircle className="h-3 w-3" /> Not configured</Badge>;
}

// ── Inline event editor ───────────────────────────────────────────────────────
function EventEditor({
  ev,
  onSave,
}: {
  ev: NotifEvent;
  onSave: (updated: NotifEvent) => void;
}) {
  const [form, setForm] = useState<NotifEvent>({ ...ev });
  const { toast } = useToast();

  const codes = EVENT_CODES[ev.key] ?? ["{name}", "{date}"];

  function save() {
    onSave(form);
    toast({ description: `"${ev.label}" template saved.` });
  }

  return (
    <div className="px-5 py-4 bg-slate-50/80 border-t border-dashed border-border space-y-4">

      {/* Notify enable */}
      <div className="flex items-center gap-2.5">
        <Checkbox
          id={`enable-${ev.key}`}
          checked={form.enabled}
          onCheckedChange={(v) => setForm(f => ({ ...f, enabled: !!v }))}
        />
        <Label htmlFor={`enable-${ev.key}`} className="text-sm font-medium cursor-pointer">
          Notify Enable
        </Label>
      </div>

      {/* SMS template */}
      {form.sms && (
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <MessageSquare className="h-3.5 w-3.5 text-green-600" /> SMS Template
          </Label>
          <Textarea
            rows={2}
            value={form.smsTemplate}
            onChange={(e) => setForm(f => ({ ...f, smsTemplate: e.target.value }))}
            placeholder="SMS message text…"
            className="text-sm font-mono resize-none"
          />
          <p className="text-[11px] text-muted-foreground">
            {form.smsTemplate.length} chars — keep under 160 for single SMS
          </p>
        </div>
      )}

      {/* Email subject */}
      {form.email && (
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <Mail className="h-3.5 w-3.5 text-blue-600" /> Subject *
          </Label>
          <Input
            value={form.emailSubject}
            onChange={(e) => setForm(f => ({ ...f, emailSubject: e.target.value }))}
            placeholder="Email subject line…"
            className="text-sm"
          />
        </div>
      )}

      {/* Email body */}
      {form.email && (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Body
          </Label>
          <Textarea
            rows={6}
            value={form.emailTemplate}
            onChange={(e) => setForm(f => ({ ...f, emailTemplate: e.target.value }))}
            placeholder="Email body…"
            className="text-sm font-mono resize-none"
          />
        </div>
      )}

      {/* Placeholder codes */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
        <span className="font-semibold text-slate-500">Codes :</span>
        {codes.map(c => (
          <code key={c} className="bg-white border border-border rounded px-1.5 py-0.5 text-slate-600 font-mono text-[11px]">
            {c}
          </code>
        ))}
      </div>

      {/* Save */}
      <div className="flex justify-end pt-1">
        <Button size="sm" onClick={save} className="gap-1.5">
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function NotificationsTab() {
  const { toast } = useToast();
  const [data, setData] = useState(loadSettings);
  const { channels, events } = data;
  const [saving, setSaving] = useState(false);
  const [channelDirty, setChannelDirty] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  function setChannel<K extends keyof ChannelConfig>(key: K, value: ChannelConfig[K]) {
    setData((d) => ({ ...d, channels: { ...d.channels, [key]: value } }));
    setChannelDirty(true);
  }

  function saveChannels() {
    setSaving(true);
    setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setSaving(false);
      setChannelDirty(false);
      toast({ title: "Notification settings saved" });
    }, 500);
  }

  function toggleEvent(key: string, channel: "sms" | "email", value: boolean) {
    const updated = {
      ...data,
      events: data.events.map((e) => e.key === key ? { ...e, [channel]: value } : e),
    };
    setData(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  function saveEventTemplate(updatedEv: NotifEvent) {
    const updated = { ...data, events: data.events.map((e) => e.key === updatedEv.key ? updatedEv : e) };
    setData(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setExpandedKey(null);
  }

  return (
    <div className="space-y-8">

      {/* ── SMS Gateway ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-100">
              <MessageSquare className="h-4 w-4 text-green-700" />
            </div>
            <h3 className="font-semibold text-sm">SMS Gateway</h3>
            <TestBadge ok={channels.smsEnabled && !!channels.smsApiKey} />
          </div>
          <Switch checked={channels.smsEnabled} onCheckedChange={(v) => setChannel("smsEnabled", v)} />
        </div>
        {channels.smsEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-9">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">API Key</Label>
              <Input type="password" value={channels.smsApiKey} onChange={(e) => setChannel("smsApiKey", e.target.value)} placeholder="Your SMS gateway API key" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Sender ID</Label>
              <Input value={channels.smsSenderId} onChange={(e) => setChannel("smsSenderId", e.target.value)} placeholder="e.g. CCM" maxLength={11} />
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* ── Email SMTP ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-100">
              <Mail className="h-4 w-4 text-blue-700" />
            </div>
            <h3 className="font-semibold text-sm">Email (SMTP)</h3>
            <TestBadge ok={channels.emailEnabled && !!channels.smtpHost && !!channels.smtpUser} />
          </div>
          <Switch checked={channels.emailEnabled} onCheckedChange={(v) => setChannel("emailEnabled", v)} />
        </div>
        {channels.emailEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-9">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">SMTP Host</Label>
              <Input value={channels.smtpHost} onChange={(e) => setChannel("smtpHost", e.target.value)} placeholder="smtp.gmail.com" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Port</Label>
              <Input value={channels.smtpPort} onChange={(e) => setChannel("smtpPort", e.target.value)} placeholder="587" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Username</Label>
              <Input value={channels.smtpUser} onChange={(e) => setChannel("smtpUser", e.target.value)} placeholder="user@gmail.com" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Password</Label>
              <Input type="password" value={channels.smtpPassword} onChange={(e) => setChannel("smtpPassword", e.target.value)} placeholder="App password" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">From Name</Label>
              <Input value={channels.smtpFromName} onChange={(e) => setChannel("smtpFromName", e.target.value)} placeholder="Cadet College Murree" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">From Email</Label>
              <Input type="email" value={channels.smtpFromEmail} onChange={(e) => setChannel("smtpFromEmail", e.target.value)} placeholder="noreply@ccm.edu.pk" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3 sm:col-span-2">
              <div>
                <Label>Use SSL/TLS</Label>
                <p className="text-xs text-muted-foreground">Recommended for secure email delivery.</p>
              </div>
              <Switch checked={channels.smtpSsl} onCheckedChange={(v) => setChannel("smtpSsl", v)} />
            </div>
          </div>
        )}
      </div>

      {channelDirty && (
        <div className="flex justify-end">
          <Button onClick={saveChannels} disabled={saving} size="sm">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? "Saving…" : "Save Channel Settings"}
          </Button>
        </div>
      )}

      <Separator />

      {/* ── Notification Events ── */}
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-100">
            <Bell className="h-4 w-4 text-orange-700" />
          </div>
          <h3 className="font-semibold text-sm">Notification Events</h3>
        </div>

        {CATEGORIES.map((cat) => {
          const catEvents = events.filter((e) => e.category === cat);
          return (
            <div key={cat} className="space-y-2">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest pl-1">{cat}</p>

              <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm divide-y divide-border">
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_72px_72px_36px] items-center bg-muted/40 px-4 py-2">
                  <span className="text-xs font-semibold text-muted-foreground">Event</span>
                  <span className="text-xs font-semibold text-muted-foreground text-center">SMS</span>
                  <span className="text-xs font-semibold text-muted-foreground text-center">Email</span>
                  <span />
                </div>

                {catEvents.map((ev) => {
                  const isOpen = expandedKey === ev.key;
                  return (
                    <div key={ev.key} className={cn(!ev.enabled && "opacity-60")}>
                      {/* Collapsed row */}
                      <div
                        className={cn(
                          "grid grid-cols-[1fr_72px_72px_36px] items-center px-4 py-3 transition-colors cursor-pointer select-none",
                          isOpen ? "bg-slate-50" : "hover:bg-muted/20"
                        )}
                        onClick={() => setExpandedKey(isOpen ? null : ev.key)}
                      >
                        {/* Name + desc */}
                        <div className="min-w-0 pr-3">
                          <div className="flex items-center gap-1.5">
                            {isOpen
                              ? <ChevronDown className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                            <span className={cn("text-sm font-semibold", isOpen && "text-emerald-700")}>
                              {ev.label}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground pl-5">{ev.description}</p>
                        </div>

                        {/* SMS toggle — stop propagation so clicking toggle doesn't collapse */}
                        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={ev.sms}
                            onCheckedChange={(v) => toggleEvent(ev.key, "sms", v)}
                          />
                        </div>

                        {/* Email toggle */}
                        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={ev.email}
                            onCheckedChange={(v) => toggleEvent(ev.key, "email", v)}
                          />
                        </div>

                        {/* Spacer for chevron column */}
                        <div />
                      </div>

                      {/* Expanded editor */}
                      {isOpen && (
                        <EventEditor
                          ev={ev}
                          onSave={saveEventTemplate}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
