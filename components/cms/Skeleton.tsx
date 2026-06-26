import { cn } from "@/lib/utils"

// Generalized loading skeletons for the admin/app surfaces. Use these instead of
// "Loading…" text anywhere content is being fetched.

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-[color:var(--ed-hair)]", className)} />
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const w = ["w-full", "w-11/12", "w-3/4", "w-5/6", "w-2/3", "w-1/2"]
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3", w[i % w.length])} />
      ))}
    </div>
  )
}

/** A stack of full-width bars — for lists / rows of items. */
export function SkeletonList({ rows = 6, height = "h-9", className }: { rows?: number; height?: string; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn(height, "w-full")} />
      ))}
    </div>
  )
}

/** A bordered table shell with a header bar and shimmering rows. */
export function SkeletonTable({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("overflow-hidden border-t border-[color:var(--ed-hair)]", className)} role="status" aria-label="Loading">
      <div className="h-9 w-full bg-[color:var(--ed-surface)]" />
      <div className="divide-y divide-[color:var(--ed-hair)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/5" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** A grid of stat-card placeholders. */
export function SkeletonStats({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)} role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-[6px]" />
      ))}
    </div>
  )
}
