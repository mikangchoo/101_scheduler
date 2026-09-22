"use client"

import { Check } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useFlow } from "@/contexts/flow-context"
import { isValidPatient } from "@/lib/calc"
import { findRegimen, getSelectedRegimenLabel, isAlloRegimen } from "@/lib/regimens"

interface StepDef {
  label: string
  href: string
}

const STEPS: StepDef[] = [
  { label: "레지멘 선택", href: "/" },
  { label: "환자 정보", href: "/patient" },
  { label: "레지멘 확인", href: "/regimen" },
  { label: "오더 스케줄", href: "/order" },
  { label: "완료", href: "/done" },
]

export function StepHeader({ current }: { current: number }) {
  const router = useRouter()
  const { regimenId, patient, scheduleSettings } = useFlow()

  const hasRegimen = findRegimen(regimenId)?.available === true
  const regimenLabel = getSelectedRegimenLabel(regimenId)
  const hasPatient = isValidPatient(patient)
  const hasRequiredOrderChoices = !isAlloRegimen(regimenId) || scheduleSettings.donorType != null

  /** 앞 단계는 항상 이동 가능, 뒷 단계는 필요한 데이터가 있어야 이동 가능 */
  function canGo(step: number): boolean {
    if (step === current) return false
    if (step < current) return true
    if (step >= 2 && !hasRegimen) return false
    if (step >= 3 && !hasPatient) return false
    if (step >= 5 && !hasRequiredOrderChoices) return false
    return true
  }

  return (
    <header className="no-print border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-sm font-bold">101</span>
          </div>
          <h1 className="text-balance text-lg font-semibold text-foreground"> 전처치 항암 레지멘・스케줄러</h1>
        </div>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {STEPS.map((s, i) => {
            const step = i + 1
            const done = step < current
            const active = step === current
            const enabled = canGo(step)
            return (
              <li key={s.label} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (enabled) router.push(s.href)
                  }}
                  disabled={!enabled}
                  aria-current={active ? "step" : undefined}
                  title={enabled ? `${s.label}(으)로 이동` : active ? s.label : "이전 단계를 먼저 완료하세요"}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1 text-sm transition-colors",
                    active && "bg-primary text-primary-foreground",
                    done && "bg-accent text-accent-foreground",
                    !active && !done && "bg-muted text-muted-foreground",
                    enabled ? "cursor-pointer hover:opacity-80" : "cursor-default",
                    !enabled && !active && "opacity-60",
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
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && <span className="text-muted-foreground/40">›</span>}
              </li>
            )
          })}
        </ol>
        {regimenLabel && (
          <p className="text-sm font-semibold text-primary">{regimenLabel}</p>
        )}
      </div>
    </header>
  )
}
