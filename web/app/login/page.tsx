"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { login } from "@/lib/auth";
import NamasteBoy from "@/components/NamasteBoy";

// Split screen: a blue welcome panel on the left, a white sign-in form on the right (stacked on a phone).
// Fields are underlined; the form side stays light in dark mode too.
const field = "flex items-center gap-3 border-b border-slate-300 py-3 transition focus-within:border-[#2b2bc0]";
const inputCls = "w-full bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400";

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
    <main className="grid min-h-screen bg-white text-slate-900 lg:grid-cols-2">
      {/* welcome panel */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,#0c0b5d_0%,#090851_55%,#06053a_100%)] px-8 py-8 text-white sm:px-14 sm:py-10 lg:min-h-screen lg:px-20 lg:py-16">
        {/* faint arcs, like the reference */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]" viewBox="0 0 400 600" preserveAspectRatio="xMidYMax slice" fill="none" stroke="#fff" strokeWidth="1">
          {[0, 1, 2, 3, 4].map((i) => (
            <path key={i} d={`M ${-40 + i * 26} 640 Q ${120 + i * 40} ${150 + i * 25} ${330 + i * 22} -20`} />
          ))}
        </svg>

        <div className="relative">
          {/* the player alone, no tile; the navy mark is turned white so it reads on the blue panel */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="Unique Futsal" className="h-20 w-auto brightness-0 invert sm:h-24" />
          <h2 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:mt-8 sm:text-6xl lg:mt-14">
            Hello
            <br />
            Unique Futsal!
          </h2>
          <p className="mt-6 max-w-md text-lg leading-snug text-white/85 sm:mt-8 sm:text-xl">
            Run the venue: bookings, payments, members and more. Everything your team needs, in one place.
          </p>
        </div>

        <p className="relative mt-10 hidden text-lg text-white/60 lg:block">© {new Date().getFullYear()} Unique Futsal. All rights reserved.</p>
      </section>

      {/* sign-in form */}
      <section className="relative flex flex-col justify-start px-8 pb-24 pt-12 sm:px-14 lg:px-24 lg:pt-16">
        <div className="mx-auto w-full max-w-sm">
          <header className="mt-10 lg:mt-0">
            <NamasteBoy className="-ml-2 mb-2" />
            <h1 className="text-[34px] font-extrabold tracking-tight">Welcome Back!</h1>
            <p className="mt-2 text-sm text-slate-500">Sign in with your staff email and password.</p>
          </header>

          <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
            <div>
              <label className={`${field} ${emailBad ? "!border-red-400" : ""}`}>
                <Mail size={18} className={emailBad ? "text-red-400" : "text-slate-400"} />
                <input className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" aria-invalid={emailBad} />
              </label>
              {emailBad && <p className="mt-1.5 text-sm font-medium text-red-500">That email doesn&apos;t look right</p>}
            </div>

            <label className={field}>
              <Lock size={18} className="text-slate-400" />
              <input className={inputCls} type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="Password" />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="p-1 text-slate-400">
                {show ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </label>

            {forgot && (
              <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600" role="status">
                Ask the owner to set a new password for you under <b>Staff</b>. Then sign in with it here.
              </p>
            )}

            {error && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600" role="alert">{error}</p>}

            <button
              disabled={busy || !email.trim() || !password}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0c0b5d] py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#090851] disabled:opacity-50"
            >
              {busy ? <><Loader2 size={18} className="animate-spin" /> Signing in…</> : "Login Now"}
            </button>

            <p className="pt-1 text-center text-sm text-slate-500">
              Forgot password?{" "}
              <button type="button" onClick={() => setForgot((v) => !v)} className="font-semibold text-slate-900 underline underline-offset-2">Click here</button>
            </p>
          </form>
        </div>
        <p className="absolute inset-x-0 bottom-5 text-center text-sm font-bold text-[#0c0b5d]">Designed &amp; developed by Rahish Dumre</p>
      </section>
    </main>
  );
}
