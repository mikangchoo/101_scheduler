import type { CalcResult } from "@/lib/calc"
import { round } from "@/lib/calc"
import { type DoseKey, type DoseOverrides, mergeDoseOverrides } from "@/lib/dose-overrides"
import { getBusulfanFluidVolume } from "@/lib/busulfan-fluid"
import type { DonorType } from "@/lib/schedule-settings"

export type LineKind = "title" | "section" | "sub" | "normal" | "spacer"

/** A run of text inside a line. */
export interface Segment {
  text: string
  /** red computed value */
  red?: boolean
  /** editable chemo dose token (double-click to edit the raw per-kg/per-m² value) */
  dose?: {
    key: DoseKey
    /** unit suffix shown after the number, e.g. "mg/m²", "mg/kg" */
    unit: string
  }
}

export interface RenderLine {
  /** plain text (used when there are no segments) */
  text?: string
  /** rich segments (computed red values + editable dose tokens) */
  segments?: Segment[]
  /** right-aligned red computed annotation */
  annotation?: string
  kind?: LineKind
  /** indent level (0-2) */
  indent?: number
  /** render text in italics (regimen source notes) */
  italic?: boolean
  /** show a leading order checkbox (□) */
  checkbox?: boolean
  /** stable id for checkbox state */
  id?: string
  /** 오더창의 레지멘 원문 행 우측에만 표시할 수행시간 */
  orderTimes?: string[]
}

function n(v: number, decimals = 0): string {
  return round(v, decimals).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * 환자 요약(Actual Bwt / ABW25 / BSA) 표기용 포맷.
 * 소수점 둘째 자리까지 표시하되, 둘째 자리가 0이면 첫째 자리까지만 표시.
 * 62.45 → "62.45" / 62.4 → "62.4" / 62 → "62.0"
 */
export function formatPatientNumber(v: number): string {
  const r = round(v, 2)
  const twoDecimals = Math.round(r * 100) % 10 !== 0
  return r.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: twoDecimals ? 2 : 1,
  })
}

/** number formatting for dose tokens (drop trailing zeros) */
function d(v: number): string {
  return String(round(v, 2))
}

type Doses = Record<DoseKey, number>

/* ------------------------------------------------------------------ *
 * 모든 레지멘 공통 문구 (레지멘마다 반드시 존재해야 하는 라인)
 * ------------------------------------------------------------------ */

/** G-CSF 공통 문구 — BSA 기반 총량 + 고정 450ug 대안을 함께 표기 */
function gcsfLine(c: CalcResult, dose: Doses, prefix = ""): RenderLine {
  const perM2 = dose.gcsf_ug_m2 || 300
  return {
    segments: [
      { text: `${prefix}G-CSF ` },
      { text: d(perM2), dose: { key: "gcsf_ug_m2", unit: "ug/m²" } },
      { text: " = " },
      { text: `${n(perM2 * c.bsa, 0)} ug`, red: true },
      { text: " (or 450 ug) S.Q or MIVs (보험기준상 ANC 3000까지 투여 가능)" },
    ],
    italic: true,
    checkbox: true,
    id: "gcsf",
  }
}

/**
 * Vit K + Ulcer prophylaxis — 원본과 동일하게 한 줄 유지.
 * 좌측 체크박스는 Vit K용, 문장 끝(H2 blocker or PPI) 체크박스는 regimen-adjust에서 부여.
 */
function vitKLine(prefix = ""): RenderLine {
  return {
    text: `${prefix}Vit K 10mg iv weekly, Ulcer prophylaxis for steroid use: H2 blocker or PPI`,
    italic: true,
    checkbox: true,
    id: "vitk",
  }
}

/** Stem cell infusion premed — 모든 레지멘 공통, 좌측 체크박스 */
function premedChlorpheniramineLine(): RenderLine {
  return {
    text: "Premed (-30 min): Chlorpheniramine 4mg ivs",
    indent: 1,
    italic: true,
    checkbox: true,
    id: "premed-cpm",
  }
}

/* ------------------------------------------------------------------ *
 * Busulfan 희석 수액량 라인 (엑셀 표 기반, 계산값은 빨간 글씨)
 * ------------------------------------------------------------------ */
function busulfanFluidLine(busulfanMg: number, note: string): RenderLine {
  const vol = getBusulfanFluidVolume(busulfanMg)
  return {
    indent: 1,
    italic: true,
    segments: [
      { text: "N/S " },
      { text: vol == null ? "200~500mL" : `${vol}mL`, red: true },
      { text: ` ${note}` },
    ],
  }
}

/* ------------------------------------------------------------------ *
 * ThioBuCy
 * ------------------------------------------------------------------ */
function buildThioBuCy(c: CalcResult, dose: Doses): RenderLine[] {
  const busulfanMgNum = dose.busulfan_mg_kg * c.busulfanWeight
  const thiotepaMg = n(dose.thiotepa_mg_m2 * c.bsa, 1)
  const busulfanMg = n(busulfanMgNum, 0)
  const cycloMg = n(dose.cyclo_mg_kg * c.tbw, 0)
  const hyd3 = n((3000 * c.bsa) / 24, 0)
  const hyd15 = n((1500 * c.bsa) / 24, 0)
  const cycloHasIce = dose.cyclo_mg_kg >= 60

  return [
    { text: "Thio/Bu/Cy Conditioning for AutoSCT (8 days regimen)", kind: "title" },
    { text: "", kind: "spacer" },
    ...patientSummary(c),
    { text: "", kind: "spacer" },

    { text: "1) Conditioning", kind: "section", italic: true },
    {
      checkbox: true,
      id: "thiotepa",
      segments: [
        { text: "Thiotepa " },
        { text: `${thiotepaMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.thiotepa_mg_m2)}`, dose: { key: "thiotepa_mg_m2", unit: "mg/m²" } },
        { text: "mg/m²) miv over 60min (with 0.22μm filter)" },
      ],
    },
    { text: "NS 500ml [농도범위에 따라 변환가능, 0.5~1mg/ml]", indent: 1, italic: true },
    { text: "D-8, D-7, D-6", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "busulfan",
      segments: [
        { text: "IV Busulfan " },
        { text: `${busulfanMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.busulfan_mg_kg)}`, dose: { key: "busulfan_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) miv over 3hrs qd" },
      ],
    },
    busulfanFluidLine(busulfanMgNum, "[농도범위에 따라 변환가능, 0.5mg/ml 이상, 0.5mg/mL에 근접할 때 가장 안정]"),
    { text: "D-5, D-4", indent: 1, italic: true },
    { text: "with Sz prophylaxis:", indent: 1, italic: true },
    {
      text: "Busulfan 투약 3-4시간 전 Levetiracetam 1500mg po loading (D-5)",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "levetiracetam",
    },
    { text: "→ 다음날 500mg PO bid (D-4, D-3), GFR 30 미만인 경우 250mg bid", indent: 2, italic: true },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "cyclophosphamide",
      annotation: cycloHasIce ? "얼음/EKG" : undefined,
      segments: [
        { text: "Cyclophosphamide " },
        { text: `${cycloMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.cyclo_mg_kg)}`, dose: { key: "cyclo_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) miv over 1 hr" },
      ],
    },
    { text: "D5W 200ml", indent: 1, italic: true },
    { text: "D-3, D-2", indent: 1, italic: true },
    { text: "※ Hemorrhagic cystitis prevention", indent: 1, italic: true },
    { text: "a) Mesna 1000mg/NS50ml IVs q 6 hr (Start at -30 min before CTX) D-3, D-2", indent: 2, italic: true },
    { text: "b) Hydration", indent: 2, italic: true },
    { text: "D5WNa77K20 (NaK2V)", indent: 2, italic: true },
    {
      text: "3L/m²/day, D-3 – D0,",
      indent: 2,
      italic: true,
      annotation: `${hyd3} ch`,
      checkbox: true,
      id: "hydration-high-thiobucy",
    },
    {
      text: "1.5L/m²/day, D1 – D4, then tapering, check serum electrolyte",
      indent: 2,
      italic: true,
      annotation: `${hyd15} ch`,
      checkbox: true,
      id: "tbc-hyd15",
    },
    {
      text: "Furosemide 10mg (D-3 – D0, 이후 PRN)",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "tbc-furosemide",
    },
    {
      text: "check urine output q 6 hr, if 6hr u/o < 1L or 150ml/hr, furosemide 1A ivs",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "tbc-uo",
    },
    {
      id: "ekg-monitoring-thiobucy",
      text: "ECG monitor & CK/LD level (D-3 – D1)",
      indent: 2,
      italic: true,
      checkbox: true,
    },
    { text: "", kind: "spacer" },

    ...stemCellInfusion(),
    ...thioBuCySupportive(c, dose),
    ...highRiskAntiemetics(),
    ...labFU(),
  ]
}

/* ------------------------------------------------------------------ *
 * HDMEL — High dose Melphalan
 * ------------------------------------------------------------------ */
function buildHDMEL(c: CalcResult, dose: Doses): RenderLine[] {
  const melMg = n(dose.melphalan_mg_m2 * c.bsa, 1)

  return [
    { text: "High dose Melphalan Conditioning for AutoSCT", kind: "title" },
    { text: "", kind: "spacer" },
    ...patientSummary(c, false),
    { text: "", kind: "spacer" },

    { text: "1) Conditioning", kind: "section", italic: true },
    {
      checkbox: true,
      id: "melphalan",
      annotation: "얼음/차광",
      segments: [
        { text: "Melphalan " },
        { text: `${melMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.melphalan_mg_m2)}`, dose: { key: "melphalan_mg_m2", unit: "mg/m²" } },
        { text: "mg/m²) miv over 30 min" },
      ],
    },
    { text: "N/S 500mL [농도범위에 따라 변환가능, 0.45 mg/mL 이하] (용해 즉시 투여)", indent: 1, italic: true },
    { text: "D-3, D-2", indent: 1, italic: true },
    { text: "", kind: "spacer" },
    { text: "with hydration  D5WNa77K20(NaK2V)", indent: 1, italic: true },
    {
      text: "(250ch: from -6 hr to +12hr, 75ch in the meantime: furosemide if needed)",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "hdmel-hyd",
    },
    {
      text: "premed: Dexamethasone 10mg IVS (-30min)",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "hdmel-premed-dexa",
    },
    { text: "Furosemide 20mg IVS (+1 hour)", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    ...stemCellInfusion(),

    { text: "3) Supportive care", kind: "section", italic: true },
    { text: "Fungal prophylaxis: Micafungin 50mg qd IV (D-3 – ANC>1000 for 3 consecutive days)", italic: true },
    { text: "  – 이전에 invasive mold infection이 있었던 경우 감염내과 상의 후 결정", indent: 1, italic: true },
    { text: "Ciprofloxacin 500mg po bid (D-3 – ANC>1000 for 3 consecutive days)", italic: true },
    { text: "CMV prophylaxis: IVIg 500mg/kg iv (D7부터 2주 간격, 3개월까지 격주 500mg/kg, 이후 6개월까지 매월 500mg/kg, 최장 9개월 급여)", italic: true },
    gcsfLine(c, dose),
    vitKLine(),
    { text: "", kind: "spacer" },
    { text: "Antiemetics", kind: "sub", italic: true },
    { text: "D-3, -2  Serotonin antagonist IV", indent: 1, italic: true, checkbox: true, id: "ae-hdmel-iv" },
    { text: "D-1, 0  Serotonin antagonist PO (IV와 동일 제제 투여)", indent: 1, italic: true },
    { text: "prn) lorazepam 0.5-2mg IV q4-6h OR metoclopramide 10mg IV q8h or olanzapine[D] 5~10mg po", indent: 1, italic: true },
    { text: "* olanzapine 투여 시 metoclopramide 병용 금기", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "4) Lab F/U", kind: "section", italic: true },
    { text: "1. daily CBC", indent: 1, italic: true },
    { text: "2. Adm batt, e', Mg, Coagulation, U/A (X2/week): daily e'/BUN/Cr (D-3 – D1)", indent: 1, italic: true },
    { text: "3. Chest PA: Weekly", indent: 1, italic: true },
    { text: "4. 1주마다 CMV antigenemia check", indent: 1, italic: true },
  ]
}

/* ------------------------------------------------------------------ *
 * bufluATG — Busulfan/Fludarabine/ATG (MAC)
 * ------------------------------------------------------------------ */
function buildBufluATG(c: CalcResult, dose: Doses): RenderLine[] {
  const busulfanMgNum = dose.busulfan_mg_kg * c.busulfanWeight
  const busulfanMg = n(busulfanMgNum, 0)
  const fluMg = n(dose.fludarabine_mg_m2 * c.bsa, 0)
  const atgMg = n(dose.atg_mg_kg * c.tbw, 1)
  const mpredMg = n(dose.mpred_mg_kg * c.tbw, 0)
  const mtxD1 = n(dose.mtx_mg_m2 * c.bsa, 1)
  const mtxD36 = n(10 * c.bsa, 1)
  const csaMg = n(dose.csa_mg_kg * c.tbw, 1)
  const tacMg = n(dose.tacrolimus_mg_kg_day * c.tbw, 2)
  const hyd = n((125 * 24) / 24, 0)

  return [
    { text: "Busulfan/Fludarabine/ATG (MAC); Bu4Flu-ATG", kind: "title" },
    { text: "", kind: "spacer" },
    ...patientSummary(c),
    { text: "", kind: "spacer" },

    { text: "1) Conditioning", kind: "section", italic: true },
    {
      checkbox: true,
      id: "busulfan",
      segments: [
        { text: "Busulfan " },
        { text: `${busulfanMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.busulfan_mg_kg)}`, dose: { key: "busulfan_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) miv over 3hrs (하루 1번)" },
      ],
    },
    busulfanFluidLine(busulfanMgNum, "[농도범위에 따라 변환가능, 0.5mg/ml 이상, 0.5mg/mL에 근접할 때 가장 안정]"),
    { text: "D-6, D-5, D-4, D-3", indent: 1, italic: true },
    { text: "with Sz prophylaxis:", indent: 1, italic: true },
    {
      text: "Busulfan 투약 3-4시간 전 Levetiracetam 1500mg po loading (D-6)",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "levetiracetam",
    },
    {
      id: "levetiracetam-maintenance-batg",
      text: "다음날부터 500mg PO bid (D-5 ~ D-2), GFR 30 미만인 경우 250mg bid",
      indent: 2,
      italic: true,
    },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "fludarabine",
      segments: [
        { text: "Fludarabine " },
        { text: `${fluMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.fludarabine_mg_m2)}`, dose: { key: "fludarabine_mg_m2", unit: "mg/m²" } },
        { text: "mg/m²) miv over 1 hour" },
      ],
    },
    { text: "NS 100mL", indent: 1, italic: true },
    { text: "D-6, D-5, D-4, D-3", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "atg",
      segments: [
        { text: "ATG (Rabbit, Thymoglobulin) " },
        { text: `${atgMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.atg_mg_kg)}`, dose: { key: "atg_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) miv over 6 hrs via I-med" },
      ],
    },
    { text: "1.5 mg/kg/day for related donors", indent: 1, italic: true },
    { text: "2.5 mg/kg/day for unrelated donors", indent: 1, italic: true },
    { text: "N/S (final conc. 0.5mg/ml – ATG 용량의 2배 양에 해당하는 희석 수액 처방)", indent: 1, italic: true },
    { text: "D-3, D-2, D-1", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "mpred",
      segments: [
        { text: "Methylprednisolone " },
        { text: `${mpredMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.mpred_mg_kg)}`, dose: { key: "mpred_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) in D5W 100ml IV over 30mins q12hr (daily 2mg/kg)" },
      ],
    },
    { text: "D-3, D-2, D-1", indent: 1, italic: true },
    { text: "※ Premedication for Thymoglobulin", indent: 1, italic: true },
    {
      text: "1시간 전 Acetaminophen 600mg po, Hydroxyzine 1T po",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "atg-premed-1hr",
    },
    {
      text: "30분 전 Chlorpheniramine 4mg iv (with methylprednisolone as above)",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "atg-premed-30min",
    },
    {
      text: "ATG 30분 후 Hydrocortisone 50mg iv",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "atg-post-hydrocortisone",
    },
    { text: "Shivering 등의 증상 발생 시 prn) Pethidine 25mg IV", indent: 2, italic: true },
    { text: "with hydration D5WNa77K20(NaK2V)", indent: 1, italic: true, annotation: `${hyd} ch` },
    { text: "(125ch: from D-6 to D-3, then tapering) check serum electrolyte, PRN furosemide 1A", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "2) Stem cell infusion (D0, (D1), (D2))", kind: "section", italic: true },
    { text: "At least 48 hours after the completion of chemotherapy", indent: 1, italic: true },
    premedChlorpheniramineLine(),
    { text: "Stem cell infusion: over 5-7 min per bag", indent: 1, italic: true },
    { text: "Check V/S q 30min x4, q 1hr x4", indent: 1, italic: true },
    { text: "Washing infusion tubing with saline", indent: 1, italic: true },
    { text: "Keep at bedside for 1 hour after stem cell infusion", indent: 1, italic: true },
    { text: "Prepare chlorpheniramine 4mg, epinephrine, hydrocortisone and O2 kit at bed side", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "3) Supportive care", kind: "section", italic: true },
    { text: "3-1. Gut decontamination: Ciprofloxacin 500mg po bid (D-6 to ANC > 1,000)", italic: true },
    { text: "3-2. VOD prophylaxis: UDCA 200mg tid PO (D-6 – D+21 혹은 생착 시까지)", italic: true },
    { text: "3-3. PCP prophylaxis: TMP/SMX(SS) 1T po qd (Start at D+21 if ANC>1000) for 6 months", italic: true },
    { text: "3-4. Fungal prophylaxis: Micafungin 50mg qd IV (D-6 – ANC>1000 for 3 consecutive days)", italic: true },
    { text: "3-5. CMV prophylaxis",
      italic: true,},
    {text: "A. CMV IgG (+) & D0 CMV PCR negative: letermovir D+7~D+100 480mg qd (Cyclosporine 병용 시 240mg qd)",
      italic: true,
      checkbox: true,
      id: "cmv-proph-a",},
    {text: "B. 나머지 경우: IVIg 500mg/kg iv (D+7부터 2주 간격, 3개월까지 격주, 이후 6개월까지 매월, 최장 9개월 급여)",
      italic: true,},
    {text: "C. 고위험군 (혈청음성수혜자 + 혈청양성공여자): ganciclovir 5mg/kg bid IV 1주 → ANC>1000 후 5mg/kg qd till D100",
      italic: true,},
    {text: "※ Cyclosporin + letermovir 사용 시 atorvastatin, simvastatin, pitavastatin, rosuvastatin, dabigatran 병용 금기",
      italic: true,},

    { text: "3-6. HSV prophylaxis: acyclovir 400mg PO bid (D-8~D+30)", italic: true },
    gcsfLine(c, dose, "3-7. "),
    vitKLine("3-8. "),
    { text: "", kind: "spacer" },
    { text: "3-9. Antiemetics", kind: "sub", italic: true },
    {
      text: "D-6~D-3  Serotonin antagonist IV [palonosetron 0.25mg, ramo 0.3mg, grani 3mg, ondan 8mg q12hr 중 택1]",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "ae-batg-iv",
    },
    { text: "D-2, D-1  Serotonin antagonist PO (IV와 동일 제제 투여)", indent: 1, italic: true },
    { text: "prn) lorazepam 0.5-2mg IV q4-6h OR metoclopramide 10mg IV q8h, olanzapine[D] 5~10mg po", indent: 1, italic: true },
    { text: "※ olanzapine 투여 시 metoclopramide 병용 금기", indent: 1, italic: true },
    { text: "※ regimen상 steroid 투여되면 중복해서 투여하지 않아도 됨", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "4) GVHD prophylaxis", kind: "section", italic: true },
    { text: "★ related donor (matched sibling, haploidentical): CsA + MTX", indent: 1, italic: true },
    { text: "★ unrelated donor (KMDP, JMDP 등): tacrolimus + MTX", indent: 1, italic: true },
    {
      indent: 1,
      checkbox: true,
      id: "batg-csa",
      segments: [
        { text: "4-1. Cyclosporin A (related) " },
        { text: `${csaMg} mg`, red: true },
        { text: " (" },
        { text: d(dose.csa_mg_kg), dose: { key: "csa_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) civ (D-2)" },
      ],
    },
    {
      indent: 1,
      checkbox: true,
      id: "batg-tacrolimus",
      segments: [
        { text: "Tacrolimus (unrelated) " },
        { text: `${tacMg} mg`, red: true },
        { text: " (" },
        {
          text: d(dose.tacrolimus_mg_kg_day),
          dose: { key: "tacrolimus_mg_kg_day", unit: "mg/kg/day" },
        },
        { text: "mg/kg/day) IV (D-2)" },
      ],
    },
    {
      indent: 1,
      checkbox: true,
      id: "mtx",
      segments: [
        { text: "4-2. MTX " },
        { text: `${mtxD1} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.mtx_mg_m2)}`, dose: { key: "mtx_mg_m2", unit: "mg/m²" } },
        { text: "mg/m² ivp) (D1) → " },
        { text: `${mtxD36} mg`, red: true },
        { text: " (10mg/m² ivp) (D3, D6)" },
      ],
    },
    { text: "", kind: "spacer" },

    { text: "5) Lab F/U", kind: "section", italic: true },
    { text: "1. Cyclosporin or Tacrolimus level: x3/week, 투약 3일째 level 확인하여 조절", indent: 1, italic: true },
    { text: "2. daily CBC/differential", indent: 1, italic: true },
    { text: "3. Adm batt, e', Mg, Coagulation, U/A (2/week)", indent: 1, italic: true },
    { text: "4. 1주마다 CMV antigenemia check", indent: 1, italic: true },
  ]
}

/* ------------------------------------------------------------------ *
 * BuFlu-PTCy — Busulfan/Fludarabine-PTCy Conditioning [MAC]
 * ------------------------------------------------------------------ */
function buildBufluPTCy(c: CalcResult, dose: Doses): RenderLine[] {
  const busulfanMgNum = dose.busulfan_mg_kg * c.busulfanWeight
  const busulfanMg = n(busulfanMgNum, 0)
  const fluMg = n(dose.fludarabine_mg_m2 * c.bsa, 0)
  const condCycloMg = n(dose.conditioning_cyclo_mg_kg * c.tbw, 0)
  const ptcyMg = n(dose.ptcy_mg_kg * c.tbw, 0)
  const mmfMg = n(dose.mmf_mg_kg * c.tbw, 0)
  const hyd3 = n((3000 * c.bsa) / 24, 0)
  const csaMg = n(dose.csa_mg_kg * c.tbw, 1)
  const tacMg = n(dose.tacrolimus_mg_kg_day * c.tbw, 2)

  return [
    { text: "Busulfan/Fludarabine-PTCy Conditioning [MAC]", kind: "title" },
    { text: "", kind: "spacer" },
    ...patientSummary(c),
    { text: "", kind: "spacer" },

    { text: "1) Conditioning", kind: "section", italic: true },
    {
      checkbox: true,
      id: "fludarabine",
      segments: [
        { text: "Fludarabine " },
        { text: `${fluMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.fludarabine_mg_m2)}`, dose: { key: "fludarabine_mg_m2", unit: "mg/m²" } },
        { text: "mg/m²) miv over 1 hour" },
      ],
    },
    { text: "NS 100mL", indent: 1, italic: true },
    { text: "D-7, -6, -5, -4, -3", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "busulfan",
      segments: [
        { text: "Busulfan " },
        { text: `${busulfanMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.busulfan_mg_kg)}`, dose: { key: "busulfan_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) miv over 3hr (하루 1번)" },
      ],
    },
    busulfanFluidLine(busulfanMgNum, "[농도 범위에 따라 변환 가능, 0.5mg/ml 이상, 0.5mg/mL에 근접할 때 가장 안정]"),
    { text: "D-7, -6, -5, -4", indent: 1, italic: true },
    { text: "with Sz prophylaxis:", indent: 1, italic: true },
    {
      text: "Busulfan 투약 3-4시간 전 Levetiracetam 1500mg po loading (D-7)",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "levetiracetam",
    },
    {
      id: "levetiracetam-maintenance-ptcy",
      text: "→ 다음날부터 500mg PO bid (D-6~D-3), GFR 30 미만인 경우 250mg bid",
      indent: 2,
      italic: true,
    },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "conditioning-cyclo",
      annotation: dose.conditioning_cyclo_mg_kg >= 60 ? "얼음/EKG" : undefined,
      segments: [
        { text: "Cyclophosphamide " },
        { text: `${condCycloMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.conditioning_cyclo_mg_kg)}`, dose: { key: "conditioning_cyclo_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) over 1hr" },
      ],
    },
    { text: "D5W 200mL", indent: 1, italic: true },
    { text: "D-3, -2  for 2 days", indent: 1, italic: true },
    { text: "with hydration D5WNa77K20(NaK2V)", indent: 1, italic: true },
    {
      text: "(NS 125ch: from D-3, D-2, then tapering)",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "hydration-conditioning-ptcy",
    },
    { text: "", kind: "spacer" },

    { text: "Post-transplant cyclophosphamide", kind: "sub", italic: true },
    {
      checkbox: true,
      id: "ptcy",
      annotation: dose.ptcy_mg_kg >= 60 ? "얼음/EKG" : undefined,
      segments: [
        { text: "Cyclophosphamide " },
        { text: `${ptcyMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.ptcy_mg_kg)}`, dose: { key: "ptcy_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) over 1hr" },
      ],
    },
    { text: "D5W 200mL", indent: 1, italic: true },
    { text: "D+3, D+4  for 2 days", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "※ Hemorrhagic cystitis prevention", indent: 1, italic: true },
    { text: "a) Mesna 800mg/NS50ml IVs q 6 hr (Start at -30 min before CTX) D+3, D+4", indent: 2, italic: true },
    { text: "b) Hydration", indent: 2, italic: true },
    {
      text: "D5WNa77K20(NaK2V) 3L/m²/day, D+3 ~ D+4",
      indent: 2,
      italic: true,
      annotation: `${hyd3} ch`,
      checkbox: true,
      id: "hydration-high-ptcy",
    },
    {
      text: "1.5L/day D+5 – D+7, then tapering",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "ptcy-hyd15",
    },
    { text: "Check serum electrolyte and urine output", indent: 2, italic: true },
    {
      text: "PRN Furosemide 10mg (D+3 ~ D+4, 이후 PRN)",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "ptcy-furosemide",
    },
    {
      id: "ekg-monitoring-ptcy",
      text: "ECG monitor & CK/LD level (D+3 ~ D+4)",
      indent: 2,
      italic: true,
      checkbox: true,
    },
    { text: "", kind: "spacer" },

    { text: "2) Stem cell infusion (D0, (D1), (D2))", kind: "section", italic: true },
    { text: "At least 48 hours after the completion of chemotherapy", indent: 1, italic: true },
    premedChlorpheniramineLine(),
    { text: "Stem cell infusion: over 15-20 min per bag", indent: 1, italic: true },
    { text: "Check V/S q 30min x4, q 1hr x4", indent: 1, italic: true },
    { text: "Washing infusion tubing with saline", indent: 1, italic: true },
    { text: "Keep at bedside for 1 hour after stem cell infusion", indent: 1, italic: true },
    { text: "Prepare chlorpheniramine 4mg, epinephrine, hydrocortisone and O2 kit at bed side", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "3) GVHD prophylaxis", kind: "section", italic: true },
    { text: "3-1. Post-transplant cyclophosphamide (regimen 참조)", italic: true },
    {
      segments: [{ text: "※ PTCy D0~D5 사이 steroid 사용하지 않도록 주의", red: true }],
      indent: 1,
      italic: true,
    },
    { text: "3-2. Cyclosporin A or tacrolimus + MMF", italic: true },
    { text: "★ related donor (matched sibling, haploidentical): CsA + MMF", indent: 1, italic: true },
    { text: "★ unrelated donor (KMDP, JMDP 등): tacrolimus + MMF", indent: 1, italic: true },
    {
      indent: 1,
      checkbox: true,
      id: "csa",
      segments: [
        { text: "Cyclosporine A " },
        { text: `${csaMg} mg`, red: true },
        { text: " (" },
        { text: d(dose.csa_mg_kg), dose: { key: "csa_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) civ: D+5부터 시작" },
      ],
    },
    { text: "이후 혈청 cyclosporin level 보고 therapeutic range 250-400ng/mL로 titration (target range 지정의 확인)", indent: 2, italic: true },
    { text: "경구 섭취 가능 시 IV 용량의 약 2배를 2회 분할(10AM, 10PM) 경구 전환, 경구 시작 3시간 후 IV 중단 (up to day 120~180)", indent: 2, italic: true },
    {
      indent: 1,
      checkbox: true,
      id: "tacrolimus",
      segments: [
        { text: "Tacrolimus " },
        { text: `${tacMg} mg`, red: true },
        { text: " (" },
        {
          text: d(dose.tacrolimus_mg_kg_day),
          dose: { key: "tacrolimus_mg_kg_day", unit: "mg/kg/day" },
        },
        { text: "mg/kg/day) IV loading: D+5부터 시작" },
      ],
    },
    { text: "Target 5~15ng/mL, 경구 전환 시 IV 용량의 약 3.5배를 2회 분할(10AM, 10PM), 경구투약 전날 10PM IV 중단 (up to day 90~180)", indent: 2, italic: true },
    { text: "5ng/mL 미만: 25% 증량 / 5-15ng/mL: 유지 / 15ng/mL 초과: 6시간 중단 후 25% 감량 / 20ng/mL 초과: 6시간 중단 후 50% 감량", indent: 2, italic: true },
    { text: "* voriconazole 병용 시 PO 전환은 보수적으로 CsA 2배→1.5배, tacrolimus 3.5배→3배 용량으로 시작", indent: 2, italic: true },
    {
      indent: 1,
      checkbox: true,
      id: "mmf",
      segments: [
        { text: "3-3. MMF (Mycophenolate mofetil) " },
        { text: `${mmfMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.mmf_mg_kg)}`, dose: { key: "mmf_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) tid PO, D+5부터 시작 (1cap=250mg, capping 1g tid)" },
      ],
    },
    { text: "PTCy 후 CNI와 병용투여 시 MMF는 D+30~35까지 사용 후 off (up to day 30~100)", indent: 2, italic: true },
    { text: "", kind: "spacer" },

    { text: "4) Supportive care", kind: "section", italic: true },
    { text: "4-1. Gut decontamination: Ciprofloxacin 500mg po bid (D-7 to ANC > 1,000)", italic: true },
    { text: "4-2. VOD prophylaxis: UDCA 200mg tid PO (D-7 – D+21 혹은 생착 시까지)", italic: true },
    { text: "4-3. PCP prophylaxis: TMP/SMX(SS) 1T po qd (Start at D+21 if ANC>1000) for 6 months or until 면역억제제 중단", italic: true },
    { text: "4-4. Fungal prophylaxis: Micafungin 50mg qd IV (D-7 – ANC>1000 for 3 consecutive days)", italic: true },
    { text: "  – 이전에 invasive mold infection이 있었던 경우 감염내과 상의 후 결정", indent: 1, italic: true },
    { text: "4-5. CMV prophylaxis", italic: true },
    { text: "A. CMV IgG (+) & D0 CMV PCR negative: letermovir D+7~D+100 480mg qd (Cyclosporine 병용 시 240mg qd)", indent: 1, italic: true },
    { text: "B. 나머지 경우: IVIg 500mg/kg iv (D+7부터 2주 간격, 3개월까지 격주, 이후 6개월까지 매월, 최장 9개월 급여)", indent: 1, italic: true },
    { text: "C. 고위험군 (혈청음성수혜자 + 혈청양성공여자): ganciclovir 5mg/kg bid IV 1주 → ANC>1000 후 5mg/kg qd till D100", indent: 1, italic: true },
    { text: "※ Cyclosporin + letermovir 사용 시 atorvastatin, simvastatin, pitavastatin, rosuvastatin, dabigatran 병용 금기", indent: 1, italic: true },
    { text: "4-6. HSV prophylaxis: acyclovir 400mg PO bid (D-8~D+30), PO 불가 시 IV 250mg/m² q12h over 1hr", italic: true },
    gcsfLine(c, dose, "4-7. "),
    vitKLine("4-8. "),
    { text: "", kind: "spacer" },
    { text: "4-9. Antiemetics", kind: "sub", italic: true },
    {
      text: "D-7~D-2  Serotonin antagonist IV [palonosetron 0.25mg, ramo 0.3mg, grani 3mg, ondan 8mg q12hr 중 택1]",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "ae-ptcy-iv",
    },
    { text: "D-1~D0  Serotonin antagonist PO (IV와 동일 제제 투여)", indent: 1, italic: true },
    {
      id: "ae-ptcy-post-iv",
      text: "D+3  Aprepitant 125mg po qd + Serotonin antagonist IV",
      indent: 1,
      italic: true,
    },
    {
      id: "ae-ptcy-post-po",
      text: "D+4~D+5  Aprepitant 80mg po qd",
      indent: 1,
      italic: true,
    },
    { text: "※ antiemetics로도 steroid 사용하지 않습니다.", indent: 1, italic: true },
    { text: "prn) lorazepam 0.5-2mg IV q4-6h OR metoclopramide 10mg IV q8h or olanzapine[D] 5~10mg po", indent: 1, italic: true },
    { text: "※ olanzapine 투여 시 metoclopramide 병용 금기", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "5) Lab F/U", kind: "section", italic: true },
    { text: "1. Cyclosporin or Tacrolimus level (EDTA tube, 약물 들어가지 않는 line): x3/week, 투약 3일째 level 확인하여 조절", indent: 1, italic: true },
    { text: "2. daily CBC/differential", indent: 1, italic: true },
    { text: "3. Adm batt, e', Mg, Coagulation, U/A (2/week): daily e' B/Cr (D-8 – D0)", indent: 1, italic: true },
    { text: "4. Weekly ECG, CPA", indent: 1, italic: true },
    { text: "5. 1주마다 CMV antigenemia check", indent: 1, italic: true },
    { text: "6. ANC < 1000 기간 동안은 weekly aspergillus Ag", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "6) Donor preparation (PBSCT인 경우)", kind: "section", italic: true },
    { text: "G-CSF 600ug S.Q. qd 9PM D+5부터 start", indent: 1, italic: true },
    { text: "POST-BMT TEST (STR) sampling (D0) (if not done previously)", indent: 1, italic: true },
    { text: "CBC (em) D0, (D1), (D2) 7AM and post-collection", indent: 1, italic: true },
    { text: "iCa++, e'/BUN/Cr x2/day, if Ca++ ↓ → calcium gluconate (in N/S 100mL)", indent: 1, italic: true },
    { text: "Stem cell collection with permission, Target: CD34 > 5x10^6/kg", indent: 1, italic: true },
  ]
}

/* ------------------------------------------------------------------ *
 * BuCyEto — Busulfan / Etoposide / Cyclophosphamide
 * ------------------------------------------------------------------ */
function buildBuCyEto(c: CalcResult, dose: Doses): RenderLine[] {
  const busulfanMgNum = dose.busulfan_mg_kg * c.busulfanWeight
  const etoposideMgNum = dose.etoposide_mg_m2 * c.bsa
  const etoposideBagMg = etoposideMgNum / 2
  const cycloMgNum = dose.cyclo_mg_kg * c.tbw
  const hydrationHigh = (dose.hydration_ml_m2_day * c.bsa) / 24
  const hydrationLow = (dose.hydration_taper_ml_m2_day * c.bsa) / 24

  return [
    { text: "BuCyEto Conditioning for AutoSCT", kind: "title" },
    { text: "", kind: "spacer" },
    ...patientSummary(c),
    { text: "", kind: "spacer" },

    { text: "1) Conditioning", kind: "section", italic: true },
    {
      checkbox: true,
      id: "bucyeto-busulfan",
      segments: [
        { text: "IV Busulfan " },
        { text: `${n(busulfanMgNum, 0)} mg`, red: true },
        { text: " (" },
        { text: d(dose.busulfan_mg_kg), dose: { key: "busulfan_mg_kg", unit: "mg/kg" } },
        { text: ") miv for 3hrs (하루 한번)" },
      ],
    },
    busulfanFluidLine(
      busulfanMgNum,
      "[농도범위에 따라 변환 가능, 0.5mg/ml 이상, 0.5mg/mL 에 근접할 때 가장 안정]",
    ),
    { text: "D-7, D-6, D-5", indent: 1, italic: true, checkbox: false },
    {
      text: "Busulfan 투약 3-4시간 전 Levetiracetam 1500mg po loading (D-7)",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "bucyeto-levetiracetam-loading",
    },
    {
      text: "→ 다음날부터 500mg PO bid (D-6~D-4)",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "bucyeto-levetiracetam-maintenance",
    },
    { text: "(GFR 30 미만인 경우 250mg bid)", indent: 1, italic: true, checkbox: false },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "bucyeto-etoposide",
      segments: [
        { text: "Etoposide " },
        { text: `${n(etoposideMgNum, 1)} mg`, red: true },
        { text: " (" },
        { text: d(dose.etoposide_mg_m2), dose: { key: "etoposide_mg_m2", unit: "mg/m²" } },
        { text: ") miv over 5hrs (using ABW)" },
      ],
    },
    {
      indent: 1,
      italic: true,
      segments: [
        { text: "N/S 2L (" },
        { text: `${n(etoposideBagMg, 1)} mg`, red: true },
        { text: ` (${d(dose.etoposide_mg_m2 / 2)}mg/m²) + NS 1L × 2로 처방, 희석농도 0.4mg/ml 이하 유지)` },
      ],
    },
    { text: "D-5, D-4", indent: 1, italic: true, checkbox: false },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "bucyeto-cyclophosphamide",
      annotation: dose.cyclo_mg_kg >= 60 ? "얼음/EKG" : undefined,
      segments: [
        { text: "Cyclophosphamide " },
        { text: `${n(cycloMgNum, 0)} mg`, red: true },
        { text: " (" },
        { text: d(dose.cyclo_mg_kg), dose: { key: "cyclo_mg_kg", unit: "mg/kg" } },
        { text: ") miv over 1 hr" },
      ],
    },
    { text: "D5W 200ml", indent: 1, italic: true },
    { text: "D-3, D-2", indent: 1, italic: true, checkbox: false },
    { text: "* Hemorrhagic cystitis prevention", indent: 1, italic: true, checkbox: false },
    {
      checkbox: true,
      id: "bucyeto-mesna",
      indent: 2,
      segments: [
        { text: "a) Mesna " },
        { text: `${n(dose.mesna_mg, 0)} mg`, red: true },
        { text: " (" },
        { text: d(dose.mesna_mg), dose: { key: "mesna_mg", unit: "mg/dose" } },
        { text: ") /NS50ml IVs q 6 hr (Start at -30 min before CTX) D-3, D-2" },
      ],
    },
    { text: "b) Hydration", indent: 2, italic: true, checkbox: false },
    {
      checkbox: true,
      id: "hydration-high-bucyeto",
      indent: 2,
      annotation: `${n(hydrationHigh, 0)} ch`,
      segments: [
        { text: "D5WNa77K20(NaK2V) " },
        { text: d(dose.hydration_ml_m2_day), dose: { key: "hydration_ml_m2_day", unit: "mL/m²/day" } },
        { text: " (3L/m²/day), D-3 – D0" },
      ],
    },
    {
      checkbox: true,
      id: "hydration-low-bucyeto",
      indent: 2,
      annotation: `${n(hydrationLow, 0)} ch`,
      segments: [
        { text: d(dose.hydration_taper_ml_m2_day), dose: { key: "hydration_taper_ml_m2_day", unit: "mL/m²/day" } },
        { text: " (1.5L/m²/day), D1 - D4, then tapering, Check serum electrolyte." },
      ],
    },
    {
      text: "Furosemide 10mg (D-3 – D0)",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "bucyeto-furosemide",
    },
    { text: "이후 PRN) Furosemide 10mg", indent: 2, italic: true, checkbox: false },
    { text: "", kind: "spacer" },

    ...autoStemCellInfusion(),

    { text: "3) Supportive care", kind: "section", italic: true },
    {
      text: "Fungal prophylaxis: mycafungin 50mg qd IV (D-7 - ANC>1000 for 3 consecutive days)",
      italic: true,
    },
    {
      text: "– 이전에 invasive mold infection이 있었던 경우 감염내과 상의 후 결정",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "Ciprofloxacin 500mg po bid (D-7 - ANC>1000 for 3 consecutive days)", italic: true },
    { text: "VOD prophylaxis : UDCA 200mg tid PO (D-7 – D+21 혹은 생착시까지)", italic: true },
    gcsfLine(c, dose),
    {
      text: "Vit K 10mg iv weekly:",
      italic: true,
      checkbox: true,
      id: "bucyeto-vitk",
    },
    { text: "", kind: "spacer" },

    { text: "Antiemetics:", kind: "sub", italic: true },
    { text: "D-7~-4 serotonin antagonist IV", indent: 1, italic: true },
    {
      text: "* palonosetron 0.25mg iv, ramo 0.3mg, grani 3mg, ondan 8mg q 12hr",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "고위험군(D-3,D-2)", indent: 1, italic: true, checkbox: false },
    { text: "D-3 aprepitant 125mg PO qd + serotonin antagonist + dexa 12mg IV", indent: 2, italic: true },
    { text: "D-2,-1 aprepitant 80mg PO qd", indent: 2, italic: true },
    { text: "D-2~D0 dexa 8mg IV/PO qd", indent: 2, italic: true },
    { text: "또는", indent: 2, italic: true, checkbox: false },
    { text: "D-3 Fosaprepitant 150mg IV + Serotonin antagonist + dexa 12mg IV", indent: 2, italic: true },
    { text: "D-2~D0 dexa 8mg IV/PO qd", indent: 2, italic: true },
    { text: "혹은", indent: 2, italic: true, checkbox: false },
    { text: "D-3 Netupitant 300mg/Palonosetron 0.5mg PO qd+ dexa 12mg IV", indent: 2, italic: true },
    { text: "D-2~D0 dexa 8mg IV/PO qd", indent: 2, italic: true },
    {
      text: "(prn) lorazepam 0.5-2mg IV q4-6hr or metoclopramide 10mg IV q8hr, olanzapine[D] 5~10mg po",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    {
      text: "* olanzapine 투여 시 metoclopramide 병용 금기",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "", kind: "spacer" },

    { text: "4) Lab F/U", kind: "section", italic: true },
    { text: "1. daily CBC", indent: 1, italic: true, checkbox: false },
    {
      text: "2. Adm batt, e', Mg, Coagulation, U/A (X2/week): daily e'/BUN/Cr (D-6 - D1)",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "3. Chest PA: Weekly", indent: 1, italic: true, checkbox: false },
  ]
}

/* ------------------------------------------------------------------ *
 * BuMel — Busulfan / Melphalan
 * ------------------------------------------------------------------ */
function buildBuMel(c: CalcResult, dose: Doses): RenderLine[] {
  const busulfanMgNum = dose.busulfan_mg_kg * c.busulfanWeight
  const melphalanMgNum = dose.melphalan_mg_m2 * c.bsa
  const reducedMelphalanMg = 50 * c.bsa
  const hydrationHigh = (dose.hydration_ml_m2_day * c.bsa) / 24
  const hydrationLow = (dose.hydration_taper_ml_m2_day * c.bsa) / 24

  return [
    { text: "BuMel Conditioning for AutoSCT", kind: "title" },
    { text: "", kind: "spacer" },
    ...patientSummary(c),
    { text: "", kind: "spacer" },

    { text: "1) Conditioning", kind: "section", italic: true },
    {
      checkbox: true,
      id: "bumel-busulfan",
      segments: [
        { text: "Busulfan " },
        { text: `${n(busulfanMgNum, 0)} mg`, red: true },
        { text: " (" },
        { text: d(dose.busulfan_mg_kg), dose: { key: "busulfan_mg_kg", unit: "mg/kg" } },
        { text: ") miv for 3hrs" },
      ],
    },
    busulfanFluidLine(
      busulfanMgNum,
      "[농도범위에 따라 변환가능, 0.5mg/ml 이상, 0.5mg/mL 에 근접할 때 가장 안정]",
    ),
    { text: "D-6, D-5, D-4", indent: 1, italic: true, checkbox: false },
    { text: "with Sz prophylaxis:", indent: 1, italic: true, checkbox: false },
    {
      text: "Busulfan 투약 3-4시간 전 Levetriacetam 1500mg po loading (D-6)",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "bumel-levetiracetam-loading",
    },
    {
      text: "→ 다음날부터 500mg PO bid (D-5~D-3)",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "bumel-levetiracetam-maintenance",
    },
    { text: "(GFR 30 미만인 경우 250mg bid)", indent: 1, italic: true, checkbox: false },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "bumel-melphalan",
      annotation: "얼음/차광",
      segments: [
        { text: "Melphalan " },
        { text: `${n(melphalanMgNum, 1)} mg`, red: true },
        { text: " (" },
        { text: d(dose.melphalan_mg_m2), dose: { key: "melphalan_mg_m2", unit: "mg/m²" } },
        { text: ") miv over 30 min" },
      ],
    },
    { text: "N/S 500ml [농도범위에 따라 변환가능, 0.45 mg/mL 이하]", indent: 1, italic: true },
    {
      checkbox: false,
      indent: 1,
      italic: true,
      segments: [
        { text: "* GFR 30~50mg/min 일 경우 50mg/m²/day 로 감량: " },
        { text: `${n(reducedMelphalanMg, 1)} mg`, red: true },
      ],
    },
    { text: "* GFR < 30mg/min 일 경우 투여 중지", indent: 1, italic: true, checkbox: false },
    { text: "D-3, D-2", indent: 1, italic: true, checkbox: false },
    { text: "with hydration D5WNa77K20(NaK2V)", indent: 1, italic: true, checkbox: false },
    {
      checkbox: true,
      id: "hydration-high-bumel",
      indent: 2,
      annotation: `${n(hydrationHigh, 0)} ch`,
      segments: [
        { text: d(dose.hydration_ml_m2_day), dose: { key: "hydration_ml_m2_day", unit: "mL/m²/day" } },
        { text: " (3L/m²/day), D-6 - D0" },
      ],
    },
    {
      checkbox: true,
      id: "hydration-low-bumel",
      indent: 2,
      annotation: `${n(hydrationLow, 0)} ch`,
      segments: [
        { text: d(dose.hydration_taper_ml_m2_day), dose: { key: "hydration_taper_ml_m2_day", unit: "mL/m²/day" } },
        { text: " (1.5L/m²/day), D1 - D3, then tapering" },
      ],
    },
    {
      id: "bumel-furosemide",
      text: "PRN) Furosemide 10mg",
      indent: 2,
      italic: true,
      checkbox: false,
    },
    {
      id: "bumel-urine-output",
      text: "Check urine output, pH q 6 hr",
      indent: 2,
      italic: true,
      checkbox: false,
    },
    { text: "if 6hr u/o < 1L, furosemide 1A iv", indent: 2, italic: true, checkbox: false },
    { text: "", kind: "spacer" },

    ...autoStemCellInfusion(),

    { text: "3) Supportive care", kind: "section", italic: true },
    { text: "VOD prophylaxis - Ursodeoxycholic acid(UDCA): 300mg tid D-6~D14", italic: true },
    {
      text: "Fungal prophylaxis: mycafungin 50mg qd IV (D-6 - ANC>1000 for 3 consecutive days)",
      italic: true,
    },
    {
      text: "– 이전에 invasive mold infection이 있었던 경우 감염내과 상의 후 결정",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "Ciprofloxacin 500mg po bid (D-6 - ANC>1000 for 3 consecutive days)", italic: true },
    gcsfLine(c, dose),
    { text: "CMV prophylaxis", kind: "sub", italic: true, checkbox: false },
    {
      checkbox: true,
      id: "bumel-ivig",
      segments: [
        { text: "IVIg " },
        { text: d(dose.ivig_mg_kg), dose: { key: "ivig_mg_kg", unit: "mg/kg" } },
        { text: " iv (D7 부터 2 주간격으로, 3개월까지격주로 500mg/kg, 그후 6개월까지매월 500mg/kg (최장9개월급여))" },
      ],
    },
    {
      text: "CMV 고위험군 (CMV 혈청음성수혜자 + 혈청양성공여자)의 경우",
      italic: true,
      checkbox: false,
    },
    {
      checkbox: false,
      indent: 1,
      segments: [
        { text: "ganciclovir " },
        { text: d(dose.ganciclovir_mg_kg), dose: { key: "ganciclovir_mg_kg", unit: "mg/kg" } },
        { text: " bid IV for 1 week followed by 5mg/kg qd IV from ANC>1000 till D100" },
      ],
    },
    { text: "Vit K 10mg iv weekly:", italic: true, checkbox: true, id: "bumel-vitk" },
    { text: "", kind: "spacer" },

    { text: "Antiemetics:", kind: "sub", italic: true },
    { text: "D-6~-2 serotonin antagonist IV", indent: 1, italic: true },
    {
      text: "* palonosetron 0.25mg, ramo 0.3mg, grani 3mg, ondan 8mg q 12hr",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "D-1,0 serotonin antagonist PO (IV와 동일성분 사용)", indent: 1, italic: true },
    {
      text: "(prn) lorazepam 0.5-2mg IV q4-6hr or metoclopramide 10mg IV q8hr or olanzapine[D] 5~10mg po",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    {
      text: "* olanzapine 투여 시 metoclopramide 병용 금기",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "", kind: "spacer" },

    { text: "4) Lab F/U", kind: "section", italic: true },
    { text: "1. daily CBC", indent: 1, italic: true, checkbox: false },
    {
      text: "2. Adm batt, e', Mg, Coagulation, U/A (X2/week): daily e'/BUN/Cr (D-6 - D1)",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "3. Chest PA: Weekly", indent: 1, italic: true, checkbox: false },
  ]
}

/* ------------------------------------------------------------------ *
 * TBI-Cy — Total Body Irradiation / Cyclophosphamide (MAC)
 * ------------------------------------------------------------------ */
function buildTbiCy(c: CalcResult, dose: Doses): RenderLine[] {
  const cycloMgNum = dose.cyclo_mg_kg * c.tbw
  const hydrationHigh = (dose.hydration_ml_m2_day * c.bsa) / 24
  const hydrationLow = (dose.hydration_taper_ml_m2_day * c.bsa) / 24
  const csaMg = dose.csa_mg_kg * c.tbw
  const tacrolimusMg = dose.tacrolimus_mg_kg_day * c.tbw
  const mtxD1Mg = dose.mtx_mg_m2 * c.bsa
  const mtxFollowupMg = dose.mtx_followup_mg_m2 * c.bsa
  const atgMg = dose.atg_mg_kg * c.tbw
  const atgSolventMl = atgMg * 2
  const mpredMg = dose.mpred_mg_kg * c.tbw

  return [
    { text: "TBI / Cyclophosphamide Conditioning (MAC)", kind: "title" },
    { text: "", kind: "spacer" },
    ...patientSummary(c, false),
    { text: "", kind: "spacer" },

    { text: "1) Conditioning", kind: "section", italic: true },
    {
      text: "Total Body Irradiation (TBI) 300rad x 1",
      italic: true,
      checkbox: false,
      id: "tbi",
    },
    { text: "premed: Acetaminophen 650mg po", indent: 1, italic: true, checkbox: true, id: "tbi-premed-acetaminophen" },
    { text: "diazepam 10mg po", indent: 1, italic: true, checkbox: true, id: "tbi-premed-diazepam" },
    { text: "Hydrocortisone 100mg iv", indent: 1, italic: true, checkbox: true, id: "tbi-premed-hydrocortisone" },
    { text: "Metoclopramide 10mg iv", indent: 1, italic: true, checkbox: true, id: "tbi-premed-metoclopramide" },
    {
      id: "tbi-send-patient",
      text: "Send patient to TR with H-cath capped & diazepam 10mg loaded in syringe",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "D-7, D-6, D-5, D-4", indent: 1, italic: true, checkbox: false },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "tbi-cy-cyclophosphamide",
      annotation: dose.cyclo_mg_kg >= 60 ? "얼음/EKG" : undefined,
      segments: [
        { text: "Cyclophosphamide " },
        { text: `${n(cycloMgNum, 0)} mg`, red: true },
        { text: " (" },
        { text: d(dose.cyclo_mg_kg), dose: { key: "cyclo_mg_kg", unit: "mg/kg" } },
        { text: ") miv over 1 hr" },
      ],
    },
    { text: "D5W 200mL", indent: 1, italic: true },
    { text: "D-3, D-2", indent: 1, italic: true, checkbox: false },
    { text: "※ Hemorrhagic cystitis prevention", indent: 1, italic: true, checkbox: false },
    {
      checkbox: true,
      id: "tbi-cy-mesna",
      indent: 2,
      segments: [
        { text: "a) Mesna " },
        { text: `${n(dose.mesna_mg, 0)} mg`, red: true },
        { text: " (" },
        { text: d(dose.mesna_mg), dose: { key: "mesna_mg", unit: "mg/dose" } },
        { text: ") /NS50ml IVs q 6 hr (Start at -30 min before CTX) D-3, D-2" },
      ],
    },
    { text: "b) Hydration", indent: 2, italic: true, checkbox: false },
    {
      checkbox: true,
      id: "hydration-high-tbi-cy",
      indent: 2,
      annotation: `${n(hydrationHigh, 0)} ch`,
      segments: [
        { text: "D5WNa77K20(NaK2V) " },
        { text: d(dose.hydration_ml_m2_day), dose: { key: "hydration_ml_m2_day", unit: "mL/m²/day" } },
        { text: " (3L/m²/day), D-3 – D0" },
      ],
    },
    {
      checkbox: true,
      id: "hydration-low-tbi-cy",
      indent: 2,
      annotation: `${n(hydrationLow, 0)} ch`,
      segments: [
        { text: d(dose.hydration_taper_ml_m2_day), dose: { key: "hydration_taper_ml_m2_day", unit: "mL/m²/day" } },
        { text: " (1.5L/m²/day), D1 - D4, then tapering, Check serum electrolyte." },
      ],
    },
    {
      text: "Furosemide 10mg (D-3 – D0)",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "tbi-cy-furosemide",
    },
    { text: "이후 PRN) Furosemide 10mg", indent: 2, italic: true, checkbox: false },
    {
      text: "check urine output q 6 hr, if 6hr u/o < 1L or 150ml/hr, furosemide 1A ivs",
      indent: 2,
      italic: true,
      checkbox: false,
    },
    {
      id: "ekg-monitoring-tbi-cy",
      text: "ECG monitor & CK/LD level (D-3 - D1)",
      indent: 2,
      italic: true,
      checkbox: true,
    },
    { text: "", kind: "spacer" },

    { text: "2) Stem cell infusion (D0, (D1), (D2))", kind: "section", italic: true, checkbox: false },
    { text: "At least 48 hours after the completion of chemotherapy", indent: 1, italic: true, checkbox: false },
    {
      text: "Premed (-30 min): chlorpheniramin 4mg ivs",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "tbi-cy-stem-premed",
    },
    { text: "Stem cell infusion: over 5-15min per bag", indent: 1, italic: true, checkbox: false },
    { text: "Check V/S q 30min x4, q 1hr x4", indent: 1, italic: true, checkbox: false },
    { text: "Washing infusion tubing with saline", indent: 1, italic: true, checkbox: false },
    { text: "Keep at bedside for 1 hour after stem cell infusion", indent: 1, italic: true, checkbox: false },
    {
      text: "Prepare chlorpheniramin 4mg, epinephrine, hydrocortisone and O2 kit at bed side",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "", kind: "spacer" },

    { text: "3) Supportive care", kind: "section", italic: true },
    { text: "3-1.Gut decontamination: Ciprofloxacin 500mg po bid (D-7 to ANC > 1,000)", italic: true },
    { text: "3-2.VOD prophylaxis : UDCA 200mg tid PO (D-7 – D+21 혹은 생착시까지)", italic: true },
    {
      text: "3-3.PCP prophylaxis : TMP/SMX(SS) 1T po qd daily (Start at D+21 if ANC>1000) for 6 months or until the discontinuation of immunosuppressant",
      italic: true,
    },
    { text: "3-4.Fungal prophylaxis: micafungin 50mg qd IV (D-7 - ANC>1000 for 3 consecutive days)", italic: true },
    {
      text: "※이전에 invasive mold infection이 있었던 경우 감염내과 상의 후 결정",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "3-5.CMV prophylaxis", kind: "sub", italic: true, checkbox: false },
    {
      text: "3-5-A. CMV IgG (+)이면서 D0 시행한 CMV PCR이 negative인 경우 letermovir prophylaxis",
      italic: true,
      checkbox: false,
    },
    {
      text: "D+7~D+100 letermovir 480mg qd",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "tbi-cy-cmv-letermovir",
    },
    { text: "Cyclosporine과 병용시 240mg qd", indent: 1, italic: true, checkbox: false },
    {
      text: "투여 시작 후에 Cyclosporine을 투여하는 경우: 다음용량을 1일 1회 240 mg로 감량",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    {
      text: "투여 시작 후에 Cyclosporine의 투여중단한 경우: 다음 용량을 1일 1회 480 mg로 증량",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    {
      text: "※ 복용을 잊었을 경우: 사실을 기억한 즉시 복용하며, 다음 복용시점까지 기억하지 못했을 경우 누락한 용량은 생략하고 원래 복용스케줄에 따름 (다음 복용량을 2배로 복용해서는 안됨)",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    {
      text: "※ Cyclosporin과 letermovir 사용 시 atorvastatin, simvastatin, pitavastatin, rosuvastatin, dabigatran 병용 금기",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "3-5-B. 나머지 경우", italic: true, checkbox: false },
    {
      indent: 1,
      checkbox: false,
      segments: [
        { text: "IVIg " },
        { text: d(dose.ivig_mg_kg), dose: { key: "ivig_mg_kg", unit: "mg/kg" } },
        { text: " iv (D+7부터 2 주간격으로, 3개월까지격주로 500mg/kg, 그후 6개월까지매월 500mg/kg (최장9개월급여)" },
      ],
    },
    {
      text: "3-5-C. CMV 고위험군 (CMV 혈청음성수혜자 + 혈청양성공여자)",
      italic: true,
      checkbox: false,
    },
    {
      indent: 1,
      checkbox: false,
      segments: [
        { text: "ganciclovir " },
        { text: d(dose.ganciclovir_mg_kg), dose: { key: "ganciclovir_mg_kg", unit: "mg/kg" } },
        { text: " bid IV for 1 week followed by 5mg/kg qd IV from ANC>1000 till D100" },
      ],
    },
    {
      checkbox: true,
      id: "tbi-cy-acyclovir",
      segments: [
        { text: "3-6.HSV prophylaxis: acyclovir 400 mg PO bid (D-8~D+30); PO 복용 불가 시 IV " },
        { text: d(dose.acyclovir_iv_mg_m2), dose: { key: "acyclovir_iv_mg_m2", unit: "mg/m²" } },
        { text: " q12h over 1hr로 변경, ganciclovir 등 사용 시 acyclovir는 중단" },
      ],
    },
    {
      checkbox: true,
      id: "tbi-cy-gcsf",
      segments: [
        { text: "3-7.G-CSF: Filgrastim " },
        { text: d(dose.gcsf_ug_m2), dose: { key: "gcsf_ug_m2", unit: "ug/m²" } },
        { text: " (or 450 ug) SQ or MIVs (보험기준상 ANC 3000까지 투여 가능)" },
      ],
    },
    vitKLine("3-8. "),
    { text: "", kind: "spacer" },

    { text: "3-9. Antiemetics:", kind: "sub", italic: true },
    { text: "D-7~D-4 serotonin antagonist IV [grani 3mg, ondan 8mg q12hr 중택1]", indent: 1, italic: true },
    { text: "D-3 Aprepitant 125mg po qd + Serotonin antagonist IV + Dexa 12mg iv", indent: 1, italic: true },
    { text: "D-2~D-1 Aprepitant 80mg po qd", indent: 1, italic: true },
    { text: "D-2~D0 Dexa 8mg po or iv qd", indent: 1, italic: true },
    {
      text: "(prn) lorazepam 1mg iv or metoclopramide 10mg IV q8h or olanzapine[D] 5~10mg po",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "또는", indent: 1, italic: true, checkbox: false },
    { text: "D-7~D-4 serotonin antagonist IV [grani 3mg, ondan 8mg q12hr 중택1]", indent: 1, italic: true },
    { text: "D-3 Netupitant 300mg/Palonosetron0.5mg PO qd + Dexa 12mg iv", indent: 1, italic: true },
    { text: "D-2~D0 Dexa 8mg po or iv qd", indent: 1, italic: true },
    {
      text: "(prn) lorazepam 1mg iv or metoclopramide 10mg IV q8h or olanzapine[D] 5~10mg po",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "※olanzapine 투여 시 metoclopramide 병용 금기", indent: 1, italic: true, checkbox: false },
    { text: "※regimen상 steroid 투여되면 중복해서 투여하지 않아도 됨", indent: 1, italic: true, checkbox: false },
    { text: "", kind: "spacer" },

    { text: "4) GVHD prophylaxis", kind: "section", italic: true },
    { text: "★ related donor는 (matched sibling, haploidentical) CsA+MTX", indent: 1, italic: true, checkbox: false },
    { text: "★ unrelated donor는 (KMDP, JMDP 등) tacrolimus+MTX+ ATG", indent: 1, italic: true, checkbox: false },
    { text: "4-1. Cyclosporin A or Tacrolimus", kind: "sub", italic: true, checkbox: false },
    { text: "Cyclosporin A사용시 (related donors)", indent: 1, italic: true, checkbox: false },
    {
      checkbox: true,
      id: "tbi-cy-csa",
      indent: 1,
      segments: [
        { text: "Cyclosporin A " },
        { text: `${n(csaMg, 1)} mg`, red: true },
        { text: " (" },
        { text: d(dose.csa_mg_kg), dose: { key: "csa_mg_kg", unit: "mg/kg" } },
        { text: ") civ (D-2): stem cell infusion 48h 전부터 시작" },
      ],
    },
    {
      text: "이후 용량은 혈청 cyclosporin level 보고 Therapeutic range 250-400ng/mL로 titration",
      indent: 2,
      italic: true,
      checkbox: false,
    },
    {
      text: "이후 경구섭취 가능하게 되면 지정의 confirm 하에 IV 용량의 약 2배 용량을 2번 나누어 (10AM, 10PM)로 경구로 변경 후 혈청 Cyclosporin A level을 보고 용량을 조절한다. 경구투약시작 3시간후 IV CsA중단한다. (up to day 120~180 in case of no GVHD)",
      indent: 2,
      italic: true,
      checkbox: false,
    },
    { text: "Tacrolimus 사용시 (unrelated donor)", indent: 1, italic: true, checkbox: false },
    {
      checkbox: true,
      id: "tbi-cy-tacrolimus",
      indent: 1,
      segments: [
        { text: "Tacrolimus " },
        { text: `${n(tacrolimusMg, 2)} mg/day`, red: true },
        { text: " (" },
        { text: d(dose.tacrolimus_mg_kg_day), dose: { key: "tacrolimus_mg_kg_day", unit: "mg/kg/day" } },
        { text: ") IV loading dose (D-2): stem cell infusion 48h 전부터 시작" },
      ],
    },
    {
      text: "이후 용량은 혈청 Tacrolimus level을 보고 Therapeutic range 10~20ng/mL로 titration",
      indent: 2,
      italic: true,
      checkbox: false,
    },
    {
      text: "경구 섭취 가능하게 되면 지정의 confirm 하에 IV 용량의 약 3.5배 용량을 2번 나누어 (10AM, 10PM)로 경구 약제로 변경하고, 혈청 Tacrolimus level을 보고 용량을 조절한다. 경구투약 전날 10PM 에 IV Tacrolimus중단한다. (up to day 90~180 in case of no GVHD)",
      indent: 2,
      italic: true,
      checkbox: false,
    },
    { text: "Tacrolimus level 5ng/mL 미만: 50% 증량", indent: 2, italic: true, checkbox: false },
    { text: "5-10ng/mL: 25% 증량", indent: 2, italic: true, checkbox: false },
    { text: "10-20ng/mL: 변경없이 유지", indent: 2, italic: true, checkbox: false },
    { text: "20ng/mL 초과: 6시간 투약중단 후 50% 감량하여 투약", indent: 2, italic: true, checkbox: false },
    {
      text: "* 단 voriconazole을 병용 사용하는 경우 PO 변경 시 보수적으로 CsA는 2배 용량 -> 1.5배 용량으로, tacrolimus는 3.5배용량 -> 3배 용량으로 변환하여 시작한다",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "4-2. MTX", kind: "sub", italic: true, checkbox: false },
    {
      checkbox: true,
      id: "tbi-cy-mtx",
      indent: 1,
      segments: [
        { text: "MTX " },
        { text: `${n(mtxD1Mg, 1)} mg`, red: true },
        { text: " (" },
        { text: d(dose.mtx_mg_m2), dose: { key: "mtx_mg_m2", unit: "mg/m²" } },
        { text: ") ivp (D1) → " },
        { text: `${n(mtxFollowupMg, 1)} mg`, red: true },
        { text: " (" },
        { text: d(dose.mtx_followup_mg_m2), dose: { key: "mtx_followup_mg_m2", unit: "mg/m²" } },
        { text: ") ivp (D3, D6)" },
      ],
    },
    { text: "4-3. ATG (unrelated donor, 반드시 confirm후 사용)", kind: "sub", italic: true, checkbox: false },
    {
      checkbox: true,
      id: "tbi-cy-atg",
      segments: [
        { text: "ATG (Rabbit, Thymoglobulin) " },
        { text: `${n(atgMg, 1)} mg`, red: true },
        { text: " (" },
        { text: d(dose.atg_mg_kg), dose: { key: "atg_mg_kg", unit: "mg/kg/day" } },
        { text: ") miv over 6 hrs via I-med" },
      ],
    },
    {
      indent: 1,
      italic: true,
      segments: [
        { text: "N/S " },
        { text: `${n(atgSolventMl, 0)} mL`, red: true },
        { text: " (final conc. 0.5mg/ml – ATG 용량의 2배 양에 해당하는 희석 수액 처방)" },
      ],
    },
    { text: "D-3, D-2", indent: 1, italic: true, checkbox: false },
    {
      checkbox: true,
      id: "tbi-cy-mpred",
      segments: [
        { text: "With methylprednisolone " },
        { text: `${n(mpredMg, 0)} mg`, red: true },
        { text: " (" },
        { text: d(dose.mpred_mg_kg), dose: { key: "mpred_mg_kg", unit: "mg/kg" } },
        { text: ") miv over 30mins q12hr (daily 2mg/kg)" },
      ],
    },
    { text: "D5W 100ml", indent: 1, italic: true },
    { text: "D-3, D-2", indent: 1, italic: true, checkbox: false },
    { text: "※Premedication for Thymoglobulin", indent: 1, italic: true, checkbox: false },
    {
      text: "1시간 전 Acetaminophen 600mg po, Hydroxyzine 1T po",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "tbi-cy-atg-premed-1h",
    },
    {
      text: "30분전 Chlorpheniramin 4mg iv (with methylprednisolone as above)",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "tbi-cy-atg-premed-30m",
    },
    {
      text: "ATG 30분후 Hydrocortisone 50mg iv",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "tbi-cy-atg-post-hydrocortisone",
    },
    {
      text: "Shivering 등의 증상 발생시 prn) pethidine 25mg IV",
      indent: 2,
      italic: true,
      checkbox: false,
    },
    { text: "", kind: "spacer" },

    { text: "5) Lab F/U", kind: "section", italic: true },
    {
      text: "1. Cyclosporin or Tacrolimus level (peripheral blood or Cyclosporin 혹은 Tacrolimus 안들어가는 line에서 sample: in EDTA tube): x3/week, 처음 dose titration은 cyclosporin 또는 tacrolimus 투약 3일째 level확인하여 조절",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "2. daily CBC/differential", indent: 1, italic: true, checkbox: false },
    {
      text: "3. Adm batt, e', Mg, Coagulation, U/A (2/week):daily e' B/Cr (D-8 - D0)",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    { text: "4. Weekly ECG, CPA", indent: 1, italic: true, checkbox: false },
    { text: "5. 1주마다 CMV antigenemia check", indent: 1, italic: true, checkbox: false },
    { text: "6. ANC < 1000 기간 동안은 weekly aspergillus Ag", indent: 1, italic: true, checkbox: false },
    { text: "", kind: "spacer" },

    { text: "6) Donor preparation (PBSCT인경우)", kind: "section", italic: true },
    {
      text: "G-CSF 600 ug S.Q. qd 9PM (D-4, D-3, D-2, D-1, (D0))",
      indent: 1,
      italic: true,
      checkbox: false,
      id: "tbi-cy-donor-gcsf",
    },
    {
      text: "POST-BMT TEST (STR) sampling (D0) (if not done previously)",
      indent: 1,
      italic: true,
      checkbox: false,
      id: "tbi-cy-donor-str",
    },
    {
      text: "CBC(em) D0, (D1), (D2) 7AM and post-collection",
      indent: 1,
      italic: true,
      checkbox: false,
      id: "tbi-cy-donor-cbc",
    },
    { text: "iCa++, e'/BUN/Cr x2/day", indent: 1, italic: true, checkbox: false },
    { text: "if Ca++ ↓ → calcium gluconate (in N/S 100mL)", indent: 1, italic: true, checkbox: false },
    { text: "Stem cell collection with permission", indent: 1, italic: true, checkbox: false },
    { text: "Product에서 CBC(정규), CBC(em), CD34, T cell subset panel(세포면역)", indent: 1, italic: true, checkbox: false },
    { text: "Target: CD34 > 5x10^6/kg", indent: 1, italic: true, checkbox: false },
  ]
}

/* ------------------------------------------------------------------ *
 * FC — Fludarabine / Cyclophosphamide for Kymriah
 * ------------------------------------------------------------------ */
function buildFc(c: CalcResult, dose: Doses): RenderLine[] {
  const fludarabineMg = dose.fludarabine_mg_m2 * c.bsa
  const cycloMg = dose.cyclo_mg_m2 * c.bsa

  return [
    { text: "FC conditioning for kymriah (DLBCL)", kind: "title" },
    { text: "", kind: "spacer" },
    ...patientSummary(c, false),
    { text: "", kind: "spacer" },
    { text: "투여순서: Fludarabine → Cyclophosphamide", kind: "sub", italic: true, checkbox: false },
    {
      checkbox: true,
      id: "fc-fludarabine",
      segments: [
        { text: "Fludarabine " },
        { text: `${n(fludarabineMg, 1)} mg`, red: true },
        { text: " (" },
        { text: d(dose.fludarabine_mg_m2), dose: { key: "fludarabine_mg_m2", unit: "mg/m²" } },
        { text: ") miv over 30min" },
      ],
    },
    { text: "NS 100 ml", indent: 1, italic: true },
    { text: "D-5~D-3", indent: 1, italic: true, checkbox: false },
    { text: "", kind: "spacer" },
    {
      checkbox: true,
      id: "fc-cyclophosphamide",
      segments: [
        { text: "Cyclophosphamide " },
        { text: `${n(cycloMg, 1)} mg`, red: true },
        { text: " (" },
        { text: d(dose.cyclo_mg_m2), dose: { key: "cyclo_mg_m2", unit: "mg/m²" } },
        { text: ") miv over 30min" },
      ],
    },
    { text: "D5W 50ml", indent: 1, italic: true },
    { text: "D-5~D-3", indent: 1, italic: true, checkbox: false },
    { text: "", kind: "spacer" },

    {
      text: "Supportive Care",
      kind: "section",
      italic: true,
      checkbox: false,
    },
    {
      text: "(전신 코르티코스테로이드의 예방적 사용은 이 약의 활성을 간섭할 수 있으므로 투여하지 않아야 한다.)",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    {
      checkbox: true,
      id: "fc-tmp-smx",
      segments: [
        {
          text: "1. PCP prophylaxis : TMP/SMX(400/80mg) 1T po qd daily (D-5부터 CAR T-cell 투약일 6개월 혹은 CD4+>200/mcl)",
        },
      ],
      italic: true,
    },
    {
      checkbox: true,
      id: "fc-fluconazole",
      segments: [
        {
          text: "2. Fungal prophylaxis: fluconazole 50mg 1c + fluconazole 150mg 1t qd (D-5부터 ANC>1000 for 3 consecutive days)",
        },
      ],
      italic: true,
    },
    {
      text: "※이전에 invasive mold infection이 있었던 경우 감염내과 상의 후 결정",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    {
      checkbox: true,
      id: "fc-acyclovir",
      segments: [
        { text: "3. Anti-viral prophylaxis: acyclovir[보험] 400mg qd (D-5부터 CAR T-cell 투약일 6개월)" },
      ],
      italic: true,
    },
    { text: "", kind: "spacer" },

    { text: "2. Antiemetics(중등도위험군)", kind: "sub", italic: true },
    {
      checkbox: true,
      id: "fc-antiemetic-iv",
      segments: [
        { text: "D-5,-4,-3 serotonin antagonist IV (palono 0.25mg qd, grani 3mg qd, ondan 8mg q 12hr)" },
      ],
      indent: 1,
      italic: true,
    },
    {
      checkbox: true,
      id: "fc-antiemetic-po",
      segments: [{ text: "D-2,-1,0 serotonin antagonist PO (IV 와 동일 제제 투여)" }],
      indent: 1,
      italic: true,
    },
    {
      text: "prn) lorazepam 0.5-2mg IV q4-6h OR metoclopramide 10mg IV q8h or olanzapine[D] 5~10mg po",
      indent: 1,
      italic: true,
      checkbox: false,
    },
    {
      text: "* olanzapine 투여 시 metoclopramide 병용 금기",
      indent: 1,
      italic: true,
      checkbox: false,
    },
  ]
}

/* ------------------------------------------------------------------ *
 * Shared blocks
 * ------------------------------------------------------------------ */
function autoStemCellInfusion(): RenderLine[] {
  return [
    { text: "2) Stem cell infusion", kind: "section", italic: true },
    { text: "At least 48 hrs after the completion of chemotherapy", indent: 1, italic: true, checkbox: false },
    {
      text: "Premed: Chlorpheniramin 4mg(-15 min)",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "auto-stem-premed-cpm",
    },
    { text: "Stem cell infusion: over 15-30 min per bag", indent: 1, italic: true, checkbox: false },
    { text: "Check V/S q 30min x4, q 1hr x4", indent: 1, italic: true, checkbox: false },
    { text: "Washing infusion tubing with saline", indent: 1, italic: true, checkbox: false },
    { text: "Keep at bedside for 1 hour after stem cell infusion", indent: 1, italic: true, checkbox: false },
    { text: "", kind: "spacer" },
  ]
}

function patientSummary(c: CalcResult, showAbw = true): RenderLine[] {
  const lines: RenderLine[] = [
    {
      segments: [{ text: "Actual Bwt: " }, { text: `${formatPatientNumber(c.tbw)} Kg`, red: true }],
      kind: "sub",
    },
  ]
  if (showAbw) {
    lines.push({
      segments: [{ text: "ABW25: " }, { text: `${formatPatientNumber(c.abw25)} Kg`, red: true }],
      kind: "sub",
    })
  }
  lines.push({
    segments: [{ text: "BSA: " }, { text: `${formatPatientNumber(c.bsa)} m²`, red: true }],
    kind: "sub",
  })
  return lines
}

function stemCellInfusion(): RenderLine[] {
  return [
    { text: "2) Stem cell infusion", kind: "section", italic: true },
    { text: "At least 48 hrs after the completion of chemotherapy", indent: 1, italic: true },
    premedChlorpheniramineLine(),
    { text: "Stem cell infusion: over 5-10 min per bag", indent: 1, italic: true },
    { text: "Check V/S q 30min x4, q 1hr x4", indent: 1, italic: true },
    { text: "Washing infusion tubing with saline", indent: 1, italic: true },
    { text: "Keep at bedside for 1 hour after stem cell infusion", indent: 1, italic: true },
    { text: "", kind: "spacer" },
  ]
}

function thioBuCySupportive(c: CalcResult, dose: Doses): RenderLine[] {
  return [
    { text: "3) Supportive care", kind: "section", italic: true },
    { text: "Gut decontamination: Ciprofloxacin 500mg po bid (D-8 to ANC > 1,000)", italic: true },
    { text: "VOD prophylaxis: UDCA 200mg tid PO (D-7 – D+21 혹은 생착 시까지)", italic: true },
    { text: "Fungal prophylaxis: Micafungin 50mg qd IV (D-8 – ANC>1000 for 3 consecutive days)", italic: true },
    {
      text: "CMV prophylaxis: letermovir 또는 IVIg 500mg/kg iv (조건에 따라)",
      italic: true,
      checkbox: true,
      id: "cmv-proph",
    },
    { text: "  IVIg 500mg/kg iv (D7부터 2주 간격, 3개월까지 격주 500mg/kg, 이후 6개월까지 매월 500mg/kg, 최장 9개월 급여)", indent: 1, italic: true },
    gcsfLine(c, dose),
    vitKLine(),
    { text: "", kind: "spacer" },
  ]
}

function highRiskAntiemetics(): RenderLine[] {
  return [
    { text: "Antiemetics:", kind: "sub", italic: true },
    { text: "D-8  Palonosetron 0.25mg IV + Olanzapine 10mg qd [D]", indent: 1, italic: true, checkbox: true, id: "ae-d8" },
    { text: "D-7~D-6  Olanzapine 10mg qd [D]", indent: 1, italic: true, checkbox: true, id: "ae-d7" },
    { text: "D-5~D-4  Serotonin antagonist IV", indent: 1, italic: true, checkbox: true, id: "ae-d5" },
    { text: "고위험군 (D-3, D-2)", indent: 1, italic: true },
    { text: "D-3  aprepitant 125mg PO + Serotonin antagonist IV + dexamethasone 12mg iv", indent: 2, italic: true, checkbox: true, id: "ae-hr-d3-apr" },
    { text: "D-2, D-1  aprepitant 80mg PO + dexamethasone 8mg", indent: 2, italic: true, checkbox: true, id: "ae-hr-d2-apr" },
    { text: "or D-3 Fosaprepitant 150mg + Serotonin antagonist + dexamethasone 12mg iv", indent: 2, italic: true },
    { text: "   D-2, D-1 dexamethasone 8mg", indent: 2, italic: true },
    { text: "or D-3 Netupitant 300mg/Palonosetron 0.5mg PO qd + dexamethasone 12mg iv", indent: 2, italic: true },
    { text: "   D-2, D-1 dexamethasone 8mg po or iv qd", indent: 2, italic: true },
    { text: "prn) lorazepam 0.5-2mg IV q4-6h OR metoclopramide 10mg IV q8h or olanzapine[D] 10mg po", indent: 1, italic: true },
    { text: "* olanzapine 투여 시 metoclopramide 병용 금기", indent: 1, italic: true },
    { text: "", kind: "spacer" },
  ]
}

function labFU(): RenderLine[] {
  return [
    { text: "4) Lab F/U", kind: "section", italic: true },
    { text: "1. daily CBC", indent: 1, italic: true },
    { text: "2. Adm batt, e', Mg, Coagulation, U/A (2/week): daily e' B/Cr (D-8 – D0)", indent: 1, italic: true },
    { text: "3. Weekly ECG, CPA", indent: 1, italic: true },
    { text: "4. 1주마다 CMV antigenemia check", indent: 1, italic: true },
  ]
}

/* ------------------------------------------------------------------ *
 * D-day 표기가 포함된 모든 라인에 체크박스 자동 부여
 * ------------------------------------------------------------------ */

/** "D-6, D-5, D-4, D-3" / "D-3, -2  for 2 days" 처럼 날짜만 있는 라벨 라인 */
const DAY_LABEL_ONLY = /^\s*D\s?[+-]?\s?\d+(\s*(,|~|–|-|to|and)\s*(D\s?)?[+-]?\s?\d+)*\s*(for\s+\d+\s+days?)?\s*$/i

/** 본문에 D-day 표기가 포함되어 있는지 */
const HAS_DAY_TOKEN = /D\s?[+-]\s?\d/

/** PRN, 주의/설명, 대안 선택지는 날짜가 있어도 실제 처방 체크박스를 만들지 않는다. */
const NON_ORDER_PREFIX =
  /^(?:\(?(?:prn)\)?(?:\s|$)|\*|※|#|[-–]|or\b|(?:또는|혹은)(?:\s|$)|\(|check\b|if\b|send\b|prepare\b|washing\b|keep\b|at least\b|이후(?:\s|$))/i

function lineText(line: RenderLine): string {
  if (line.segments) return line.segments.map((s) => s.text).join("")
  return line.text ?? ""
}

/**
 * D-/D+ 표기가 들어간 모든 내용 라인 앞에 체크박스를 붙인다.
 * - 이미 checkbox가 지정된 라인은 그대로 유지
 * - 제목/섹션/공백 라인, 날짜만 적힌 라벨 라인은 제외
 */
export function withDayCheckboxes(lines: RenderLine[]): RenderLine[] {
  let inLabSection = false

  return lines.map((line, i) => {
    const kind = line.kind ?? "normal"
    const text = lineText(line).trim()

    if (kind === "section" || kind === "title") {
      inLabSection = /Lab F\/U/i.test(text)
    }

    // 명시한 false도 그대로 존중한다. (대안/주의/CMV 조건 헤더 등에 사용)
    if (line.checkbox !== undefined) return line
    if (kind === "spacer" || kind === "title" || kind === "section" || kind === "sub") return line
    if (inLabSection) return { ...line, checkbox: false }
    if (!text) return line
    if (!HAS_DAY_TOKEN.test(text)) return line
    if (DAY_LABEL_ONLY.test(text)) return line
    if (NON_ORDER_PREFIX.test(text)) return { ...line, checkbox: false }

    return { ...line, checkbox: true, id: line.id ?? `dayline-${i}` }
  })
}

const BUILDERS: Record<string, (c: CalcResult, dose: Doses) => RenderLine[]> = {
  thiobucy: buildThioBuCy,
  hdmel: buildHDMEL,
  bucyeto: buildBuCyEto,
  bumel: buildBuMel,
  buflubatg: buildBufluATG,
  "buflu-ptcy": buildBufluPTCy,
  "tbi-cy": buildTbiCy,
  fc: buildFc,
}

export function buildRegimenLines(
  regimenId: string | null,
  calc: CalcResult,
  overrides: DoseOverrides = {},
  donorType: DonorType = null,
): RenderLine[] {
  if (!regimenId) return []
  const builder = BUILDERS[regimenId]
  if (!builder) return []
  const dose = mergeDoseOverrides(regimenId, overrides) as Doses
  if (regimenId === "buflubatg" && donorType != null) {
    dose.atg_mg_kg = donorType === "related" ? 1.5 : 2.5
  }
  return withDayCheckboxes(builder(calc, dose))
}
