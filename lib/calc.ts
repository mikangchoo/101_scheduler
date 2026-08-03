export type Sex = "male" | "female"

export interface PatientInput {
  name: string
  sex: Sex
  heightCm: number
  weightKg: number
}

export interface CalcResult {
  /** Body surface area (m2), rounded to 2 decimals */
  bsa: number
  /** Ideal body weight (kg) */
  ibw: number
  /** Total (actual) body weight (kg) */
  tbw: number
  /** Adjusted body weight 25% (kg) */
  abw25: number
  /** Dosing weight used for Busulfan (kg): min(actual, ABW25) */
  busulfanWeight: number
}

/** BSA = √[(Height(cm) × Weight(kg)) / 3600], 2 decimal places */
export function computeBSA(heightCm: number, weightKg: number): number {
  const bsa = Math.sqrt((heightCm * weightKg) / 3600)
  return round(bsa, 2)
}

/**
 * IBW (Ideal Body Weight)
 *  - Ht > 152cm female: 45 + 0.9(Ht - 152)
 *  - Ht > 152cm male:   50 + 0.9(Ht - 152)
 *  - Ht ≤ 152cm female: Ht(m)^2 × 21
 *  - Ht ≤ 152cm male:   Ht(m)^2 × 22
 */
export function computeIBW(heightCm: number, sex: Sex): number {
  const hM = heightCm / 100
  if (heightCm > 152) {
    const base = sex === "male" ? 50 : 45
    return base + 0.9 * (heightCm - 152)
  }
  const factor = sex === "male" ? 22 : 21
  return hM * hM * factor
}

/** ABW25 = IBW + 0.25 × (TBW − IBW) */
export function computeABW25(ibw: number, tbw: number): number {
  return ibw + 0.25 * (tbw - ibw)
}

export function computeCalc(input: PatientInput): CalcResult {
  const { heightCm, weightKg, sex } = input
  const bsa = computeBSA(heightCm, weightKg)
  const ibw = computeIBW(heightCm, sex)
  const tbw = weightKg
  const abw25 = computeABW25(ibw, tbw)
  // actual < ABW25 → use actual; actual > ABW25 → use ABW25  (i.e. the smaller)
  const busulfanWeight = Math.min(tbw, abw25)
  return { bsa, ibw, tbw, abw25, busulfanWeight }
}

export function round(value: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  return Math.round(value * f) / f
}

export function isValidPatient(p: PatientInput | null): p is PatientInput {
  return (
    !!p &&
    typeof p.heightCm === "number" &&
    typeof p.weightKg === "number" &&
    p.heightCm > 0 &&
    p.weightKg > 0
  )
}
