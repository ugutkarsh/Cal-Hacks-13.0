"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";

interface AuthPanelProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
  /** Which form to show when the panel opens. */
  initialMode?: Mode;
}

export function AuthPanel({
  open,
  onClose,
  onAuthenticated,
  initialMode = "sign-in",
}: AuthPanelProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError(null);
    setInfo(null);
  }, [open, initialMode]);

  if (!open) return null;

  function friendlyAuthError(message: string): string {
    const m = message.toLowerCase();
    if (m.includes("rate limit") || m.includes("email rate")) {
      return "Too many signup emails from Supabase just now. Wait a minute, or in Supabase → Authentication → Providers → Email turn off “Confirm email” for the demo, then try again (or Sign in if the account already exists).";
    }
    if (m.includes("already registered") || m.includes("already been registered")) {
      return "That email already has an account — use Sign in instead.";
    }
    if (m.includes("invalid login") || m.includes("invalid credentials")) {
      return "Email or password is incorrect.";
    }
    return message;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const client = getSupabaseBrowserClient();
    if (!client) {
      setError("Supabase is not configured in this environment.");
      return;
    }
    if (!email.trim() || password.length < 6) {
      setError("Use a valid email and a password of at least 6 characters.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "sign-up") {
        const { data, error: signError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName.trim() || undefined,
            },
          },
        });
        if (signError) {
          setError(friendlyAuthError(signError.message));
          return;
        }
        if (data.session) {
          onAuthenticated();
          onClose();
          return;
        }
        setInfo(
          "Check your email to confirm your account, then sign in. (For the hackathon demo: Supabase → Auth → Email → disable Confirm email so signup works without sending mail.)",
        );
        setMode("sign-in");
        return;
      }

      const { error: signError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signError) {
        setError(friendlyAuthError(signError.message));
        return;
      }
      onAuthenticated();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close sign in"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-t-3xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2
            id="auth-title"
            className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--foreground)]"
          >
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={submit} className="space-y-3 p-4">
          <p className="text-xs text-[var(--muted)]">
            Profiles are tied to your Supabase Auth user. We never show your
            email or exact home location on the map.
          </p>

          {mode === "sign-up" && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--foreground)]">
                Display name
              </span>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex"
                maxLength={80}
                autoComplete="nickname"
              />
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--foreground)]">
              Email
            </span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--foreground)]">
              Password
            </span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
            />
          </label>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-lg bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--muted)]">
              {info}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy
              ? "Working…"
              : mode === "sign-in"
                ? "Sign in"
                : "Create account"}
          </Button>

          <button
            type="button"
            className="w-full text-center text-xs text-[var(--muted)] underline-offset-2 hover:underline"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setError(null);
              setInfo(null);
            }}
          >
            {mode === "sign-in"
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
