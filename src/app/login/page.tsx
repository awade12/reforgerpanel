"use client";

import { useEffect, useState } from "react";
import { ArrowRightIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { PANEL_LOGIN_MONO, PANEL_PRODUCT_NAME } from "@/lib/shared/panel-brand";

const capabilities = [
  "Deploy and restart dedicated instances",
  "Install and update game builds via SteamCMD",
  "Manage missions, ports, and BattlEye config",
];

export default function LoginPage() {
  const [mode, setMode] = useState<"email" | "legacy">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/setup-status");
        const data = (await res.json()) as { needsSetup?: boolean; legacyPassword?: boolean };
        if (data.needsSetup) {
          window.location.assign("/setup");
          return;
        }
        setMode(data.legacyPassword ? "legacy" : "email");
      } catch {
        setMode("legacy");
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body = mode === "email" ? { email, password } : { password };
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? (mode === "email" ? "Invalid email or password" : "Invalid password"));
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Login failed — check your connection and try again");
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
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative flex flex-col justify-between border-b border-border bg-sidebar px-8 py-10 sm:px-12 lg:border-b-0 lg:border-r lg:px-16 lg:py-14">
        <div className="font-mono text-[11px] text-muted-foreground">
          <span className="text-foreground">{PANEL_LOGIN_MONO}</span>
          <span className="mx-2 opacity-40">/</span>
          <span>{PANEL_PRODUCT_NAME}</span>
        </div>

        <div className="my-auto max-w-xl py-16 lg:py-24">
          <h1 className="max-w-[12ch] text-[clamp(2.75rem,7vw,4.75rem)] leading-[0.92] font-semibold tracking-[-0.045em] text-foreground">
            Server control, on your metal.
          </h1>
          <p className="mt-8 max-w-md text-[15px] leading-7 text-muted-foreground">
            Run Arma Reforger dedicated servers on your VPS — instances, game installs, and ops in one place.
          </p>

          <ul className="mt-12 space-y-3 border-t border-border pt-8">
            {capabilities.map((item, index) => (
              <li key={item} className="flex items-start gap-4 text-sm text-muted-foreground">
                <span className="mt-0.5 w-6 shrink-0 font-mono text-[11px] opacity-50">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="leading-6">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="font-mono text-[11px] text-muted-foreground opacity-60">Localhost agent · systemd · SteamCMD</p>
      </section>

      <section className="flex items-center bg-background px-8 py-12 sm:px-12 lg:px-16">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <p className="font-mono text-[11px] text-muted-foreground">Authentication</p>
            <h2 className="mt-3 text-2xl font-medium tracking-[-0.03em] text-foreground">Sign in</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {mode === "email"
                ? "Sign in with your panel account."
                : "Use the admin password set in your host environment."}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-8">
            {mode === "email" && (
              <div className="space-y-3">
                <label htmlFor="email" className="block font-mono text-[11px] uppercase text-muted-foreground">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="w-full border-b border-border bg-transparent py-3 text-lg text-foreground outline-none focus:border-foreground"
                />
              </div>
            )}

            <div className="space-y-3">
              <label htmlFor="password" className="block font-mono text-[11px] uppercase text-muted-foreground">
                Password
              </label>
              <div
                className={cn(
                  "relative border-b border-border focus-within:border-foreground",
                  error && "border-destructive/60 focus-within:border-destructive",
                )}
              >
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  autoFocus={mode === "legacy"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className={cn(
                    "w-full border-0 bg-transparent py-3 pr-10 text-lg text-foreground outline-none",
                    "placeholder:text-muted-foreground/50",
                    error && "text-destructive",
                  )}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={loading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute top-1/2 right-0 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <Button
              type="submit"
              disabled={loading || !password.trim() || (mode === "email" && !email.trim())}
              className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Spinner className="text-primary-foreground" />
                  Signing in
                </>
              ) : (
                <>
                  Continue
                  <ArrowRightIcon className="size-4" />
                </>
              )}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
