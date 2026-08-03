import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

const STEPS = ["레지멘 선택", "환자 정보", "레지멘 확인", "오더 스케줄", "완료"]

export function StepHeader({ current }: { current: number }) {
  return (
    <header className="no-print border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-sm font-bold">Rx</span>
          </div>
          <h1 className="text-balance text-lg font-semibold text-foreground">항암 레지멘 스케줄러</h1>
        </div>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {STEPS.map((label, i) => {
            const step = i + 1
            const done = step < current
            const active = step === current
            return (
              <li key={label} className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1 text-sm transition-colors",
                    active && "bg-primary text-primary-foreground",
                    done && "bg-accent text-accent-foreground",
                    !active && !done && "bg-muted text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
                      active && "bg-primary-foreground text-primary",
                      done && "bg-accent-foreground/15 text-accent-foreground",
                      !active && !done && "bg-background text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : step}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {i < STEPS.length - 1 && <span className="text-muted-foreground/40">›</span>}
              </li>
            )
          })}
        </ol>
      </div>
    </header>
  )
}
