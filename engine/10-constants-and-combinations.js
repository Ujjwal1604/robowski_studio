      // ENGINE 10 - constants and combination generation.
      // Edit here to: change plate size (PLATE_CAPACITY), bottle/jar capacity, the solvent list and densities,
      // the colours given to reagents, or how concentration grids are expanded and shuffled.
      // Nothing in the engine touches the page (no document/DOM access) except the PNG helpers in file 40.
      // ------------------------------------------------------------
      // Robot limits: 54 vials per plate, up to 3 plates per load, 20 mL bottles, 100 mL jar, 96 tips per rack.
      const PLATE_CAPACITY = 54, MAX_REACTION_SLOTS = 3, BOTTLE_CAPACITY_ML = 20, JAR_CAPACITY_ML = 100, TIP_RACK_CAPACITY = 96;
      // Solvent names the app offers.
      const SUPPORTED_SOLVENTS = ['ethanol', 'water', 'DMF', 'Dioxane', 'DCE', 'MeCN', 'glycerin', 'serum', 'DMSO', 'CHCl3'];
      // DMSO and CHCl3 are valid in the user's established Robowski setup even though they are absent from the older repository liquid-class table. Accept their standard 'empty' mode; do not invent additional mode settings.
      // Solvents the robot has liquid classes for.
      const ROBOT_SOLVENTS = new Set(['ethanol', 'water', 'DMF', 'Dioxane', 'DCE', 'MeCN', 'glycerin', 'serum', 'DMSO', 'CHCl3']);
      // Allowed pipetting modes per robot liquid class.
      const ROBOT_LIQUID_MODES = { water: ['empty', 'part'], serum: ['empty', 'part'], ethanol: ['empty'], glycerin: ['empty'], DMF: ['empty'], Dioxane: ['empty'], DCE: ['empty'], MeCN: ['empty'], DMSO: ['empty'], CHCl3: ['empty'] };
      // Solvent densities in g/mL (used for the liquid density column of the robot file).
      const SOLVENT_DENSITIES = { ethanol: .789, water: .998, DMF: .944, Dioxane: 1.033, DCE: 1.253, MeCN: .786, glycerin: 1.261, serum: 1, DMSO: 1.102, CHCl3: 1.489 };
      // Alternative spellings accepted on import (EtOH -> ethanol, ...).
      const SOLVENT_ALIASES = { EtOH: 'ethanol', Ethanol: 'ethanol', Water: 'water', Glycerin: 'glycerin', Serum: 'serum', chcl3: 'CHCl3', chloroform: 'CHCl3' };
      // Reagent colour palette used on cards and the deck.
      const COLORS = ['#0E6F63', '#A94A12', '#5B3FA8', '#1F6AA5', '#8A2D5B', '#4A6B1F', '#B07D12', '#286C8B', '#A13B6B', '#6B6B6B', '#2F7D32', '#B3261E'];
      // num(v, default): safe number parsing. Returns the default for blanks and non-numbers.
      const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
      const truthy = v => v === true || ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase());
      const canonicalSolvent = v => { const raw = String(v || 'water').trim(); return SOLVENT_ALIASES[raw] || SOLVENT_ALIASES[raw.toLowerCase()] || raw; };
      const round = (n, d = 10) => { const f = 10 ** d; return Math.round((n + Number.EPSILON) * f) / f; };
      // Expands min/step/max into the list of values for one reagent (the grid axis).
      function axisValues(minimum, step, maximum, label) { minimum = num(minimum); step = num(step); maximum = num(maximum); if (step <= 0) throw new Error(`${label}: step must be greater than zero.`); if (maximum < minimum) throw new Error(`${label}: maximum must be greater than or equal to minimum.`); const intervals = (maximum - minimum) / step, nearest = Math.round(intervals); if (Math.abs(intervals - nearest) > 1e-7) throw new Error(`${label}: maximum ${maximum} is not reached by minimum ${minimum} and step ${step}. Adjust the step or maximum so the range lands exactly on the maximum.`); const n = nearest + 1; if (n > 120000) throw new Error(`${label}: range has too many points.`); return Array.from({ length: n }, (_, i) => round(minimum + i * step, 10)); }
      // Small seeded random generator so a shuffle can be reproduced from its seed.
      function mulberry32(a) { return function () { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
      // Shuffles rows with a seed; same seed gives the same order.
      function seededShuffle(arr, seed) { const a = mulberry32(seed >>> 0); for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(a() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
      // Builds every vial (all combinations), either from custom rows or from the min/step/max grid, then shuffles if asked.
      function targetCombinations(data) {
        const reagents = data.reagents || []; if (reagents.length < 2 || reagents.length > 12) throw new Error('Use between 2 and 12 reagents.'); if (Array.isArray(data.customRows)) { if (!data.customRows.length) throw new Error('Add at least one vial.'); let ix = data.customRows.map((values, i) => ({ globalIndex: i, values })); const sd = Math.floor(num(data.randomSeed, 20261018)); if (truthy(data.randomize ?? true)) ix = seededShuffle(ix, sd); return { indexed: ix, axes: [], seed: sd }; } const mode = data.mode || 'concentration'; if (!['concentration', 'equivalence'].includes(mode)) throw new Error('Choose Concentration or Equivalence mode.'); const axes = reagents.map((r, i) => axisValues(r.min ?? 0, r.step ?? 1, r.max ?? 0, (r.code || r.name || `R${i + 1}`).trim())); const total = axes.reduce((a, x) => a * x.length, 1), max = Math.floor(num(data.maxCombinations, 120000)); if (total > max) throw new Error(`This run would contain ${total.toLocaleString()} combinations, over the configured ${max.toLocaleString()} limit. Narrow a range or raise the limit deliberately.`);
        let combos = [[]]; for (const axis of axes) { const next = []; for (const prefix of combos) for (const v of axis) next.push([...prefix, v]); combos = next; } let indexed = combos.map((values, i) => ({ globalIndex: i, values })); const seed = Math.floor(num(data.randomSeed, 20261018)); if (truthy(data.randomize ?? true)) indexed = seededShuffle(indexed, seed); return { indexed, axes, seed };
      }
