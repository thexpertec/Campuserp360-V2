import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isAuthenticated } from "@/lib/auth";
import Login from "@/pages/Login";
import Tenants from "@/pages/Tenants";
import TenantDetail from "@/pages/TenantDetail";
import Account from "@/pages/Account";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function ProtectedRoute({ component: Comp }: { component: React.ComponentType }) {
  if (!isAuthenticated()) {
    return <Redirect to="/login" />;
  }
  return <Comp />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <ProtectedRoute component={Tenants} />} />
      <Route path="/tenants" component={() => <ProtectedRoute component={Tenants} />} />
      <Route path="/tenants/:id" component={() => <ProtectedRoute component={TenantDetail} />} />
      <Route path="/account" component={() => <ProtectedRoute component={Account} />} />
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}
