"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Gem } from "lucide-react";
import { getSession, login } from "@/lib/admin-api";
import { loginSchema } from "@/lib/schemas";
import { useAuth } from "@/components/auth-provider";
import { ADMIN_PASSWORD, DEMO_LOGINS } from "@/lib/auth-config";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

export default function LoginPage() {
  const router = useRouter();
  const { staff, loading, setSession } = useAuth();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!loading && staff) router.replace("/");
  }, [loading, staff, router]);

  async function submit(nextEmail = email, nextPassword = password) {
    const parsed = loginSchema.safeParse({ email: nextEmail, password: nextPassword });
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      setErrors({ email: f.email?.[0], password: f.password?.[0] });
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const u = await login(parsed.data.email, parsed.data.password);
      const session = await getSession();
      setSession(session);
      toast.success(`Welcome, ${u.first_name || u.email}`);
      router.replace("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  function quickLogin(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(ADMIN_PASSWORD);
    submit(demoEmail, ADMIN_PASSWORD);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-forest p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/15">
            <Gem className="size-5" />
          </span>
          <span className="text-lg font-extrabold tracking-tight">SOIS</span>
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl font-bold leading-tight">
            Back-office for your sterling-silver store.
          </h2>
          <p className="max-w-md text-sm text-sage-dark/90">
            Catalog, inventory, orders, returns, shipping and refunds — with
            role-based access for your whole team.
          </p>
        </div>
        <p className="text-xs text-white/50">925 · Rhodium-plated · BIS Hallmarked</p>
      </div>

      <div className="flex items-center justify-center bg-canvas px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-ink">Staff sign in</h1>
          <p className="mt-1 text-sm text-muted">
            Enter your credentials, or use a demo role below.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="mt-8 space-y-4"
          >
            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="owner@sois.in"
                value={email}
                invalid={!!errors.email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                invalid={!!errors.password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full" loading={submitting}>
              Sign in
            </Button>
          </form>

          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold text-faint">
              Demo roles (password: {ADMIN_PASSWORD})
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_LOGINS.map((d) => (
                <button
                  key={d.email}
                  onClick={() => quickLogin(d.email)}
                  disabled={submitting}
                  className="rounded-lg border border-line-strong bg-white px-3 py-2 text-left transition-colors hover:border-forest disabled:opacity-60"
                >
                  <span className="block text-xs font-bold capitalize text-ink">
                    {d.role.replace(/_/g, " ")}
                  </span>
                  <span className="block truncate text-[11px] text-faint">
                    {d.email}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
