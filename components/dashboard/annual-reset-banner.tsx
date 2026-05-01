"use client";

import { useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { TODAY } from "@/lib/mock-data";

export function AnnualResetBanner() {
  const { currentUser, pushToast } = useStore();
  const [dismissed, setDismissed] = useState(false);

  // Visible only May 25 onward and to HR/founder. We're April 28 so simulate banner anyway.
  const isHr = currentUser.role === "hr" || currentUser.role === "founder";
  if (!isHr || dismissed) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 p-4 sm:p-5 flex items-start sm:items-center gap-4">
      <div className="h-10 w-10 grid place-items-center rounded-xl bg-amber-100 text-amber-700 shrink-0">
        <CalendarClock className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-amber-900">
          Annual reset upcoming
        </div>
        <div className="text-[12.5px] text-amber-900/80">
          FY 2026 – 27 begins June 1. Run the reset on or after May 25 to roll over balances. Comp-offs are not affected.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="bg-white/60"
          onClick={() =>
            pushToast({
              title: "Run reset opens May 25",
              body: "Today is " + TODAY + ". The action will unlock from May 25.",
              variant: "info",
            })
          }
        >
          Run reset
        </Button>
        <button
          onClick={() => setDismissed(true)}
          className="h-8 w-8 grid place-items-center rounded-md text-amber-900/60 hover:bg-amber-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
