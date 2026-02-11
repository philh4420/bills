"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth/client";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, ownerLoading, isOwner, authError, ownerError, signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !ownerLoading && user && isOwner) {
      router.replace("/dashboard");
    }
  }, [loading, ownerLoading, user, isOwner, router]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 md:px-6">
      <div className="grid w-full gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="panel p-8 md:p-10">
          <p className="text-[0.68rem] uppercase tracking-[0.24em] text-[var(--ink-soft)]">Owner Access</p>
          <h1 className="mt-3 text-3xl font-semibold text-[var(--ink-main)] md:text-4xl">Secure finance workspace</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--ink-soft)] md:text-base">
            Access is restricted to the configured owner account set by <code>OWNER_UID</code> or{" "}
            <code>OWNER_GOOGLE_EMAIL</code>. Once signed in, you can manage imports, monthly payments, cards, bills,
            and purchases.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--ring)] bg-white/70 px-4 py-3">
              <p className="label">Data backend</p>
              <p className="mt-2 text-sm text-[var(--ink-main)]">Firestore + typed APIs</p>
            </div>
            <div className="rounded-xl border border-[var(--ring)] bg-white/70 px-4 py-3">
              <p className="label">Formula behavior</p>
              <p className="mt-2 text-sm text-[var(--ink-main)]">Workbook parity retained</p>
            </div>
          </div>
        </section>

        <section className="panel p-8">
          <p className="label">Sign in</p>
          <h2 className="mt-2 text-2xl font-semibold">Google authentication</h2>
          <button
            className="button-primary mt-6 w-full"
            disabled={loading}
            onClick={async () => {
              setError(null);
              try {
                await signInWithGoogle();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Sign in failed");
              }
            }}
            type="button"
          >
            Continue with Google
          </button>

          {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
          {!error && authError ? <p className="mt-4 text-sm text-red-700">{authError}</p> : null}
          {!error && !authError && ownerError ? (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {ownerError}
            </div>
          ) : null}
          <p className="mt-5 text-xs text-[var(--ink-soft)]">
            If popup sign-in is blocked by your browser, redirect sign-in is used automatically.
          </p>
        </section>
      </div>
    </main>
  );
}
