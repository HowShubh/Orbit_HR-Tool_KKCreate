import Link from 'next/link'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Compass className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-[18px] font-semibold tracking-tight">Page not found</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          The page you’re looking for doesn’t exist or has moved.
        </p>
        <div className="mt-6 flex items-center justify-center">
          <Button asChild>
            <Link href="/">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
