import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setToken, setUser } from "@/lib/auth";
import { useAdminLogin } from "@workspace/api-client-react";
import { Shield, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loginMutation = useAdminLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    setErrorMsg(null);
    loginMutation.mutate({ data: values }, {
      onSuccess: (session) => {
        setToken(session.token);
        setUser(session.user);
        setLocation("/");
      },
      onError: (error: any) => {
        if (error.status === 401) {
          setErrorMsg("Invalid username or password. Please try again.");
        } else {
          setErrorMsg("An error occurred during sign in.");
        }
      }
    });
  };

  return (
    <div className="flex min-h-screen w-full bg-background relative overflow-hidden">
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 -mr-48 -mt-48 w-96 h-96 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-48 -mb-48 w-96 h-96 rounded-full bg-accent/5 blur-3xl pointer-events-none" />

      <div className="m-auto flex w-full max-w-md flex-col justify-center px-4 sm:px-6 lg:px-8 z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="h-20 w-20 rounded-2xl bg-card border border-border shadow-xl flex items-center justify-center mb-6">
            <img src="/logo.png" alt="CCM Logo" className="h-14 w-14 object-contain" />
          </div>
          <h2 className="mt-2 text-center text-3xl font-heading font-bold tracking-tight text-foreground">
            Cadet College Murree
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" /> Operations Console
          </p>
        </div>

        <div className="bg-card px-8 py-10 shadow-2xl sm:rounded-xl border border-border/50">
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            
            {errorMsg && (
              <Alert variant="destructive" className="py-3">
                <AlertDescription className="text-sm font-medium">{errorMsg}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium text-foreground">Username</Label>
                <div className="mt-1">
                  <Input
                    id="username"
                    autoComplete="username"
                    placeholder="Enter your username"
                    className="h-11"
                    {...form.register("username")}
                  />
                </div>
                {form.formState.errors.username && (
                  <p className="text-xs text-destructive">{form.formState.errors.username.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-foreground">Password</Label>
                <div className="mt-1">
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-11"
                    {...form.register("password")}
                  />
                </div>
                {form.formState.errors.password && (
                  <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold shadow-md transition-all hover:translate-y-[-1px] active:translate-y-[1px]"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Sign in to Dashboard"
              )}
            </Button>
            
          </form>
        </div>
        
        <p className="mt-8 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Cadet College Murree. All rights reserved.
        </p>
      </div>
    </div>
  );
}
