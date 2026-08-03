/**
 * Busulfan 희석 수액량 표 (Busulfan_Fluid_Volume.xlsx "Busulfan 용량표")
 * [부설판 용량(mg), 수액 vol.(mL)] — 내림차순
 *
 * 규칙
 *  - 각 cell 사이 값으로 처방할 경우 10단위에서 반올림한 용량의 수액 기준으로 처방
 *    Ex.1 Busulfan 198mg → NS 350mL (200mg 기준)
 *    Ex.2 Busulfan 162mg → NS 250mL (160mg 기준)
 *  - 표 범위를 벗어나면 최상단/최하단 값으로 clamp
 */
export const BUSULFAN_FLUID_TABLE: ReadonlyArray<readonly [number, number]> = [
  [300, 500],
  [290, 500],
  [280, 500],
  [270, 450],
  [260, 450],
  [250, 450],
  [240, 400],
  [230, 400],
  [220, 400],
  [210, 350],
  [200, 350],
  [190, 300],
  [180, 300],
  [170, 300],
  [160, 250],
  [150, 250],
  [140, 250],
  [130, 220],
  [120, 200],
  [110, 200],
  [100, 180],
  [90, 150],
  [80, 130],
  [70, 120],
  [60, 100],
  [50, 90],
  [49, 85],
  [48, 85],
  [47, 85],
  [46, 80],
  [45, 80],
  [44, 80],
  [43, 75],
  [42, 75],
  [41, 75],
  [40, 70],
]

/** 계산된 부설판 용량(mg) → 희석 수액량(mL). 값을 찾을 수 없으면 null */
export function getBusulfanFluidVolume(doseMg: number): number | null {
  if (!Number.isFinite(doseMg) || doseMg <= 0) return null

  // 50mg 이상은 10단위 반올림, 그 이하는 1mg 단위 반올림(표에 1mg 단위 존재)
  const key = doseMg >= 50 ? Math.round(doseMg / 10) * 10 : Math.round(doseMg)

  const exact = BUSULFAN_FLUID_TABLE.find(([mg]) => mg === key)
  if (exact) return exact[1]

  const max = BUSULFAN_FLUID_TABLE[0]
  const min = BUSULFAN_FLUID_TABLE[BUSULFAN_FLUID_TABLE.length - 1]
  if (key > max[0]) return max[1]
  if (key < min[0]) return min[1]

  // 표 사이 값 → 가장 가까운(같거나 큰) 용량의 수액 기준
  let candidate = min
  for (const row of BUSULFAN_FLUID_TABLE) {
    if (row[0] >= key) candidate = row
  }
  return candidate[1]
}

/** "N/S 350mL" 형태의 표시 문자열 */
export function formatBusulfanFluid(doseMg: number): string {
  const vol = getBusulfanFluidVolume(doseMg)
  return vol == null ? "200~500mL" : `${vol}mL`
}

