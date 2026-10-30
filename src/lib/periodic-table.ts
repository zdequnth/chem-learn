// Periodic-table data for the in-page formula sheet. Masses are standard
// atomic weights; radioactive elements without a stable isotope use the mass
// number of their most stable isotope in parentheses.
export type ElementCategory =
  | 'alkali' | 'alkaline' | 'transition' | 'post' | 'metalloid'
  | 'nonmetal' | 'halogen' | 'noble' | 'lanthanide' | 'actinide'

export interface Element {
  z: number
  sym: string
  name: string
  mass: string
  group: number
  row: number
  category: ElementCategory
}

// [Z, symbol, English name, relative atomic mass, group, grid row, category]
// Rows 1–7 are the main table; rows 9–10 are the lanthanides and actinides.
type Raw = [number, string, string, string, number, number, ElementCategory]

const RAW: Raw[] = [
  [1, 'H', 'Hydrogen', '1.008', 1, 1, 'nonmetal'],
  [2, 'He', 'Helium', '4.003', 18, 1, 'noble'],
  [3, 'Li', 'Lithium', '6.94', 1, 2, 'alkali'],
  [4, 'Be', 'Beryllium', '9.012', 2, 2, 'alkaline'],
  [5, 'B', 'Boron', '10.81', 13, 2, 'metalloid'],
  [6, 'C', 'Carbon', '12.011', 14, 2, 'nonmetal'],
  [7, 'N', 'Nitrogen', '14.007', 15, 2, 'nonmetal'],
  [8, 'O', 'Oxygen', '15.999', 16, 2, 'nonmetal'],
  [9, 'F', 'Fluorine', '18.998', 17, 2, 'halogen'],
  [10, 'Ne', 'Neon', '20.180', 18, 2, 'noble'],
  [11, 'Na', 'Sodium', '22.990', 1, 3, 'alkali'],
  [12, 'Mg', 'Magnesium', '24.305', 2, 3, 'alkaline'],
  [13, 'Al', 'Aluminium', '26.982', 13, 3, 'post'],
  [14, 'Si', 'Silicon', '28.085', 14, 3, 'metalloid'],
  [15, 'P', 'Phosphorus', '30.974', 15, 3, 'nonmetal'],
  [16, 'S', 'Sulfur', '32.06', 16, 3, 'nonmetal'],
  [17, 'Cl', 'Chlorine', '35.45', 17, 3, 'halogen'],
  [18, 'Ar', 'Argon', '39.948', 18, 3, 'noble'],
  [19, 'K', 'Potassium', '39.098', 1, 4, 'alkali'],
  [20, 'Ca', 'Calcium', '40.078', 2, 4, 'alkaline'],
  [21, 'Sc', 'Scandium', '44.956', 3, 4, 'transition'],
  [22, 'Ti', 'Titanium', '47.867', 4, 4, 'transition'],
  [23, 'V', 'Vanadium', '50.942', 5, 4, 'transition'],
  [24, 'Cr', 'Chromium', '51.996', 6, 4, 'transition'],
  [25, 'Mn', 'Manganese', '54.938', 7, 4, 'transition'],
  [26, 'Fe', 'Iron', '55.845', 8, 4, 'transition'],
  [27, 'Co', 'Cobalt', '58.933', 9, 4, 'transition'],
  [28, 'Ni', 'Nickel', '58.693', 10, 4, 'transition'],
  [29, 'Cu', 'Copper', '63.546', 11, 4, 'transition'],
  [30, 'Zn', 'Zinc', '65.38', 12, 4, 'transition'],
  [31, 'Ga', 'Gallium', '69.723', 13, 4, 'post'],
  [32, 'Ge', 'Germanium', '72.630', 14, 4, 'metalloid'],
  [33, 'As', 'Arsenic', '74.922', 15, 4, 'metalloid'],
  [34, 'Se', 'Selenium', '78.971', 16, 4, 'nonmetal'],
  [35, 'Br', 'Bromine', '79.904', 17, 4, 'halogen'],
  [36, 'Kr', 'Krypton', '83.798', 18, 4, 'noble'],
  [37, 'Rb', 'Rubidium', '85.468', 1, 5, 'alkali'],
  [38, 'Sr', 'Strontium', '87.62', 2, 5, 'alkaline'],
  [39, 'Y', 'Yttrium', '88.906', 3, 5, 'transition'],
  [40, 'Zr', 'Zirconium', '91.224', 4, 5, 'transition'],
  [41, 'Nb', 'Niobium', '92.906', 5, 5, 'transition'],
  [42, 'Mo', 'Molybdenum', '95.95', 6, 5, 'transition'],
  [43, 'Tc', 'Technetium', '(98)', 7, 5, 'transition'],
  [44, 'Ru', 'Ruthenium', '101.07', 8, 5, 'transition'],
  [45, 'Rh', 'Rhodium', '102.91', 9, 5, 'transition'],
  [46, 'Pd', 'Palladium', '106.42', 10, 5, 'transition'],
  [47, 'Ag', 'Silver', '107.87', 11, 5, 'transition'],
  [48, 'Cd', 'Cadmium', '112.41', 12, 5, 'transition'],
  [49, 'In', 'Indium', '114.82', 13, 5, 'post'],
  [50, 'Sn', 'Tin', '118.71', 14, 5, 'post'],
  [51, 'Sb', 'Antimony', '121.76', 15, 5, 'metalloid'],
  [52, 'Te', 'Tellurium', '127.60', 16, 5, 'metalloid'],
  [53, 'I', 'Iodine', '126.90', 17, 5, 'halogen'],
  [54, 'Xe', 'Xenon', '131.29', 18, 5, 'noble'],
  [55, 'Cs', 'Caesium', '132.91', 1, 6, 'alkali'],
  [56, 'Ba', 'Barium', '137.33', 2, 6, 'alkaline'],
  [57, 'La', 'Lanthanum', '138.91', 3, 9, 'lanthanide'],
  [58, 'Ce', 'Cerium', '140.12', 4, 9, 'lanthanide'],
  [59, 'Pr', 'Praseodymium', '140.91', 5, 9, 'lanthanide'],
  [60, 'Nd', 'Neodymium', '144.24', 6, 9, 'lanthanide'],
  [61, 'Pm', 'Promethium', '(145)', 7, 9, 'lanthanide'],
  [62, 'Sm', 'Samarium', '150.36', 8, 9, 'lanthanide'],
  [63, 'Eu', 'Europium', '151.96', 9, 9, 'lanthanide'],
  [64, 'Gd', 'Gadolinium', '157.25', 10, 9, 'lanthanide'],
  [65, 'Tb', 'Terbium', '158.93', 11, 9, 'lanthanide'],
  [66, 'Dy', 'Dysprosium', '162.50', 12, 9, 'lanthanide'],
  [67, 'Ho', 'Holmium', '164.93', 13, 9, 'lanthanide'],
  [68, 'Er', 'Erbium', '167.26', 14, 9, 'lanthanide'],
  [69, 'Tm', 'Thulium', '168.93', 15, 9, 'lanthanide'],
  [70, 'Yb', 'Ytterbium', '173.05', 16, 9, 'lanthanide'],
  [71, 'Lu', 'Lutetium', '174.97', 17, 9, 'lanthanide'],
  [72, 'Hf', 'Hafnium', '178.49', 4, 6, 'transition'],
  [73, 'Ta', 'Tantalum', '180.95', 5, 6, 'transition'],
  [74, 'W', 'Tungsten', '183.84', 6, 6, 'transition'],
  [75, 'Re', 'Rhenium', '186.21', 7, 6, 'transition'],
  [76, 'Os', 'Osmium', '190.23', 8, 6, 'transition'],
  [77, 'Ir', 'Iridium', '192.22', 9, 6, 'transition'],
  [78, 'Pt', 'Platinum', '195.08', 10, 6, 'transition'],
  [79, 'Au', 'Gold', '196.97', 11, 6, 'transition'],
  [80, 'Hg', 'Mercury', '200.59', 12, 6, 'transition'],
  [81, 'Tl', 'Thallium', '204.38', 13, 6, 'post'],
  [82, 'Pb', 'Lead', '207.2', 14, 6, 'post'],
  [83, 'Bi', 'Bismuth', '208.98', 15, 6, 'post'],
  [84, 'Po', 'Polonium', '(209)', 16, 6, 'post'],
  [85, 'At', 'Astatine', '(210)', 17, 6, 'halogen'],
  [86, 'Rn', 'Radon', '(222)', 18, 6, 'noble'],
  [87, 'Fr', 'Francium', '(223)', 1, 7, 'alkali'],
  [88, 'Ra', 'Radium', '(226)', 2, 7, 'alkaline'],
  [89, 'Ac', 'Actinium', '(227)', 3, 10, 'actinide'],
  [90, 'Th', 'Thorium', '232.04', 4, 10, 'actinide'],
  [91, 'Pa', 'Protactinium', '231.04', 5, 10, 'actinide'],
  [92, 'U', 'Uranium', '238.03', 6, 10, 'actinide'],
  [93, 'Np', 'Neptunium', '(237)', 7, 10, 'actinide'],
  [94, 'Pu', 'Plutonium', '(244)', 8, 10, 'actinide'],
  [95, 'Am', 'Americium', '(243)', 9, 10, 'actinide'],
  [96, 'Cm', 'Curium', '(247)', 10, 10, 'actinide'],
  [97, 'Bk', 'Berkelium', '(247)', 11, 10, 'actinide'],
  [98, 'Cf', 'Californium', '(251)', 12, 10, 'actinide'],
  [99, 'Es', 'Einsteinium', '(252)', 13, 10, 'actinide'],
  [100, 'Fm', 'Fermium', '(257)', 14, 10, 'actinide'],
  [101, 'Md', 'Mendelevium', '(258)', 15, 10, 'actinide'],
  [102, 'No', 'Nobelium', '(259)', 16, 10, 'actinide'],
  [103, 'Lr', 'Lawrencium', '(266)', 17, 10, 'actinide'],
  [104, 'Rf', 'Rutherfordium', '(267)', 4, 7, 'transition'],
  [105, 'Db', 'Dubnium', '(268)', 5, 7, 'transition'],
  [106, 'Sg', 'Seaborgium', '(269)', 6, 7, 'transition'],
  [107, 'Bh', 'Bohrium', '(270)', 7, 7, 'transition'],
  [108, 'Hs', 'Hassium', '(270)', 8, 7, 'transition'],
  [109, 'Mt', 'Meitnerium', '(278)', 9, 7, 'transition'],
  [110, 'Ds', 'Darmstadtium', '(281)', 10, 7, 'transition'],
  [111, 'Rg', 'Roentgenium', '(282)', 11, 7, 'transition'],
  [112, 'Cn', 'Copernicium', '(285)', 12, 7, 'transition'],
  [113, 'Nh', 'Nihonium', '(286)', 13, 7, 'post'],
  [114, 'Fl', 'Flerovium', '(289)', 14, 7, 'post'],
  [115, 'Mc', 'Moscovium', '(290)', 15, 7, 'post'],
  [116, 'Lv', 'Livermorium', '(293)', 16, 7, 'post'],
  [117, 'Ts', 'Tennessine', '(294)', 17, 7, 'halogen'],
  [118, 'Og', 'Oganesson', '(294)', 18, 7, 'noble'],
]

export const ELEMENTS: Element[] = RAW.map(([z, sym, name, mass, group, row, category]) => ({
  z, sym, name, mass, group, row, category,
}))

export const ELEMENT_BY_Z = new Map(ELEMENTS.map(e => [e.z, e]))

// Literal class strings so Tailwind can see them.
export const CATEGORY_STYLE: Record<ElementCategory, string> = {
  alkali: 'bg-rose-100 text-rose-900 border-rose-200',
  alkaline: 'bg-orange-100 text-orange-900 border-orange-200',
  transition: 'bg-sky-100 text-sky-900 border-sky-200',
  post: 'bg-slate-100 text-slate-800 border-slate-200',
  metalloid: 'bg-lime-100 text-lime-900 border-lime-200',
  nonmetal: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  halogen: 'bg-yellow-100 text-yellow-900 border-yellow-200',
  noble: 'bg-violet-100 text-violet-900 border-violet-200',
  lanthanide: 'bg-pink-100 text-pink-900 border-pink-200',
  actinide: 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200',
}

export const CATEGORY_LABEL: Record<ElementCategory, { zh: string; en: string }> = {
  alkali: { zh: '碱金属', en: 'Alkali metal' },
  alkaline: { zh: '碱土金属', en: 'Alkaline earth' },
  transition: { zh: '过渡金属', en: 'Transition metal' },
  post: { zh: '后过渡金属', en: 'Post-transition' },
  metalloid: { zh: '类金属', en: 'Metalloid' },
  nonmetal: { zh: '非金属', en: 'Nonmetal' },
  halogen: { zh: '卤素', en: 'Halogen' },
  noble: { zh: '稀有气体', en: 'Noble gas' },
  lanthanide: { zh: '镧系', en: 'Lanthanide' },
  actinide: { zh: '锕系', en: 'Actinide' },
}
