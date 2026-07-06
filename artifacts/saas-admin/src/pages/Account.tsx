import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { api } from "@/lib/api";
import { clearAuth, getUser } from "@/lib/auth";
import { UserCog, Lock, User, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-300 mb-1">
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full px-3 py-2 rounded-lg bg-slate-800 border text-slate-100 text-sm " +
        "focus:outline-none focus:ring-2 focus:ring-indigo-500 " +
        (props.disabled
          ? "border-slate-700 text-slate-500 cursor-not-allowed "
          : "border-slate-700 hover:border-slate-600 ") +
        (props.className ?? "")
      }
    />
  );
}

function PasswordInput({
  id, value, onChange, placeholder, disabled,
}: {
  id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mt-3 px-3 py-2 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">
      {message}
    </div>
  );
}

function SuccessBox({ message }: { message: string }) {
  return (
    <div className="mt-3 px-3 py-2 rounded-lg bg-green-900/40 border border-green-700 text-green-300 text-sm flex items-center gap-2">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

export default function Account() {
  const [, setLocation] = useLocation();
  const user = getUser() as { username?: string; email?: string } | null;

  const [usernameForm, setUsernameForm] = useState({
    newUsername: user?.username ?? "",
    currentPassword: "",
  });
  const [usernameError, setUsernameError]   = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);
  const [usernameBusy, setUsernameBusy]     = useState(false);

  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [pwError, setPwError]     = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwBusy, setPwBusy]       = useState(false);

  async function handleUsernameSave(e: React.FormEvent) {
    e.preventDefault();
    setUsernameError(null);
    setUsernameSuccess(null);
    if (!usernameForm.newUsername.trim()) {
      setUsernameError("Username cannot be empty.");
      return;
    }
    if (!usernameForm.currentPassword) {
      setUsernameError("Current password is required to confirm the change.");
      return;
    }
    setUsernameBusy(true);
    try {
      await api.changeCredentials({
        currentPassword: usernameForm.currentPassword,
        newUsername: usernameForm.newUsername.trim(),
      });
      clearAuth();
      setLocation("/login");
    } catch (err: any) {
      setUsernameError(err?.message ?? "Failed to update username.");
    } finally {
      setUsernameBusy(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);
    if (!pwForm.currentPassword) {
      setPwError("Current password is required.");
      return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError("New passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await api.changeCredentials({
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
        confirmPassword: pwForm.confirmPassword,
      });
      clearAuth();
      setLocation("/login");
    } catch (err: any) {
      setPwError(err?.message ?? "Failed to update password.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-indigo-600/20 border border-indigo-600/40 flex items-center justify-center">
            <UserCog className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">My Account</h1>
            <p className="text-sm text-slate-400">Manage your super-admin credentials</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Email — read-only */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <User className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Identity</h2>
            </div>
            <div>
              <FieldLabel htmlFor="email">Email (cannot be changed)</FieldLabel>
              <Input
                id="email"
                type="email"
                value={user?.email ?? "—"}
                disabled
                readOnly
              />
              <p className="mt-1 text-xs text-slate-500">Email is locked and can only be changed by re-deploying with an updated secret.</p>
            </div>
          </div>

          {/* Username */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <User className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Change Username</h2>
            </div>
            <form onSubmit={handleUsernameSave} className="space-y-3">
              <div>
                <FieldLabel htmlFor="newUsername">New Username</FieldLabel>
                <Input
                  id="newUsername"
                  type="text"
                  value={usernameForm.newUsername}
                  onChange={(e) => setUsernameForm((f) => ({ ...f, newUsername: e.target.value }))}
                  autoComplete="username"
                />
              </div>
              <div>
                <FieldLabel htmlFor="usernameCurrentPw">Current Password (to confirm)</FieldLabel>
                <PasswordInput
                  id="usernameCurrentPw"
                  value={usernameForm.currentPassword}
                  onChange={(v) => setUsernameForm((f) => ({ ...f, currentPassword: v }))}
                  placeholder="Enter current password"
                />
              </div>
              {usernameError && <ErrorBox message={usernameError} />}
              {usernameSuccess && <SuccessBox message={usernameSuccess} />}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={usernameBusy}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  {usernameBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Username
                </button>
              </div>
            </form>
          </div>

          {/* Password */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Change Password</h2>
            </div>
            <form onSubmit={handlePasswordChange} className="space-y-3">
              <div>
                <FieldLabel htmlFor="currentPw">Current Password</FieldLabel>
                <PasswordInput
                  id="currentPw"
                  value={pwForm.currentPassword}
                  onChange={(v) => setPwForm((f) => ({ ...f, currentPassword: v }))}
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <FieldLabel htmlFor="newPw">New Password</FieldLabel>
                <PasswordInput
                  id="newPw"
                  value={pwForm.newPassword}
                  onChange={(v) => setPwForm((f) => ({ ...f, newPassword: v }))}
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <FieldLabel htmlFor="confirmPw">Confirm New Password</FieldLabel>
                <PasswordInput
                  id="confirmPw"
                  value={pwForm.confirmPassword}
                  onChange={(v) => setPwForm((f) => ({ ...f, confirmPassword: v }))}
                  placeholder="Repeat new password"
                />
              </div>
              {pwError && <ErrorBox message={pwError} />}
              {pwSuccess && <SuccessBox message={pwSuccess} />}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={pwBusy}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  {pwBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Change Password
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
