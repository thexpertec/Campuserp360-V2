import { ReactNode } from "react";
import { Redirect } from "wouter";
import { getToken } from "@/lib/auth";
import { TopBar, MainMenu, SubMenu } from "./HeaderSidebar";
import { useGetAdminMe, getGetAdminMeQueryKey } from "@workspace/api-client-react";

function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { data: user, error } = useGetAdminMe({
    query: { queryKey: getGetAdminMeQueryKey(), retry: false },
  });

  if (error && (error as any).status === 401) return <Redirect to="/login" />;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      <TopBar user={user} />
      <MainMenu />
      <SubMenu />
      <main className="flex-1 overflow-y-auto p-5 md:p-7">
        {children}
      </main>
    </div>
  );
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const token = getToken();
  if (!token) return <Redirect to="/login" />;
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
