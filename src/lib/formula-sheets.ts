// Formula sheet content. Add a new subject here and it appears in the in-page
// formula library automatically; the UI does not need to change.
export interface BilingualLabel {
  zh: string
  en: string
}

export interface FormulaConstant {
  label: BilingualLabel
  value: string
}

export interface FormulaEquation {
  label: BilingualLabel
  formula: string
}

export interface FormulaIon {
  formula: string
  name: string
}

export interface FormulaSubject {
  key: string
  label: BilingualLabel
  /** Show the periodic-table tab (chemistry). */
  periodic?: boolean
  constants: FormulaConstant[]
  equations: FormulaEquation[]
  ions: FormulaIon[]
}

const CHEMISTRY: FormulaSubject = {
  key: 'chemistry',
  label: { zh: '化学', en: 'Chemistry' },
  periodic: true,
  constants: [
    { label: { zh: '气体常数 R', en: 'Gas constant R' }, value: '8.314 J mol⁻¹ K⁻¹ = 0.08206 L atm mol⁻¹ K⁻¹' },
    { label: { zh: '阿伏加德罗常数 Nₐ', en: 'Avogadro constant Nₐ' }, value: '6.022 × 10²³ mol⁻¹' },
    { label: { zh: '普朗克常数 h', en: 'Planck constant h' }, value: '6.626 × 10⁻³⁴ J s' },
    { label: { zh: '光速 c', en: 'Speed of light c' }, value: '2.998 × 10⁸ m s⁻¹' },
    { label: { zh: '水的比热容', en: 'Specific heat capacity of water' }, value: '4.18 J g⁻¹ °C⁻¹' },
    { label: { zh: '标准状况气体摩尔体积', en: 'Molar volume at STP' }, value: '22.4 L mol⁻¹' },
    { label: { zh: '压强换算', en: 'Pressure conversion' }, value: '1 atm = 760 mmHg = 101.3 kPa' },
    { label: { zh: '摄氏–开尔文', en: 'Celsius–Kelvin' }, value: 'T / K = t / °C + 273.15' },
    { label: { zh: '体积换算', en: 'Volume conversion' }, value: '1 L = 1 dm³ = 1000 cm³' },
    { label: { zh: '物质的量换算', en: 'Amount conversion' }, value: '1 mol = 1000 mmol' },
  ],
  equations: [
    { label: { zh: '物质的量（质量）', en: 'Moles from mass' }, formula: 'n = m / M' },
    { label: { zh: '粒子数', en: 'Number of particles' }, formula: 'N = n × Nₐ' },
    { label: { zh: '物质的量浓度', en: 'Molarity' }, formula: 'c = n / V' },
    { label: { zh: '溶液的稀释', en: 'Dilution' }, formula: 'c₁V₁ = c₂V₂' },
    { label: { zh: '理想气体状态方程', en: 'Ideal gas law' }, formula: 'PV = nRT' },
    { label: { zh: '量热（比热容）', en: 'Calorimetry' }, formula: 'q = mcΔT' },
    { label: { zh: '反应焓（标准生成焓）', en: 'Enthalpy from formation data' }, formula: 'ΔH°ᵣₓₙ = ΣΔH°f(products) − ΣΔH°f(reactants)' },
    { label: { zh: '波速与频率', en: 'Wave speed and frequency' }, formula: 'c = λν' },
    { label: { zh: '光子能量', en: 'Photon energy' }, formula: 'E = hν = hc / λ' },
    { label: { zh: '光电效应', en: 'Photoelectric effect' }, formula: 'KEₘₐₓ = hν − Φ' },
    { label: { zh: '质量分数', en: 'Percentage by mass' }, formula: '% element = (mass of element / molar mass) × 100' },
    { label: { zh: '产率', en: 'Percentage yield' }, formula: '% yield = (actual yield / theoretical yield) × 100' },
  ],
  ions: [
    { formula: 'NH₄⁺', name: 'ammonium' },
    { formula: 'NO₃⁻', name: 'nitrate' },
    { formula: 'OH⁻', name: 'hydroxide' },
    { formula: 'SO₄²⁻', name: 'sulfate' },
    { formula: 'CO₃²⁻', name: 'carbonate' },
    { formula: 'PO₄³⁻', name: 'phosphate' },
    { formula: 'CH₃COO⁻', name: 'acetate' },
    { formula: 'ClO₃⁻', name: 'chlorate' },
    { formula: 'MnO₄⁻', name: 'permanganate' },
    { formula: 'Cr₂O₇²⁻', name: 'dichromate' },
    { formula: 'HCO₃⁻', name: 'hydrogencarbonate' },
    { formula: 'HSO₄⁻', name: 'hydrogensulfate' },
  ],
}

export const FORMULA_SUBJECTS: FormulaSubject[] = [CHEMISTRY]

export function subjectByKey(key: string): FormulaSubject {
  return FORMULA_SUBJECTS.find(s => s.key === key) || FORMULA_SUBJECTS[0]
}
