      // APP 10 - the state S (everything the user typed), defaults, saving runs/library, and the data() payload sent to the engine.
      // Edit here to: add a new setting (add it to exampleState + normalize, then to data()), change defaults, or change how runs are stored.
      // ------------------------------------------------------------
      /* ---------- state ---------- */
      // The default blank run. Change default vial volume, threshold, flasks, etc. here.
      function exampleState() {
        const blankR = code => ({ code, name: '', molarMass: '', density: '', stock: '', solvent: 'ethanol', min: '', step: '', max: '', pipettingMode: 'empty' });
        return {
          id: null, name: 'new-run', mode: 'equivalence', hood: 'left', vialVolume: 500, threshold: 50, dilutionFactor: 5, reactionSolvent: 'ethanol', leftoverMl: 2, flasksText: '2, 5, 10, 20, 50, 100', randomize: true, randomSeed: 20261018, solventAfter: 0, deckPlates: null, stockVolumeCheck: true, newTipEveryTransfer: false,
          reagents: [blankR('AA'), blankR('BB'), blankR('CC')]
        };
      }
      // Fixes up a loaded/imported state so older saves keep working. Add migrations for new settings here.
      function normalize(st) {
        if (!st.sets || !st.sets.length) st.sets = [{ name: 'Set 1', items: st.reagents.map(r => ({ on: true, min: r.min ?? 1, step: r.step ?? 1, max: r.max ?? 1 })) }];
        st.sets.forEach(set => { while (set.items.length < st.reagents.length) set.items.push({ on: false, min: 1, step: 1, max: 2 }); set.items.length = st.reagents.length; });
        st.reagents.forEach(r => { delete r.min; delete r.step; delete r.max; });
        if (!st.tri) st.tri = triDefault();
        if (!st.product) st.product = { name: '', code: '', smiles: '' };
        triSync(st);
        return st;
      }
      let rowsCache = [], setOf = [];
      // Builds the vial list from the concentration/equivalence sets.
      function buildRows() {
        if (S.imported) return { rows: S.imported.rows, setOf: S.imported.rows.map(() => 0) };
        const n = S.reagents.length, rows = [], so = [], eq = S.mode === 'equivalence';
        S.sets.forEach((set, si) => {
          const nm = set.name || ('Set ' + (si + 1));
          const on = set.items.map((it, i) => it.on ? i : -1).filter(i => i >= 0);
          if (!on.length) throw new Error(nm + ': tick at least one reagent.');
          if (eq && !on.includes(0)) throw new Error(nm + ': in Equivalence mode every set needs ' + S.reagents[0].code + ' (equivalents are relative to it). Tick it, or switch to Concentration mode.');
          const axes = on.map(i => C.axisValues(set.items[i].min, set.items[i].step, set.items[i].max, nm + ' · ' + S.reagents[i].code));
          const total = axes.reduce((a, x) => a * x.length, 1);
          if (total > 20000) throw new Error(nm + ' would have ' + total.toLocaleString() + ' vials. Narrow a range.');
          let combos = [[]]; for (const ax of axes) { const nx = []; for (const p of combos) for (const v of ax) nx.push([...p, v]); combos = nx; }
          combos.forEach(vals => {
            const row = new Array(n).fill(0); on.forEach((i, k) => { row[i] = vals[k]; });
            if (eq) { const aa = row[0]; for (let i = 1; i < n; i++)row[i] = Math.round(row[i] * aa * 1e9) / 1e9; }
            rows.push(row); so.push(si);
          });
        });
        if (rows.length > 60000) throw new Error('More than 60,000 vials. Narrow the sets.');
        return { rows, setOf: so };
      }
      let triMeta = [], triBlank = new Set(), missing = [], invalid = new Set(), allEmpty = false, triPending = false, vialFocus = null, visited = { setup: 1 }, _bs = null, _bsRun = null, runSearch = '', compareIds = [];
      // Friendly names for issue types.
      const ISSUE_NAMES = { 'negative-solvent': 'Negative solvent', 'subminimum': 'Below 0.5 µL', 'low-solvent': 'Solvent below threshold', 'large-transfer': 'Transfer over 1000 µL', 'n3-needed': 'Needs N³ dilution', 'underprepared-stock': 'Stock under-prepared', 'oversize-stock': 'Stock larger than a 20 mL bottle', 'deck-capacity': 'Deck full', 'requires-reload': 'More than 3 plates' };
      let fixesDone = false, whyNot = [], blank = false, runFilter = 'all', S = normalize(exampleState()), run = null, err = null, fixes = [], view = 'setup', lib = [], runsList = [], page = 0, filterBad = false, status = 'draft';
      let dbRuns = null, dbLib = null, storeMode = 'this browser';

      /* ---------- storage: shared db when available, else localStorage ---------- */
      // Chooses shared store (if available) or this browser for runs and the library.
      async function initStore() {
        try {
          const db = globalThis.claude && await globalThis.claude.use('db');
          if (db) {
            dbRuns = db.collection('runs'); dbLib = db.collection('reagents'); storeMode = 'shared store';
            dbRuns.onSnapshot(s => { runsList = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updated || 0) - (a.updated || 0)); if (view === 'runs') render(); }, () => { });
            dbLib.onSnapshot(s => { lib = s.docs.map(d => ({ id: d.id, ...d.data() })); if (view === 'runs' || view === 'setup') render(); }, () => { });
            return;
          }
        } catch (e) { }
        try { runsList = JSON.parse(ls.get('rs.runs') || '[]'); lib = JSON.parse(ls.get('rs.lib') || '[]'); } catch (e) { }
        if (!lib.length) lib = [{ id: 'l1', name: 'amine', molarMass: 211.26, density: 0 }, { id: 'l2', name: 'ethyl acetoacetate', molarMass: 130.14, density: 1.03 }, { id: 'l3', name: 'iodine', molarMass: 253.81, density: 0 }, { id: 'l4', name: 'indene oxide', molarMass: 132.162, density: 0 }, { id: 'l5', name: 'p-toluic acid', molarMass: 136.15, density: 0 }];
      }
      // Save one run. delRun/putLib/delLib: delete run, save/delete a library reagent. Browser-storage failures throw.
      async function putRun(r) { if (dbRuns) { await dbRuns.doc(r.id).set(r); return; } const i = runsList.findIndex(x => x.id === r.id); if (i < 0) runsList.unshift(r); else runsList[i] = r; runsList.sort((a, b) => (b.updated || 0) - (a.updated || 0)); ls.keep('rs.runs', JSON.stringify(runsList)); }
      async function delRun(id) { if (dbRuns) { await dbRuns.doc(id).delete(); return; } runsList = runsList.filter(x => x.id !== id); ls.keep('rs.runs', JSON.stringify(runsList)); }
      async function putLib(x) { if (dbLib) { await dbLib.doc(x.id).set(x); return; } const i = lib.findIndex(y => y.id === x.id); if (i < 0) lib.push(x); else lib[i] = x; ls.keep('rs.lib', JSON.stringify(lib)); }
      async function delLib(id) { if (dbLib) { await dbLib.doc(id).delete(); return; } lib = lib.filter(x => x.id !== id); ls.keep('rs.lib', JSON.stringify(lib)); }
      // Short random id for runs and library entries.
      const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

      /* ---------- compute ---------- */
      let fixTimer = null;
      /* the buildRun payload for ANY saved run state (used by the Runs library cards); the live state is restored afterwards */
      // Builds the engine payload for ANY saved state (used by the notebook card on the Runs page).
      function dataFor(st) {
        const keep = { S, rowsCache, setOf, triBlank, triMeta };
        try {
          S = normalize(JSON.parse(JSON.stringify(st)));
          if (S.mode === 'triplet') { const tb = triBuildRows(); if (tb) { rowsCache = tb.rows; triBlank = tb.blank; triMeta = tb.meta; } else { rowsCache = []; triBlank = new Set(); triMeta = []; } setOf = rowsCache.map(() => 0); }
          else { const b = buildRows(); rowsCache = b.rows; setOf = b.setOf; }
          return data();
        } finally { ({ S, rowsCache, setOf, triBlank, triMeta } = keep); }
      }
      // Parses the volumetric flask list typed in Setup.
      function flaskList() { return String(S.flasksText == null ? '2, 5, 10, 20, 50, 100' : S.flasksText).split(/[,;\s]+/).map(Number).filter(x => x > 0 && isFinite(x)); }
      // Builds the engine payload for the current state. Every export goes through this.
      function data() { const d = JSON.parse(JSON.stringify(S)); d.customRows = rowsCache; d.mode = 'concentration'; delete d.sets; delete d.tri; if (S.mode === 'triplet') { d.randomize = false; d.blankRows = [...triBlank]; d.additiveCodes = S.tri.adds.map(a => a.code).filter(Boolean); d.rowLabels = triMeta.map((m, i) => { if (m.blank) return { name: 'blank (solvent only)', cond: `plate ${m.plate + 1}, well ${m.well + 1} | blank` }; const g = S.tri.groups.find(x => x.name === m.group), mem = g ? g.members.filter(Boolean) : [], conc = S.reagents.map((r, j) => ({ r, c: rowsCache[i][j] })).filter(x => x.c > 0).map(x => `${x.r.name || x.r.code} ${+x.c.toFixed(3)} mM`); return { name: `${m.group}: ${mem.map(rName).join(' + ')}`, cond: `plate ${m.plate + 1}, well ${m.well + 1}, section ${m.section} | ratio ${m.cond} | ${conc.join('; ')}` }; }); d.reagents.forEach(r => { if (r.stock === '' || r.stock == null) r.stock = 1; }); } d.runName = S.name || 'Untitled HTE run'; d.modeLabel = S.mode; d.product = S.product || {}; d.flaskSizes = flaskList(); delete d.flasksText; if (!d.deckPlates) delete d.deckPlates; d.reagents.forEach((r, i) => { r.molarMass = +r.molarMass || 0; r.density = +r.density || 0; r.color = PAL[i % PAL.length]; r.prepareVolumeMl = 0; r.min = 0; r.step = 1; r.max = 0; }); return d; }
