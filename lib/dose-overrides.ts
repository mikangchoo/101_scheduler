/** Per-regimen editable chemotherapy dose keys */
export type DoseKey =
  | "thiotepa_mg_m2"
  | "busulfan_mg_kg"
  | "cyclo_mg_kg"
  | "cyclo_mg_m2"
  | "etoposide_mg_m2"
  | "melphalan_mg_m2"
  | "fludarabine_mg_m2"
  | "mesna_mg"
  | "csa_mg_kg"
  | "tacrolimus_mg_kg_day"
  | "atg_mg_kg"
  | "mpred_mg_kg"
  | "mtx_mg_m2"
  | "mtx_followup_mg_m2"
  | "hydration_ml_m2_day"
  | "hydration_taper_ml_m2_day"
  | "gcsf_ug_m2"
  | "ivig_mg_kg"
  | "ganciclovir_mg_kg"
  | "acyclovir_iv_mg_m2"
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
  bucyeto: {
    busulfan_mg_kg: 3.2,
    etoposide_mg_m2: 400,
    cyclo_mg_kg: 50,
    mesna_mg: 1000,
    hydration_ml_m2_day: 3000,
    hydration_taper_ml_m2_day: 1500,
    gcsf_ug_m2: 300,
  },
  bumel: {
    busulfan_mg_kg: 3.2,
    melphalan_mg_m2: 70,
    hydration_ml_m2_day: 3000,
    hydration_taper_ml_m2_day: 1500,
    gcsf_ug_m2: 300,
    ivig_mg_kg: 500,
    ganciclovir_mg_kg: 5,
  },
  "tbi-cy": {
    cyclo_mg_kg: 60,
    mesna_mg: 1000,
    csa_mg_kg: 3,
    tacrolimus_mg_kg_day: 0.04,
    mtx_mg_m2: 15,
    mtx_followup_mg_m2: 10,
    atg_mg_kg: 1.25,
    mpred_mg_kg: 1,
    hydration_ml_m2_day: 3000,
    hydration_taper_ml_m2_day: 1500,
    gcsf_ug_m2: 300,
    ivig_mg_kg: 500,
    ganciclovir_mg_kg: 5,
    acyclovir_iv_mg_m2: 250,
  },
  fc: {
    fludarabine_mg_m2: 25,
    cyclo_mg_m2: 250,
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
