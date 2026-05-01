"use client";

import { CheckCircle2, X, AlertTriangle, Info } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const VARIANT_ICON = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  info: <Info className="h-4 w-4 text-blue-500" />,
  error: <AlertTriangle className="h-4 w-4 text-rose-500" />,
};

export function Toaster() {
  const { toasts, dismissToast } = useStore();

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 max-w-[360px]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "animate-fade-in flex items-start gap-3 rounded-xl bg-card border shadow-xl px-4 py-3"
          )}
        >
          <div className="mt-0.5">{VARIANT_ICON[t.variant ?? "info"]}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">{t.title}</div>
            {t.body && (
              <div className="text-[12.5px] text-muted-foreground">{t.body}</div>
            )}
          </div>
          <button
            onClick={() => dismissToast(t.id)}
            className="h-6 w-6 grid place-items-center rounded-md hover:bg-muted text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
