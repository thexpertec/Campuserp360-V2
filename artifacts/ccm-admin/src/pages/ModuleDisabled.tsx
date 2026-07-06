import { LockKeyhole } from "lucide-react";
import { Link } from "wouter";

export default function ModuleDisabled({ moduleName }: { moduleName?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8">
      <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-2">
        <LockKeyhole className="h-8 w-8 text-slate-400" />
      </div>
      <h1 className="text-xl font-bold text-slate-800">Module Not Enabled</h1>
      <p className="text-sm text-slate-500 text-center max-w-sm">
        {moduleName ? (
          <>The <strong>{moduleName}</strong> module is not enabled for your institution.</>
        ) : (
          "This module is not enabled for your institution."
        )}{" "}
        Contact your SaaS administrator to enable it.
      </p>
      <Link href="/">
        <a className="mt-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 transition-colors">
          Return to Dashboard
        </a>
      </Link>
    </div>
  );
}
