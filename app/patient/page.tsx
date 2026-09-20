"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { StepHeader } from "@/components/step-header"
import { useFlow } from "@/contexts/flow-context"
import { findRegimen } from "@/lib/regimens"
import { computeCalc, isValidPatient, type PatientInput, type Sex } from "@/lib/calc"
import { cn } from "@/lib/utils"

export default function PatientPage() {
  const router = useRouter()
  const { regimenId, patient, setPatient } = useFlow()
  const regimen = findRegimen(regimenId)

  const [name, setName] = useState("")
  const [sex, setSex] = useState<Sex>("male")
  const [height, setHeight] = useState("")
  const [weight, setWeight] = useState("")
  const [hydrated, setHydrated] = useState(false)

  // Guard: no regimen selected → back to step 1
  useEffect(() => {
    if (hydrated && !regimen?.available) router.replace("/")
  }, [hydrated, regimen, router])

  // Prefill from stored flow state
  useEffect(() => {
    if (patient) {
      setName(patient.name)
      setSex(patient.sex)
      setHeight(String(patient.heightCm))
      setWeight(String(patient.weightKg))
    }
    setHydrated(true)
  }, [patient])

  const heightCm = Number.parseFloat(height)
  const weightKg = Number.parseFloat(weight)
  const valid = Number.isFinite(heightCm) && Number.isFinite(weightKg) && heightCm > 0 && weightKg > 0

  const calc = useMemo(() => {
    if (!valid) return null
    return computeCalc({ name, sex, heightCm, weightKg })
  }, [valid, name, sex, heightCm, weightKg])

  function next() {
    const input: PatientInput = { name: name.trim(), sex, heightCm, weightKg }
    if (!isValidPatient(input)) return
    setPatient(input)
    router.push("/regimen")
  }

  return (
    <main className="min-h-dvh bg-background">
      <StepHeader current={2} />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h2 className="text-balance text-xl font-semibold text-foreground">환자 정보 입력</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            선택 레지멘: <span className="font-medium text-foreground">{regimen?.label ?? "-"}</span>
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Input card */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col gap-4">
              <Field label="이름">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>

              <Field label="성별">
                <div className="grid grid-cols-2 gap-2">
                  {(["male", "female"] as Sex[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSex(s)}
                      aria-pressed={sex === s}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                        sex === s
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background text-foreground hover:bg-muted",
                      )}
                    >
                      {s === "male" ? "남성" : "여성"}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="키 (cm)">
                <input
                  type="number"
                  inputMode="decimal"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="165"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>

              <Field label="몸무게 (kg)">
                <input
                  type="number"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="60"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
            </div>
          </section>

          {/* Result card */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-muted-foreground">자동 계산 결과</h3>
            <dl className="mt-4 flex flex-col gap-3">
              <ResultRow label="BSA" value={calc ? `${calc.bsa.toFixed(2)} m²` : "-"} />
              <ResultRow label="Actual Bwt" value={calc ? `${calc.tbw.toFixed(1)} kg` : "-"} />
              <ResultRow label="IBW" value={calc ? `${calc.ibw.toFixed(1)} kg` : "-"} />
              {regimen?.hasBusulfan && (
                <>
                  <ResultRow label="ABW25" value={calc ? `${calc.abw25.toFixed(1)} kg` : "-"} highlight />
                  <ResultRow
                    label="Busulfan 용량 체중"
                    value={calc ? `${calc.busulfanWeight.toFixed(1)} kg` : "-"}
                    sub={calc ? (calc.tbw < calc.abw25 ? "실제 체중 적용" : "ABW25 적용") : undefined}
                  />
                </>
              )}
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              BSA = √[(키 × 몸무게) / 3600]. IBW는 성별·키 기준식으로 계산됩니다.
              {regimen?.hasBusulfan && " ABW25 = IBW + 0.25 × (실제체중 − IBW)입니다."}
            </p>
          </section>
        </div>

        {/* Nav */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            이전
          </button>
          <button
            onClick={next}
            disabled={!valid}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors",
              valid
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}

function ResultRow({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right">
        <span className={cn("font-mono text-sm font-semibold", highlight ? "text-accent" : "text-foreground")}>
          {value}
        </span>
        {sub && <span className="block text-[11px] text-muted-foreground">{sub}</span>}
      </dd>
    </div>
  )
}
