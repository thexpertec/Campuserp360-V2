import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Database, Download, RefreshCcw, Clock, CheckCircle2, AlertTriangle, Trash2, Sparkles, Loader2, ShieldCheck,
} from "lucide-react";

const TOKEN_KEY = "ccm_admin_token";

function authHeader(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type BackupFile = {
  filename: string;
  createdAt: string;
  sizeBytes: number;
  sizeMb: string;
};

import { formatDateTime } from "@/lib/locale";
function formatDate(iso: string) {
  return formatDateTime(iso);
}

export function BackupTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [seeding, setSeeding] = useState(false);

  const { data: backups = [], isLoading } = useQuery<BackupFile[]>({
    queryKey: ["backup-list"],
    queryFn: async () => {
      const res = await fetch("/api/admin/backup/list", { headers: authHeader() });
      if (!res.ok) throw new Error("Failed to load backups");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/backup/run", {
        method: "POST",
        headers: authHeader(),
      });
      if (!res.ok) throw new Error("Backup failed");
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["backup-list"] });
      toast({
        title: "Backup created",
        description: `${data.sizeMb} MB · ${data.totalRows} rows exported.`,
      });
    },
    onError: () => toast({ title: "Backup failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (filename: string) => {
      const res = await fetch(`/api/admin/backup/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backup-list"] });
      toast({ title: "Backup deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  function downloadBackup(filename: string) {
    const token = localStorage.getItem(TOKEN_KEY);
    const url = `/api/admin/backup/download/${encodeURIComponent(filename)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    // Pass auth via a short-lived object URL is not straightforward;
    // instead open in new tab with credentials via fetch-blob approach
    fetch(url, { headers: authHeader() })
      .then((r) => r.blob())
      .then((blob) => {
        const objUrl = URL.createObjectURL(blob);
        a.href = objUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
      })
      .catch(() => toast({ title: "Download failed", variant: "destructive" }));
  }

  async function runSeed() {
    setSeeding(true);
    try {
      const res = await fetch("/api/admin/dev/seed-all", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
      });
      if (!res.ok) throw new Error("Seed failed");
      toast({ title: "Demo data seeded", description: "Empty tables populated with sample data." });
    } catch {
      toast({ title: "Seed failed", description: "Could not reach API server.", variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  }

  const lastSuccess = backups[0];

  return (
    <div className="space-y-8">

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 shrink-0">
            <Database className="h-4 w-4 text-blue-700" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Backups</p>
            <p className="text-xl font-bold">{isLoading ? "…" : backups.length}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 shrink-0">
            <CheckCircle2 className="h-4 w-4 text-green-700" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last Backup</p>
            <p className="text-sm font-semibold leading-tight mt-0.5">
              {lastSuccess ? formatDate(lastSuccess.createdAt) : "None yet"}
            </p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 shrink-0">
            <ShieldCheck className="h-4 w-4 text-indigo-700" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Auto-backup</p>
            <p className="text-sm font-semibold leading-tight mt-0.5">Daily on startup</p>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-5 space-y-2">
        <p className="font-semibold text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-600" /> How backups work</p>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>Every server restart automatically creates a backup if the last one is more than 20 hours old.</li>
          <li>Backups are full JSON exports of all database tables — tenants, applicants, students, staff, fees, and more.</li>
          <li>The last <strong>7 backups</strong> are kept; older ones are pruned automatically.</li>
          <li>Download any backup as a <code>.json</code> file to keep a copy offline or in email.</li>
        </ul>
      </div>

      {/* Manual backup */}
      <div className="rounded-xl border bg-card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="font-semibold text-sm">Run Manual Backup Now</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Exports all database tables to a JSON file stored on the server. Download it below to keep a copy.
          </p>
        </div>
        <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} size="sm">
          {runMutation.isPending
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</>
            : <><RefreshCcw className="mr-2 h-4 w-4" /> Backup Now</>}
        </Button>
      </div>

      {/* Demo data seeder */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900 shrink-0">
            <Sparkles className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-sm">Load Demo Data</p>
            <p className="text-xs text-muted-foreground mt-0.5">Populates all empty tables with sample data. Already-filled tables are skipped.</p>
          </div>
        </div>
        <Button onClick={runSeed} disabled={seeding} size="sm" variant="outline" className="border-amber-300 hover:bg-amber-100 shrink-0">
          {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4 text-amber-600" />}
          {seeding ? "Seeding…" : "Load Demo Data"}
        </Button>
      </div>

      <Separator />

      {/* Backup history */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-semibold text-sm">Backup History</h3>
          <span className="text-xs text-muted-foreground">(last 7 kept automatically)</span>
        </div>

        <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date &amp; Time</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-center hidden sm:table-cell">Size</th>
                <th className="px-4 py-2.5 text-right w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground text-sm">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground text-sm">
                    No backups yet. The first auto-backup runs at next server restart.
                  </td>
                </tr>
              ) : backups.map((b) => (
                <tr key={b.filename} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{formatDate(b.createdAt)}</p>
                    <p className="text-xs text-muted-foreground font-mono">{b.filename}</p>
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground hidden sm:table-cell">
                    {b.sizeMb} MB
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Download" onClick={() => downloadBackup(b.filename)}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 text-amber-500" /> Delete this backup?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently removes the backup file from the server. You will not be able to recover it.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteMutation.mutate(b.filename)}
                            >Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
