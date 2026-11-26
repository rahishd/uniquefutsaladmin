"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { login } from "@/lib/auth";
import NamasteBoy from "@/components/NamasteBoy";

// Split screen: a blue welcome panel on the left, a white sign-in form on the right (stacked on a phone).
// Fields are underlined; the form side stays light in dark mode too.
const field = "flex items-center gap-3 border-b border-slate-300 py-2 transition lg:py-3 focus-within:border-[#2b2bc0]";
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
      const who = await login(email.trim(), password);
      router.replace(who.role === "organizer" ? "/organizer" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-white text-slate-900 lg:grid lg:h-auto lg:min-h-screen lg:grid-cols-2 lg:overflow-visible">
      {/* welcome panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,#0c0b5d_0%,#090851_55%,#06053a_100%)] px-5 py-3 text-white sm:px-14 sm:py-5 lg:flex lg:min-h-screen lg:px-20 lg:py-16">

        {/* desktop: the large welcome panel */}
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
      <section className="relative flex min-h-0 flex-1 flex-col justify-start px-8 pb-3 pt-2 sm:px-14 lg:flex-none lg:justify-start lg:px-24 lg:pb-24 lg:pt-16">
        {/* phone: no blue box. The name on the left, only the logo at the top right, "Admin Portal" big below */}
        <div className="shrink-0 pb-2 pt-[max(env(safe-area-inset-top),1.5rem)] lg:hidden">
          {/* the name sits just above "Admin Portal"; the bigger logo stands at the right and its feet line up with the text's baseline */}
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-extrabold leading-none tracking-tight text-[#0c0b5d]">Unique Futsal</p>
              <h2 className="mt-2 text-4xl font-extrabold leading-none tracking-tight text-[#0c0b5d]">Admin Portal</h2>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="Unique Futsal" className="mb-[8px] h-[4.5rem] w-auto shrink-0" />
          </div>
        </div>

        <div className="mx-auto w-full max-w-sm max-lg:my-auto">
          <header className="lg:mt-0">
            <NamasteBoy className="-ml-2 mb-1 max-lg:[&_svg]:!h-24" />
            <h1 className="text-2xl font-extrabold tracking-tight lg:text-[34px]">Welcome Back!</h1>
            <p className="mt-1 text-sm text-slate-500 lg:mt-2">Sign in with your staff email and password.</p>
          </header>

          <form onSubmit={submit} className="mt-3 space-y-3 lg:mt-8 lg:space-y-5" noValidate>
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
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0c0b5d] py-3 lg:mt-2 lg:py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#090851] disabled:opacity-50"
            >
              {busy ? <><Loader2 size={18} className="animate-spin" /> Signing in…</> : "Login Now"}
            </button>

            <p className="pt-1 text-center text-sm text-slate-500">
              Forgot password?{" "}
              <button type="button" onClick={() => setForgot((v) => !v)} className="font-semibold text-slate-900 underline underline-offset-2">Click here</button>
            </p>
          </form>
        </div>
        <p className="mt-3 text-center text-xs font-bold lg:absolute lg:inset-x-0 lg:bottom-5 lg:mt-0 lg:text-sm text-[#0c0b5d]">Designed &amp; developed by Rahish Dumre</p>
      </section>
    </main>
  );
}
