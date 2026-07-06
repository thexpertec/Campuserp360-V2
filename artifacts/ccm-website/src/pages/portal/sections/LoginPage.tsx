import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { GraduationCap, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portalLogin, type PortalLoginResponse } from "../api";

export default function LoginPage({ onLogin }: { onLogin: (r: PortalLoginResponse) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Please enter your email/phone and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const response = await portalLogin(username.trim(), password);
      onLogin(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12 bg-[#faf7ee]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-3">
            <GraduationCap className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-bold text-primary">🎓 CCM Candidate Portal</h1>
          <p className="text-foreground/65 text-sm mt-1">Cadet College Murree — Punjab, Pakistan</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4"
          data-testid="login-form"
        >
          <h2 className="text-xl font-bold text-primary">Sign In</h2>

          <div className="space-y-1.5">
            <Label htmlFor="login-user">Email or Phone Number</Label>
            <Input
              id="login-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. hamza@example.com"
              data-testid="login-username"
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-pass">Password</Label>
            <Input
              id="login-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              data-testid="login-password"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="w-full bg-primary hover:bg-primary/90" data-testid="login-submit" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRight className="w-4 h-4 ml-1" />}
            {loading ? "Signing in…" : "Login"}
          </Button>
        </form>

        <div className="mt-5 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <h5 className="text-emerald-800 font-bold text-sm mb-2">🧪 Demo Accounts</h5>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-emerald-100 text-emerald-900">
                <th className="text-left px-2 py-1">Email</th>
                <th className="text-left px-2 py-1">Password</th>
                <th className="text-left px-2 py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-1"><code className="bg-emerald-100 px-1.5 py-0.5 rounded">hamza@example.com</code></td>
                <td className="px-2 py-1"><code className="bg-emerald-100 px-1.5 py-0.5 rounded">12345</code></td>
                <td className="px-2 py-1">✅ Selected (Merit #1)</td>
              </tr>
              <tr>
                <td className="px-2 py-1"><code className="bg-emerald-100 px-1.5 py-0.5 rounded">ali@example.com</code></td>
                <td className="px-2 py-1"><code className="bg-emerald-100 px-1.5 py-0.5 rounded">12345</code></td>
                <td className="px-2 py-1">📅 Test Scheduled</td>
              </tr>
              <tr>
                <td className="px-2 py-1"><code className="bg-emerald-100 px-1.5 py-0.5 rounded">fawad@example.com</code></td>
                <td className="px-2 py-1"><code className="bg-emerald-100 px-1.5 py-0.5 rounded">12345</code></td>
                <td className="px-2 py-1">❌ Not Selected</td>
              </tr>
            </tbody>
          </table>
          <p className="text-[11px] text-emerald-800 mt-2">
            Default password for all new accounts is <code className="bg-emerald-100 px-1 rounded">12345</code>. Change it after first login.
          </p>
        </div>

        <p className="text-center text-xs text-foreground/60 mt-4">
          Don't have an account? Complete the{" "}
          <Link href="/admissions" className="text-primary font-semibold hover:underline">
            Online Application
          </Link>{" "}
          first — your credentials are provided on completion.
        </p>
      </motion.div>
    </div>
  );
}
