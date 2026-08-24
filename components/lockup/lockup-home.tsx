import Link from 'next/link'
import { ArrowRight, Box, Clapperboard, QrCode } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'

/**
 * The Lockup entry fork: one question, two doors. "Get equipment" opens the
 * gear browser; "Plan a shoot" opens the wizard. Deliberately nothing else
 * here for now (the "with me" strip etc. is deferred) — the old tab surfaces
 * stay reachable at /lockup?tab=….
 */
export function LockupHome() {
  return (
    <div>
      <PageHeader title="Lockup" subtitle="Equipment, studios and shoots for the whole team." />
      <div className="px-5 lg:px-8 py-6 lg:py-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
          <div className="text-center space-y-1">
            <h2 className="text-[22px] lg:text-[26px] font-extrabold tracking-tight">
              What do you want to do?
            </h2>
            <p className="text-[13.5px] text-muted-foreground">Two ways in. Pick one.</p>
          </div>

          <div className="grid w-full gap-4 sm:grid-cols-2">
            <Link
              href="/lockup?tab=gear"
              className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary">
                <Box className="h-6 w-6 text-primary-foreground" />
              </div>
              <div className="space-y-1">
                <div className="text-[18px] font-bold">Get equipment</div>
                <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                  Browse the cupboard, take what you need, return with one tap. Kits included.
                </p>
              </div>
              <span className="mt-auto flex items-center gap-2 text-[14px] font-semibold text-primary">
                Browse gear
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>

            <Link
              href="/lockup/shoots/new"
              className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-foreground">
                <Clapperboard className="h-6 w-6 text-background" />
              </div>
              <div className="space-y-1">
                <div className="text-[18px] font-bold">Plan a shoot</div>
                <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                  Name it, book a studio, reserve the gear. Add your editors as you go.
                </p>
              </div>
              <span className="mt-auto flex items-center gap-2 text-[14px] font-semibold text-primary">
                Start planning
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </div>

          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <QrCode className="h-4 w-4" />
            Holding an item? Scan its sticker to take or return it.
          </p>
        </div>
      </div>
    </div>
  )
}
