"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { PatientInput } from "@/lib/calc"
import type { DoseOverrides } from "@/lib/dose-overrides"
import { DEFAULT_SCHEDULE_SETTINGS, type ScheduleSettings } from "@/lib/schedule-settings"

export interface FlowState {
  regimenId: string | null
  patient: PatientInput | null
  doseOverrides: DoseOverrides
  scheduleSettings: ScheduleSettings
}

interface FlowContextValue extends FlowState {
  setRegimenId: (id: string | null) => void
  setPatient: (p: PatientInput | null) => void
  setDoseOverrides: (o: DoseOverrides | ((prev: DoseOverrides) => DoseOverrides)) => void
  setScheduleSettings: (s: ScheduleSettings | ((prev: ScheduleSettings) => ScheduleSettings)) => void
  reset: () => void
}

const STORAGE_KEY = "regimen-flow-v2"

const FlowContext = createContext<FlowContextValue | null>(null)

const EMPTY: FlowState = {
  regimenId: null,
  patient: null,
  doseOverrides: {},
  scheduleSettings: DEFAULT_SCHEDULE_SETTINGS,
}

function loadInitial(): FlowState {
  if (typeof window === "undefined") return EMPTY
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FlowState>
      return {
        ...EMPTY,
        ...parsed,
        scheduleSettings: { ...DEFAULT_SCHEDULE_SETTINGS, ...parsed.scheduleSettings },
      }
    }
  } catch {
    // ignore
  }
  return EMPTY
}

export function FlowProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FlowState>(EMPTY)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setState(loadInitial())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [state, hydrated])

  const value = useMemo<FlowContextValue>(
    () => ({
      ...state,
      setRegimenId: (id) => setState((s) => ({ ...s, regimenId: id, doseOverrides: {} })),
      setPatient: (p) => setState((s) => ({ ...s, patient: p })),
      setDoseOverrides: (o) =>
        setState((s) => ({
          ...s,
          doseOverrides: typeof o === "function" ? o(s.doseOverrides) : o,
        })),
      setScheduleSettings: (settings) =>
        setState((s) => ({
          ...s,
          scheduleSettings:
            typeof settings === "function" ? settings(s.scheduleSettings) : settings,
        })),
      reset: () => setState(EMPTY),
    }),
    [state],
  )

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
}

export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext)
  if (!ctx) throw new Error("useFlow must be used within FlowProvider")
  return ctx
}
