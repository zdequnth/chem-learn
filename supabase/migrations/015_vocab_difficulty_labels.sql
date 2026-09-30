-- 词汇难度：由 1/2/3 数字改成三档文字标签，并按"绝对标准"重评全部词条
--   核心必背：必须会拼、会解释（基础概念、考纲标准物质/仪器/反应类型）
--   重要理解：要认得、能理解，拼写次要
--   拓展阅读：见过即可（商品名、细分矿物/晶型、偏门工业词、过细有机命名、生物地理支撑词）
-- 可重复执行。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vocab_words'
      AND column_name = 'difficulty' AND data_type = 'integer'
  ) THEN
    ALTER TABLE public.vocab_words ADD COLUMN difficulty_label TEXT;
    UPDATE public.vocab_words
       SET difficulty_label = CASE difficulty
             WHEN 1 THEN '核心必背'
             WHEN 2 THEN '重要理解'
             ELSE '拓展阅读'
           END;
    ALTER TABLE public.vocab_words DROP COLUMN difficulty;
    ALTER TABLE public.vocab_words RENAME COLUMN difficulty_label TO difficulty;
    ALTER TABLE public.vocab_words ALTER COLUMN difficulty SET DEFAULT '重要理解';
    ALTER TABLE public.vocab_words ALTER COLUMN difficulty SET NOT NULL;
    ALTER TABLE public.vocab_words
      ADD CONSTRAINT vocab_words_difficulty_check
      CHECK (difficulty IN ('核心必背', '重要理解', '拓展阅读'));
  END IF;
END $$;

-- 1) 先全部设为中间档
UPDATE public.vocab_words SET difficulty = '重要理解';

-- 2) 核心必背（342 个词）
UPDATE public.vocab_words SET difficulty = '核心必背' WHERE term IN (
  'particle', 'atom', 'molecule', 'ion', 'element', 'mixture', 'solution', 'solvent', 'solute', 'soluble', 'insoluble', 'solid', 'liquid', 'gas', 'melting', 'boiling', 'freezing', 'evaporation', 'condensation', 'diffusion', 'melting point', 'boiling point', 'freezing point', 'physical change', 'chemical change', 'physical property', 'chemical property', 'pure substance', 'saturated solution', 'dissolve', 'filtration', 'filtrate', 'residue', 'crystallisation', 'fractional distillation', 'simple distillation', 'concentrated', 'dilute', 'word equation', 'balanced equation'
);

UPDATE public.vocab_words SET difficulty = '核心必背' WHERE term IN (
  'symbol equation', 'reactant', 'product', 'reactants', 'formula', 'symbol', 'state symbol', 'chemical reaction', 'chemical energy', 'heat', 'energy', 'temperature', 'kinetic particle theory', 'random motion', 'vibrate', 'collide', 'collision', 'collision theory', 'successful collision', 'nucleus', 'proton', 'neutron', 'electron', 'electron shell', 'electron arrangement', 'subatomic particle', 'nucleon', 'nucleon number', 'proton number', 'isotope', 'relative atomic mass', 'group', 'period', 'Periodic Table', 'periodicity', 'group number', 'outer shell', 'valency', 'valency electron', 'covalent bond'
);

UPDATE public.vocab_words SET difficulty = '核心必背' WHERE term IN (
  'covalent bonding', 'covalent compound', 'ionic bond', 'ionic bonding', 'ionic compound', 'metallic bond', 'metallic bonding', 'giant structure', 'giant covalent structure', 'layered structure', 'lattice', 'delocalised electron', 'sea of electrons', 'free electrons', 'metal', 'non-metal', 'metalloid', 'alloy', 'reactivity series', 'reactive', 'unreactive', 'acid', 'base', 'alkali', 'neutralisation', 'neutralise', 'salt', 'oxide', 'hydroxide', 'indicator', 'pH', 'pH scale', 'universal indicator', 'litmus', 'litmus paper', 'strong acid', 'weak acid', 'strong alkali', 'weak alkali', 'oxidation'
);

UPDATE public.vocab_words SET difficulty = '核心必背' WHERE term IN (
  'reduction', 'redox reaction', 'oxidising agent', 'reducing agent', 'oxidised', 'half-equation', 'electron transfer', 'ionic equation', 'displacement', 'displace', 'extract', 'extraction', 'ore', 'native', 'electrolysis', 'electrolyte', 'electrode', 'cathode', 'anode', 'electricity', 'electric current', 'electric charge', 'electric circuit', 'conductor', 'insulator', 'battery', 'exothermic', 'endothermic', 'exothermic reaction', 'endothermic reaction', 'catalyst', 'enzyme', 'equilibrium', 'dynamic equilibrium', 'reversible', 'reversible reaction', 'yield', 'percentage yield', 'rate', 'rate of reaction'
);

UPDATE public.vocab_words SET difficulty = '核心必背' WHERE term IN (
  'surface area', 'combustion', 'corrosion', 'rust', 'rusting', 'sacrificial protection', 'galvanising', 'mole', 'molar mass', 'molar volume', 'mol/dm³', 'cubic decimetre', 'Avogadro constant', 'formula mass', 'relative formula mass', 'percentage composition', 'empirical formula', 'molecular formula', 'polymer', 'polymerisation', 'monomer', 'macromolecule', 'natural polymer', 'addition polymerisation', 'condensation polymerisation', 'homologous series', 'functional group', 'general formula', 'isomer', 'saturated', 'unsaturated', 'carbon dioxide', 'carbon monoxide', 'hydrogen', 'oxygen', 'nitrogen', 'chlorine', 'sulfur', 'steam', 'magnesium'
);

UPDATE public.vocab_words SET difficulty = '核心必背' WHERE term IN (
  'sodium', 'potassium', 'lithium', 'iron', 'copper', 'zinc', 'aluminium', 'silver', 'gold', 'lead', 'tin', 'hydrochloric acid', 'sulfuric acid', 'nitric acid', 'sulfur dioxide', 'carbonate', 'nitrate', 'sulfate', 'halide', 'limestone', 'limewater', 'calcium carbonate', 'sodium chloride', 'sodium hydroxide', 'hydrogen ion', 'hydroxide ion', 'nitrogen oxides', 'acid rain', 'greenhouse gas', 'global warming', 'climate change', 'photosynthesis', 'respiration', 'fossil fuel', 'crude oil', 'petroleum', 'natural gas', 'coal', 'hydrocarbon', 'volatile'
);

UPDATE public.vocab_words SET difficulty = '核心必背' WHERE term IN (
  'flammable', 'corrosive', 'toxic', 'poisonous', 'impurity', 'apparatus', 'safety goggles', 'Bunsen burner', 'test-tube', 'beaker', 'conical flask', 'flask', 'filter paper', 'filter funnel', 'burette', 'pipette', 'measuring cylinder', 'gas jar', 'gas syringe', 'syringe', 'thermometer', 'condenser', 'tongs', 'tripod', 'gauze', 'splint', 'glowing splint', 'collect over water', 'upward displacement of air', 'downward displacement of air', 'scientific method', 'hypothesis', 'independent variable', 'dependent variable', 'variable', 'fair test', 'conclusion', 'analyse', 'accurate', 'accuracy'
);

UPDATE public.vocab_words SET difficulty = '核心必背' WHERE term IN (
  'observe', 'reliable', 'reliability', 'reagent', 'methyl orange', 'bromine water', 'final level', 'initial level', 'end point', 'titrate', 'titration', 'fraction', 'Rf value', 'chromatography', 'paper chromatography', 'half-life', 'alpha particle', 'beta particle', 'gamma ray', 'radiation', 'radioactive', 'Haber process', 'Contact process', 'blast furnace', 'catalytic converter', 'thermal decomposition', 'thermite process', 'hydrolysis', 'fermentation', 'yeast', 'alkane', 'alkene', 'alcohol', 'carboxylic acid', 'ester', 'carbohydrate', 'fat', 'amino acid', 'protein', 'ethanol'
);

UPDATE public.vocab_words SET difficulty = '核心必背' WHERE term IN (
  'ethanoic acid', 'ethene', 'polythene', 'nylon', 'steel', 'stainless steel', 'brass', 'bronze', 'halogens', 'noble gas', 'noble gases', 'alkali metals', 'alkaline earth metals', 'transition elements', 'transition element', 'crystal', 'spectator ion', 'phenolphthalein', 'Earth''s crust', 'precipitate', 'precipitation', 'semi-conductor'
);

-- 3) 拓展阅读（123 个词）
UPDATE public.vocab_words SET difficulty = '拓展阅读' WHERE term IN (
  'Teflon', 'Terylene', 'lycra', 'perspex', 'galena', 'rhombic sulfur', 'monoclinic sulfur', 'oleum', 'vulcanise', 'engine knock', 'oxygen furnace', 'scrap iron', 'feedstock', 'naphtha', 'salt mine', 'low-grade ore', 'flue gas desulfurisation', 'diaphragm cell', 'spinneret', 'refractory bricks', 'but-1-ene', 'but-2-ene', '2-methylpropene', '1,2-dibromoethane', 'cyclohexane', 'decane', 'chloromethane', 'dichloromethane', 'trichloromethane', 'tetrachloromethane', 'branched', 'unbranched', 'branched chain', 'straight chain', 'chain length', 'ethane-1,2-diol', 'glycine', 'alanine', 'cysteine', 'palmitic acid'
);

UPDATE public.vocab_words SET difficulty = '拓展阅读' WHERE term IN (
  'glycogen', 'keratin', 'collagen', 'amylase', 'lipase', 'proteinase', 'saliva', 'catalase', 'denatured', 'stomata', 'small intestine', 'stomach', 'digestive system', 'digest', 'digestion', 'paddy field', 'landfill site', 'cattle', 'phytoplankton', 'food chain', 'skeleton', 'shellfish', 'swamp', 'bury', 'diarrhoea', 'refugee', 'famine', 'drought', 'flood', 'extinction', 'adapt', 'sea level', 'breathalyser', 'ninhydrin', 'Geiger counter', 'tracer', 'radiotherapy', 'radioisotope', 'spontaneous', 'aggregate'
);

UPDATE public.vocab_words SET difficulty = '拓展阅读' WHERE term IN (
  'airship', 'ban', 'bead', 'bluish-silver', 'char', 'choke', 'clog', 'cosmetic', 'crease', 'economical', 'fabric', 'fitting', 'fishing net', 'hard-wearing', 'heart disease', 'jewellery', 'lining', 'linking group', 'maize', 'mineral wool', 'mortar', 'musical instrument', 'ornament', 'parachute', 'pesticide', 'profit', 'quarry', 'railing', 'rot', 'satellite dish', 'scale-remover', 'seat belt', 'sewer', 'sink', 'sludge', 'suffocate', 'sugarcane', 'aluminate ion', 'zincate ion', 'ionosphere'
);

UPDATE public.vocab_words SET difficulty = '拓展阅读' WHERE term IN (
  'geologist', 'kitchen cleaner', 'sandpaper'
);
