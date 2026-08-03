"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Check, Lock } from "lucide-react"
import { StepHeader } from "@/components/step-header"
import { useFlow } from "@/contexts/flow-context"
import { REGIMEN_CATEGORIES, findRegimen } from "@/lib/regimens"
import { cn } from "@/lib/utils"

export default function RegimenSelectPage() {
  const router = useRouter()
  const { regimenId, setRegimenId, setPatient } = useFlow()
  const [categoryId, setCategoryId] = useState<string>(
    () => REGIMEN_CATEGORIES.find((c) => c.regimens.some((r) => r.id === regimenId))?.id ?? "auto",
  )

  const category = REGIMEN_CATEGORIES.find((c) => c.id === categoryId) ?? REGIMEN_CATEGORIES[0]
  const selected = findRegimen(regimenId)
  const canConfirm = !!selected && selected.available

  function confirm() {
    if (!canConfirm) return
    setPatient(null) // fresh patient info for a new regimen
    router.push("/patient")
  }

  return (
    <main className="min-h-dvh bg-background">
      <StepHeader current={1} />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h2 className="text-balance text-xl font-semibold text-foreground">레지멘 선택</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            대분류를 선택한 뒤, 세부 레지멘을 고르고 확인을 눌러 다음 단계로 이동하세요.
          </p>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="레지멘 대분류">
          {REGIMEN_CATEGORIES.map((c) => {
            const active = c.id === categoryId
            return (
              <button
                key={c.id}
                role="tab"
                aria-selected={active}
                onClick={() => setCategoryId(c.id)}
                className={cn(
                  "rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                {c.label}
              </button>
            )
          })}
        </div>

        {/* Regimen options */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {category.regimens.map((r) => {
            const active = r.id === regimenId
            return (
              <button
                key={r.id}
                onClick={() => r.available && setRegimenId(r.id)}
                disabled={!r.available}
                aria-pressed={active}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-4 py-3.5 text-left text-sm font-medium transition-colors",
                  active && "border-primary bg-primary/10 text-foreground ring-1 ring-primary",
                  !active &&
                    r.available &&
                    "border-border bg-card text-foreground hover:border-primary/50 hover:bg-muted",
                  !r.available && "cursor-not-allowed border-border/60 bg-card/40 text-muted-foreground",
                )}
              >
                <span className="flex flex-col">
                  <span>{r.label}</span>
                  {!r.available && <span className="mt-0.5 text-xs font-normal text-muted-foreground">준비 중</span>}
                </span>
                {active ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : !r.available ? (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground/60" />
                ) : null}
              </button>
            )
          })}
        </div>

        {/* Confirm */}
        <div className="mt-8 flex items-center justify-end gap-3">
          {selected && (
            <span className="text-sm text-muted-foreground">
              선택됨: <span className="font-medium text-foreground">{selected.label}</span>
            </span>
          )}
          <button
            onClick={confirm}
            disabled={!canConfirm}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors",
              canConfirm
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "cursor-not-allowed bg-muted text-muted-foreground",
            )}
          >
            확인
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </main>
  )
}
