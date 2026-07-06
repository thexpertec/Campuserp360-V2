import { useState } from "react";
import { useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminAnnouncements, getListAdminAnnouncementsQueryKey,
  useCreateAdminAnnouncement, useUpdateAdminAnnouncement, useDeleteAdminAnnouncement,
  useListAdminNoticeboard, getListAdminNoticeboardQueryKey,
  useCreateAdminNoticeboardItem, useUpdateAdminNoticeboardItem, useDeleteAdminNoticeboardItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DataTable, type ColDef } from "@/components/DataTable";
import { Plus, Pencil, Trash2, Loader2, Megaphone, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const today = () => new Date().toISOString().slice(0, 10);

type AnnF = { title: string; body: string; targetAudience: string; priority: string; publishedAt: string; expiresAt: string; createdBy: string };
const emptyAnn = (): AnnF => ({ title: "", body: "", targetAudience: "all", priority: "normal", publishedAt: today(), expiresAt: "", createdBy: "" });
const toAnnForm = (r: any): AnnF => ({ title: r.title ?? "", body: r.body ?? "", targetAudience: r.targetAudience ?? "all", priority: r.priority ?? "normal", publishedAt: r.publishedAt ?? today(), expiresAt: r.expiresAt ?? "", createdBy: r.createdBy ?? "" });
const toAnnBody = (f: AnnF) => ({ title: f.title.trim(), body: f.body.trim(), targetAudience: f.targetAudience || undefined, priority: f.priority || undefined, publishedAt: f.publishedAt || undefined, expiresAt: f.expiresAt || undefined, createdBy: f.createdBy.trim() || undefined });

type NoticeF = { title: string; content: string; category: string; publishedAt: string; expiresAt: string; attachmentUrl: string };
const emptyNotice = (): NoticeF => ({ title: "", content: "", category: "", publishedAt: today(), expiresAt: "", attachmentUrl: "" });
const toNoticeForm = (r: any): NoticeF => ({ title: r.title ?? "", content: r.content ?? "", category: r.category ?? "", publishedAt: r.publishedAt ?? today(), expiresAt: r.expiresAt ?? "", attachmentUrl: r.attachmentUrl ?? "" });
const toNoticeBody = (f: NoticeF) => ({ title: f.title.trim(), content: f.content.trim() || undefined, category: f.category.trim() || undefined, publishedAt: f.publishedAt || undefined, expiresAt: f.expiresAt || undefined, attachmentUrl: f.attachmentUrl.trim() || undefined });

const PRIORITY_COLORS: Record<string, string> = { urgent: "bg-red-100 text-red-700", high: "bg-orange-100 text-orange-700", normal: "bg-blue-100 text-blue-700", low: "bg-slate-100 text-slate-600" };
const AUDIENCE_COLORS: Record<string, string> = { all: "bg-purple-100 text-purple-700", students: "bg-blue-100 text-blue-700", staff: "bg-green-100 text-green-700", parents: "bg-orange-100 text-orange-700" };

function AnnouncementsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminAnnouncements();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminAnnouncementsQueryKey() });
  const createMut = useCreateAdminAnnouncement({ mutation: { onSuccess: inv } });
  const updateMut = useUpdateAdminAnnouncement({ mutation: { onSuccess: inv } });
  const deleteMut = useDeleteAdminAnnouncement({ mutation: { onSuccess: inv } });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<AnnF>(emptyAnn());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const { toast } = useToast();
  const set = (k: keyof AnnF) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm(emptyAnn()); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toAnnForm(r)); setOpen(true); }
  function onClose() { setOpen(false); setEditing(null); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = toAnnBody(form);
    if (editing) {
      updateMut.mutate({ id: editing.id, data: body }, { onSuccess: () => { toast({ title: "Announcement updated" }); onClose(); }, onError: () => toast({ title: "Error", variant: "destructive" }) });
    } else {
      createMut.mutate({ data: body }, { onSuccess: () => { toast({ title: "Announcement published" }); onClose(); }, onError: () => toast({ title: "Error", variant: "destructive" }) });
    }
  }

  const rows = (Array.isArray(data) ? data : []).filter(r => !searchQ || JSON.stringify(r).toLowerCase().includes(searchQ.toLowerCase()));
  const cols: ColDef<any>[] = [
    { key: "title", label: "Title", sortable: true, defaultVisible: true, defaultWidth: 260, render: r => <span className="text-sm font-medium">{r.title}</span>, getText: r => r.title ?? "" },
    { key: "targetAudience", label: "Target", sortable: true, defaultVisible: true, defaultWidth: 120, render: r => <Badge variant="outline" className={AUDIENCE_COLORS[r.targetAudience] ?? ""}>{r.targetAudience || "—"}</Badge>, getText: r => r.targetAudience ?? "" },
    { key: "priority", label: "Priority", sortable: true, defaultVisible: true, defaultWidth: 110, render: r => <Badge variant="outline" className={PRIORITY_COLORS[r.priority] ?? ""}>{r.priority || "—"}</Badge>, getText: r => r.priority ?? "" },
    { key: "publishedAt", label: "Published", sortable: true, defaultVisible: true, defaultWidth: 120, render: r => <span className="text-sm text-slate-600">{r.publishedAt || "—"}</span>, getText: r => r.publishedAt ?? "" },
    { key: "expiresAt", label: "Expires", sortable: true, defaultVisible: true, defaultWidth: 110, render: r => <span className="text-sm text-slate-500">{r.expiresAt || "—"}</span>, getText: r => r.expiresAt ?? "" },
    { key: "_actions", label: "", defaultVisible: true, defaultWidth: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ), getText: () => "" },
  ];

  return (
    <>
      <DataTable
        tableId="ccm_announcements_v2"
        title="Announcements"
        subtitle="Institution-wide and targeted announcements"
        action={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" />New Announcement</Button>}
        filters={
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search announcements…" className="pl-8 h-9 text-sm" />
          </div>
        }
        columns={cols} data={rows} total={rows.length} isLoading={isLoading} pageSize={50} clientPaginate
        emptyIcon={<div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center"><Megaphone className="h-7 w-7 text-slate-300" /></div>}
        emptyTitle="No announcements yet" emptyDescription="Click New Announcement to publish the first announcement."
      />
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Announcement" : "New Announcement"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input required value={form.title} onChange={set("title")} placeholder="Announcement title" />
            </div>
            <div className="space-y-1.5">
              <Label>Body *</Label>
              <Textarea required value={form.body} onChange={set("body")} placeholder="Full announcement text…" className="min-h-[100px]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Target Audience</Label>
                <Select value={form.targetAudience} onValueChange={v => setForm(f => ({ ...f, targetAudience: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="students">Students</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="parents">Parents</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Publish Date</Label>
                <Input type="date" value={form.publishedAt} onChange={set("publishedAt")} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Date</Label>
                <Input type="date" value={form.expiresAt} onChange={set("expiresAt")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Created By</Label>
              <Input value={form.createdBy} onChange={set("createdBy")} placeholder="Author name" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Save Changes" : "Publish"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete announcement?</AlertDialogTitle><AlertDialogDescription>This will remove the announcement permanently.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { deleteMut.mutate({ id: deleteId! }, { onSuccess: () => { setDeleteId(null); toast({ title: "Announcement deleted" }); } }); }} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NoticeboardTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminNoticeboard();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminNoticeboardQueryKey() });
  const createMut = useCreateAdminNoticeboardItem({ mutation: { onSuccess: inv } });
  const updateMut = useUpdateAdminNoticeboardItem({ mutation: { onSuccess: inv } });
  const deleteMut = useDeleteAdminNoticeboardItem({ mutation: { onSuccess: inv } });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<NoticeF>(emptyNotice());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const { toast } = useToast();
  const set = (k: keyof NoticeF) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm(emptyNotice()); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toNoticeForm(r)); setOpen(true); }
  function onClose() { setOpen(false); setEditing(null); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = toNoticeBody(form);
    if (editing) {
      updateMut.mutate({ id: editing.id, data: body }, { onSuccess: () => { toast({ title: "Notice updated" }); onClose(); }, onError: () => toast({ title: "Error", variant: "destructive" }) });
    } else {
      createMut.mutate({ data: body }, { onSuccess: () => { toast({ title: "Notice posted" }); onClose(); }, onError: () => toast({ title: "Error", variant: "destructive" }) });
    }
  }

  const rows = (Array.isArray(data) ? data : []).filter(r => !searchQ || JSON.stringify(r).toLowerCase().includes(searchQ.toLowerCase()));
  const cols: ColDef<any>[] = [
    { key: "title", label: "Title", sortable: true, defaultVisible: true, defaultWidth: 260, render: r => <span className="text-sm font-medium">{r.title}</span>, getText: r => r.title ?? "" },
    { key: "category", label: "Category", sortable: true, defaultVisible: true, defaultWidth: 140, render: r => <span className="text-sm text-slate-600">{r.category || "—"}</span>, getText: r => r.category ?? "" },
    { key: "publishedAt", label: "Posted", sortable: true, defaultVisible: true, defaultWidth: 120, render: r => <span className="text-sm">{r.publishedAt || "—"}</span>, getText: r => r.publishedAt ?? "" },
    { key: "expiresAt", label: "Expires", sortable: true, defaultVisible: true, defaultWidth: 110, render: r => <span className="text-sm text-slate-500">{r.expiresAt || "—"}</span>, getText: r => r.expiresAt ?? "" },
    { key: "active", label: "Status", sortable: true, defaultVisible: true, defaultWidth: 90, render: r => <Badge variant="outline" className={r.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}>{r.active ? "Active" : "Inactive"}</Badge>, getText: r => r.active ? "Active" : "Inactive" },
    { key: "_actions", label: "", defaultVisible: true, defaultWidth: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ), getText: () => "" },
  ];

  return (
    <>
      <DataTable
        tableId="ccm_noticeboard_v2"
        title="Notice Board"
        subtitle="Digital notice board entries"
        action={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" />Post Notice</Button>}
        filters={
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search notices…" className="pl-8 h-9 text-sm" />
          </div>
        }
        columns={cols} data={rows} total={rows.length} isLoading={isLoading} pageSize={50} clientPaginate
        emptyIcon={<div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center"><Megaphone className="h-7 w-7 text-slate-300" /></div>}
        emptyTitle="No notices yet" emptyDescription="Click Post Notice to add the first notice board item."
      />
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Notice" : "Post Notice"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input required value={form.title} onChange={set("title")} placeholder="Notice title" />
            </div>
            <div className="space-y-1.5">
              <Label>Content</Label>
              <Textarea value={form.content} onChange={set("content")} placeholder="Notice details…" className="min-h-[80px]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input value={form.category} onChange={set("category")} placeholder="e.g. Academic, Sports" />
              </div>
              <div className="space-y-1.5">
                <Label>Attachment URL</Label>
                <Input value={form.attachmentUrl} onChange={set("attachmentUrl")} placeholder="https://…" />
              </div>
              <div className="space-y-1.5">
                <Label>Publish Date</Label>
                <Input type="date" value={form.publishedAt} onChange={set("publishedAt")} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Date</Label>
                <Input type="date" value={form.expiresAt} onChange={set("expiresAt")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Save Changes" : "Post Notice"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete notice?</AlertDialogTitle><AlertDialogDescription>This will remove the notice permanently.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { deleteMut.mutate({ id: deleteId! }, { onSuccess: () => { setDeleteId(null); toast({ title: "Notice deleted" }); } }); }} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ComingSoonPanel({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 max-w-7xl mx-auto">
      <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center">
        <Megaphone className="h-8 w-8 text-slate-400" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-700">{title}</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-xs">{sub}</p>
      </div>
      <span className="text-xs font-medium px-3 py-1 rounded-full bg-slate-100 text-slate-500">Coming Soon</span>
    </div>
  );
}

export default function Communication() {
  const search = useSearch();
  const tab = new URLSearchParams(search).get("tab") ?? "announcements";

  if (tab === "noticeboard") return <NoticeboardTab />;
  if (tab === "sms")         return <ComingSoonPanel title="SMS Alerts" sub="Send bulk SMS notifications to students, parents, and staff." />;
  if (tab === "email")       return <ComingSoonPanel title="Email Broadcast" sub="Compose and send email communications to selected groups." />;
  if (tab === "parents")     return <ComingSoonPanel title="Parent Messaging" sub="Direct messaging portal for parent-school communication." />;
  return <AnnouncementsTab />;
}
