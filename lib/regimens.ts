export interface RegimenOption {
  id: string
  label: string
  /** whether full regimen content is implemented */
  available: boolean
  /** contains Busulfan → show ABW25 on patient page */
  hasBusulfan: boolean
}

export interface RegimenCategory {
  id: string
  label: string
  regimens: RegimenOption[]
}

export const REGIMEN_CATEGORIES: RegimenCategory[] = [
  {
    id: "auto",
    label: "Auto",
    regimens: [
      { id: "hdmel", label: "HDMEL", available: false, hasBusulfan: false },
      { id: "bueam", label: "BuEAM", available: false, hasBusulfan: true },
      { id: "bucyeto", label: "BuCyEto", available: false, hasBusulfan: true },
      { id: "thiobucy", label: "ThioBuCy", available: true, hasBusulfan: true },
      { id: "bumel", label: "BuMel", available: false, hasBusulfan: true },
    ],
  },
  {
    id: "allo",
    label: "Allo",
    regimens: [
      { id: "buflubatg", label: "BuFluATG", available: false, hasBusulfan: true },
      { id: "buflu-ptcy", label: "Buflu-PTCy", available: false, hasBusulfan: true },
      { id: "tbi-cy", label: "TBI-Cy", available: false, hasBusulfan: false },
    ],
  },
  {
    id: "cart",
    label: "Car-T",
    regimens: [{ id: "fc", label: "FC", available: false, hasBusulfan: false }],
  },
]

export function findRegimen(id: string | null): RegimenOption | null {
  if (!id) return null
  for (const cat of REGIMEN_CATEGORIES) {
    const r = cat.regimens.find((x) => x.id === id)
    if (r) return r
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Order-window medication model (used by components/order-med-row.tsx)
 * ------------------------------------------------------------------ */

export type ScheduleKind = "thiotepa" | "citopcin" | "ursa" | "fixed"

export interface OrderMed {
  id: string
  /** OCS drug order line */
  name: string
  /** secondary line (dose / route / mix) */
  detail: string
  scheduleKind: ScheduleKind
  defaultTimes: string[]
  timeOptions?: string[]
  /** always-shown suffix for the Thiotepa row, e.g. "F/ov1h" */
  suffix?: string
}
