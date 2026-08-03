/** Per-regimen editable chemotherapy dose keys */
export type DoseKey =
  | "thiotepa_mg_m2"
  | "busulfan_mg_kg"
  | "cyclo_mg_kg"
  | "melphalan_mg_m2"
  | "fludarabine_mg_m2"
  | "atg_mg_kg"
  | "mpred_mg_kg"
  | "mtx_mg_m2"
  | "ptcy_mg_kg"
  | "conditioning_cyclo_mg_kg"
  | "mmf_mg_kg"

export type DoseOverrides = Partial<Record<DoseKey, number>>

export const DEFAULT_DOSES: Record<string, Partial<Record<DoseKey, number>>> = {
  thiobucy: {
    thiotepa_mg_m2: 200,
    busulfan_mg_kg: 3.2,
    cyclo_mg_kg: 60,
  },
  hdmel: {
    // 100 mg/m² × D-3, D-2
    melphalan_mg_m2: 100,
  },
  buflubatg: {
    busulfan_mg_kg: 3.2,
    fludarabine_mg_m2: 40,
    // 1.5 for matched related; 2.5 for unrelated/mismatched (default unrelated)
    atg_mg_kg: 2.5,
    mpred_mg_kg: 1,
    mtx_mg_m2: 15,
  },
  "buflu-ptcy": {
    busulfan_mg_kg: 3.2,
    // Busulfan/Fludarabine-PTCy [MAC]: Fludarabine 25 mg/m²
    fludarabine_mg_m2: 25,
    conditioning_cyclo_mg_kg: 14.5,
    ptcy_mg_kg: 50,
    mmf_mg_kg: 15,
  },
}

export function getDose(regimenId: string, key: DoseKey, overrides: DoseOverrides): number {
  if (overrides[key] != null) return overrides[key]!
  return DEFAULT_DOSES[regimenId]?.[key] ?? 0
}

export function mergeDoseOverrides(regimenId: string, overrides: DoseOverrides): Record<DoseKey, number> {
  const defaults = DEFAULT_DOSES[regimenId] ?? {}
  const keys = new Set([...Object.keys(defaults), ...Object.keys(overrides)]) as Set<DoseKey>
  const out = {} as Record<DoseKey, number>
  for (const k of keys) {
    out[k] = getDose(regimenId, k, overrides)
  }
  return out
}
