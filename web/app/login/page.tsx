"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { login } from "@/lib/auth";

// A pill-shaped field with its icon on the left, as on the customer app.
const field = "flex items-center gap-3 rounded-full border border-line bg-surface px-5 py-3.5 transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30";
const inputCls = "w-full bg-transparent text-[15px] outline-none placeholder:text-muted";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const emailBad = email.trim().length > 0 && !/^\S+@\S+\.\S+$/.test(email.trim());

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* brand banner */}
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0c0b5d] via-[#1a1a8f] to-[#3f3fd1] p-6 text-white shadow-[0_18px_40px_-18px_rgba(12,11,93,0.8)]">
          <p className="text-3xl font-extrabold leading-none tracking-tight">Unique<span className="text-[#ffb35c]">.</span></p>
          <p className="mt-0.5 text-3xl font-extrabold leading-none tracking-tight text-[#ffb35c]">Futsal</p>
          <p className="mt-3 text-sm text-white/85">Run the venue: bookings, payments,<br />members and more.</p>
          <span className="mt-3 inline-block rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#0c0b5d]">Staff and admin portal</span>
        </div>

        <header className="text-center">
          <h1 className="text-[28px] font-extrabold tracking-tight">Welcome Back</h1>
          <p className="mt-1 text-sm text-muted">Sign in with your staff email and password.</p>
        </header>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <label className={`${field} ${emailBad ? "!border-red-400 ring-2 ring-red-300/50" : ""}`}>
              <Mail size={18} className={emailBad ? "text-red-400" : "text-muted"} />
              <input className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" aria-invalid={emailBad} />
            </label>
            {emailBad && <p className="mt-1.5 px-5 text-sm font-medium text-red-500">That email doesn&apos;t look right</p>}
          </div>

          <label className={field}>
            <Lock size={18} className="text-muted" />
            <input className={inputCls} type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="Password" />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="p-1 text-muted">
              {show ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </label>

          <div className="flex justify-end px-1">
            <button type="button" onClick={() => setForgot((v) => !v)} className="text-sm font-semibold text-brand">Forgot Password?</button>
          </div>
          {forgot && (
            <p className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted" role="status">
              Ask the owner to set a new password for you under <b>Staff</b>. Then sign in with it here.
            </p>
          )}

          {error && <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-600" role="alert">{error}</p>}

          <button
            disabled={busy || !email.trim() || !password}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#0c0b5d] to-[#3f3fd1] py-4 text-base font-semibold text-white shadow-[0_12px_28px_-10px_rgba(12,11,93,0.7)] transition disabled:opacity-50"
          >
            {busy ? <><Loader2 size={18} className="animate-spin" /> Signing in…</> : "Log In"}
          </button>
        </form>
      </div>
    </main>
  );
}
