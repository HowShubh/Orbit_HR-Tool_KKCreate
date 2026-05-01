"use client";

import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left: brand */}
      <div className="hidden lg:flex flex-1 bg-sidebar text-white p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[480px] w-[480px] rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-lg">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="text-lg font-semibold">Orbit HR</div>
        </div>
        <div className="relative">
          <h1 className="text-4xl font-semibold tracking-tight leading-tight max-w-md">
            People ops at KK Create — without the spreadsheet shuffle.
          </h1>
          <p className="mt-4 text-white/70 max-w-md">
            Apply for leave, request comp-offs, and see who's on what — all in one place.
          </p>
        </div>
        <div className="relative grid grid-cols-3 gap-3 max-w-md text-[12px] text-white/60">
          <div>
            <div className="text-2xl font-semibold text-white">42</div>
            <div>People</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-white">4</div>
            <div>Teams</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-white">100%</div>
            <div>Audited</div>
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-lg">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="text-lg font-semibold">Orbit HR</div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sign in with your KK Create Google account to continue.
            </p>
          </div>
          <Button
            size="lg"
            variant="outline"
            className="w-full h-12 text-[14px]"
            onClick={() => router.push("/")}
          >
            <GoogleMark />
            Continue with Google
          </Button>
          <div className="rounded-xl border border-dashed border-border bg-card p-4 text-[12.5px] text-muted-foreground leading-relaxed">
            Only emails on the <span className="font-semibold text-foreground">@kkcreate.com</span> domain
            can sign in. New here? Ask HR to set you up.
          </div>
          <div className="text-[11.5px] text-muted-foreground/70 text-center">
            By continuing you agree to KK Create's internal data policy.
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
