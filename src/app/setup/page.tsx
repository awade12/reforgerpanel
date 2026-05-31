"use client";

import { useEffect, useState } from "react";
import { ArrowRightIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export default function SetupPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/setup-status");
        const data = (await res.json()) as { needsSetup?: boolean; postgres?: boolean };
        if (!data.postgres) {
          window.location.assign("/login");
          return;
        }
        if (!data.needsSetup) {
          window.location.assign("/login");
          return;
        }
      } catch {
        setError("Cannot reach the host agent");
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined, password }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Setup failed");
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Setup failed — check your connection and try again");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <p className="font-mono text-[11px] text-muted-foreground">First-time setup</p>
        <h1 className="mt-3 text-3xl font-medium tracking-[-0.03em] text-foreground">Create master admin</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          PostgreSQL is connected. Create the first account to manage this panel.
        </p>

        <form onSubmit={submit} className="mt-10 space-y-6">
          <div className="space-y-2">
            <label htmlFor="email" className="block font-mono text-[11px] uppercase text-muted-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="w-full border-b border-border bg-transparent py-3 text-lg outline-none focus:border-foreground"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="name" className="block font-mono text-[11px] uppercase text-muted-foreground">
              Display name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              placeholder="Master Admin"
              className="w-full border-b border-border bg-transparent py-3 text-lg outline-none focus:border-foreground"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block font-mono text-[11px] uppercase text-muted-foreground">
              Password
            </label>
            <div className="relative border-b border-border focus-within:border-foreground">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full border-0 bg-transparent py-3 pr-10 text-lg outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute top-1/2 right-0 -translate-y-1/2 p-1 text-muted-foreground"
              >
                {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirm" className="block font-mono text-[11px] uppercase text-muted-foreground">
              Confirm password
            </label>
            <input
              id="confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading}
              className="w-full border-b border-border bg-transparent py-3 text-lg outline-none focus:border-foreground"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={loading || !email.trim() || !password} className="h-11 w-full">
            {loading ? (
              <>
                <Spinner />
                Creating account
              </>
            ) : (
              <>
                Create master admin
                <ArrowRightIcon className="size-4" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
