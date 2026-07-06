import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { clearAuth } from "@/lib/auth";
import { Shield, Building2, LogOut, UserCog } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();

  const handleLogout = () => {
    clearAuth();
    setLocation("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center px-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-white">SaaS Admin</span>
          <span className="text-slate-600 text-sm">Tenant Management</span>
        </div>
        <nav className="flex items-center gap-1 ml-6">
          <Link
            href="/tenants"
            className={
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors " +
              (location === "/" || location.startsWith("/tenants")
                ? "text-white bg-slate-800"
                : "text-slate-300 hover:text-white hover:bg-slate-800")
            }
          >
            <Building2 className="h-4 w-4" />
            Tenants
          </Link>
          <Link
            href="/account"
            className={
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors " +
              (location.startsWith("/account")
                ? "text-white bg-slate-800"
                : "text-slate-300 hover:text-white hover:bg-slate-800")
            }
          >
            <UserCog className="h-4 w-4" />
            My Account
          </Link>
        </nav>
        <div className="ml-auto">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </header>
      <main className="p-6">
        {children}
      </main>
    </div>
  );
}
