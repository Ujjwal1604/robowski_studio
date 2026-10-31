      // APP 20 - triplet plate mode: groups of reagents mixed in fixed ratios, plate sections, derived doublet/singlet plates.
      // tri* functions work on S.tri. triBuildRows() produces the vial list for the engine; the *HTML functions draw the panels.
      // Edit here to: change triplet presets (triPresetData), default additives (triDefault), or how derived plates are built (triDerive).
      // ------------------------------------------------------------
/* ---------- triplet / group plate mode ---------- */
      // Preset ratio tables for triplet, doublet and quartet.
      function triPresetData(key) {
        const rot = (n, hi) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? hi : 1)));
        if (key === 'doublet') return { size: 2, ratios: rot(2, 2) };
        if (key === 'quartet') return { size: 4, ratios: rot(4, 2) };
        return { size: 3, ratios: rot(3, 2) };
      }
      // Default triplet setup.
      function triDefault() { return { base: 50, ratios: triPresetData('triplet').ratios, adds: [{ code: 'Ac', equiv: 0.5 }, { code: 'Ba', equiv: 0.5 }], groups: [], plates: [{ sections: [] }, null, null] }; }
      function triReagents() { return ['A', 'B', 'C', 'D', 'E', 'F', 'Ac', 'Ba'].map(code => ({ code, name: '', molarMass: '', density: '', stock: '', solvent: 'ethanol', min: '', step: '', max: '', pipettingMode: 'empty' })); }
      function triSize(st = S) { return st.tri.ratios.length ? st.tri.ratios[0].length : 3; }
      // How many sections fit on a 54-vial plate for the chosen ratios.
      function triGeom(st = S) { const t = st.tri, c = Math.max(1, t.ratios.length), r = Math.max(1, t.adds.length), across = Math.floor(9 / c), down = Math.floor(6 / r); return { c, r, across, down, n: across * down, leftover: 54 - across * down * c * r }; }
      /* Flat 1:1 plates: every doublet/singlet is just a block of identical vials (reps per additive row), no section grid. */
      // Flat plates: one block of vials per derived group (1:1 ratio).
      function triFlat(pl, st = S) { return !!(pl && pl.flat && st.tri.derivedRatio === 'equal'); }
      function triReps(st = S) { return 1; }
      function triBlock(st = S) { return Math.max(1, st.tri.adds.length) * triReps(st); }
      function triSlots(pl, st = S) { return triFlat(pl, st) ? Math.floor(54 / triBlock(st)) : triGeom(st).n; }
      // Keeps plates and groups consistent after any edit.
      function triSync(st = S) {
        const t = st.tri, size = triSize(st), codes = new Set(st.reagents.map(r => r.code));
        if (t.derivedRatio !== 'equal') t.derivedRatio = 'keep';
        t.ratios.forEach(v => { while (v.length < size) v.push(1); v.length = size; });
        t.adds.forEach(a => { if (a.code && !codes.has(a.code)) a.code = ''; });
        t.groups.forEach(g => { g.members = (g.members || []).slice(0, size); while (g.members.length < size) g.members.push(''); g.members = g.members.map(m => codes.has(m) ? m : ''); });
        const ids = new Set(t.groups.map(g => g.id));
        t.plates = [t.plates[0] === undefined ? { sections: [] } : t.plates[0], t.plates[1] || null, t.plates[2] || null];
        t.plates.forEach(p => { if (!p) return; const n = triSlots(p, st); p.sections = (p.sections || []).slice(0, n); while (p.sections.length < n) p.sections.push(''); p.sections = p.sections.map(x => ids.has(x) ? x : ''); });
      }
      function triUsedCodes() { const u = new Set(); S.tri.adds.forEach(a => { if (a.code) u.add(a.code); }); S.tri.groups.forEach(g => g.members.forEach(m => { if (m) u.add(m); })); return u; }
      function triStats() { const g = triGeom(), used = S.tri.plates.map((p, i) => p ? { i, filled: p.sections.filter(Boolean).length } : null).filter(Boolean), sections = used.reduce((a, u) => a + u.filled, 0); return { g, used, plates: used.length, sections, wells: used.reduce((a, u) => a + u.filled * (triFlat(S.tri.plates[u.i]) ? triBlock() : g.c * g.r), 0) }; }
      const rLabel = c => { const r = S.reagents.find(x => x.code === c); return r ? (r.name ? r.code + ' · ' + r.name : r.code) : ''; };
      const rName = c => { const r = S.reagents.find(x => x.code === c); return r ? (r.name || r.code) : '?'; };
      function triGroupName() { return ({ 2: 'doublet', 3: 'triplet', 4: 'quartet' })[triSize()] || 'group'; }
      function triDetectPreset() { const t = S.tri, same = (a, b) => JSON.stringify(a) === JSON.stringify(b); for (const k of ['triplet', 'doublet', 'quartet']) if (same(t.ratios, triPresetData(k).ratios)) return k; return 'custom'; }
      function triNewGroup() {
        const size = triSize(), add = new Set(S.tri.adds.map(a => a.code)), chems = S.reagents.map(r => r.code).filter(c => !add.has(c)), taken = new Set(S.tri.groups.map(g => g.members.join('|'))); let pick = null;
        (function rec(start, cur) { if (pick) return; if (cur.length === size) { if (!taken.has(cur.join('|'))) pick = [...cur]; return; } for (let i = start; i < chems.length && !pick; i++) rec(i + 1, [...cur, chems[i]]); })(0, []);
        if (!pick) pick = chems.slice(0, size); while (pick.length < size) pick.push('');
        const pre = ({ 2: 'D', 3: 'T', 4: 'Q' })[size] || 'G', names = new Set(S.tri.groups.map(g => g.name)); let k = 1; while (names.has(pre + k)) k++;
        return { id: Math.random().toString(36).slice(2, 8), name: pre + k, members: pick };
      }
      /* ratio vector (one number per reagent position) of group g in column c of a section.
         Derived groups (doublets, singlets): 'keep' = the triplet column's own ratios for the reagents present, 'equal' = 1 for each reagent present; left-out reagents are 0 (their volume becomes solvent). */
      function triColumnFor(g, c) { const base = S.tri.ratios[c]; if (!g.derived) return base; const eq = S.tri.derivedRatio === 'equal'; return g.members.map((m, j) => m ? (eq ? 1 : base[j]) : 0); }
      function triDerivedSwitch() {
        const t = S.tri, keep = t.derivedRatio !== 'equal', dg = t.groups.find(x => x.derived && x.members.filter(Boolean).length > 1);
        const ex = dg ? ` Example ${dg.name}: ` + t.ratios.map((_, c) => triColumnFor(dg, c).filter((v, j) => dg.members[j]).join(':')).join('  ·  ') + '.' : '';
        return `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 6px"><span class="lbl" style="margin:0">Doublet / singlet amounts</span><div class="seg" role="group" aria-label="Doublet and singlet amounts"><button data-act="triderivemode" data-v="keep" class="${keep ? 'on' : ''}">Triplet ratios</button><button data-act="triderivemode" data-v="equal" class="${keep ? '' : 'on'}">Flat 1:1</button></div></div>
 <div class="hint" style="margin:0 0 14px">${keep ? 'Each reagent keeps the ratio it has in the triplet columns.' : 'Every reagent that is present gets 1 equivalent. Doublet and singlet plates have no sections: each one is a single ratio, so it is one vial per additive row (or one vial if there is no additive), filled one after another.'} The left-out reagent becomes solvent.${esc(ex)}</div>`;
      }
      function triCombos(n, k) { const out = []; (function rec(st, cur) { if (cur.length === k) { out.push([...cur]); return; } for (let i = st; i < n; i++) rec(i + 1, [...cur, i]); })(0, []); return out; }
      /* Fill plate p with the sub-groups (doublets, then singlets, ...) of the full groups on plate src.
         Positions are kept, so a missing reagent has ratio 0 there and its volume becomes solvent. */
      // Fills a derived plate from the groups of another plate.
      function triDerive(p, src) {
        const t = S.tri, g = triGeom(), size = triSize(), sp = t.plates[src];
        if (!sp || !g.n) return null;
        const base = [], seenG = new Set();
        sp.sections.forEach(id => { if (!id || seenG.has(id)) return; seenG.add(id); const gr = t.groups.find(x => x.id === id); if (gr && !gr.derived && gr.members.every(Boolean)) base.push(gr); });
        if (!base.length) return null;
        const seen = new Set(base.map(gr => [...gr.members].sort().join('|'))), made = [], counts = {};
        for (let keep = size - 1; keep >= 1; keep--) base.forEach(gr => triCombos(size, keep).forEach(idx => {
          const key = idx.map(i => gr.members[i]).sort().join('|'); if (seen.has(key)) return; seen.add(key);
          const members = Array(size).fill(''); idx.forEach(i => { members[i] = gr.members[i]; });
          let grp = t.groups.find(x => x.derived && x.members.join('|') === members.join('|'));
          if (!grp) { const names = new Set(t.groups.map(x => x.name)); let nm = members.filter(Boolean).join('+'), k = 2; while (names.has(nm)) nm = members.filter(Boolean).join('+') + ' #' + k++; grp = { id: Math.random().toString(36).slice(2, 8), name: nm, members, derived: true }; t.groups.push(grp); }
          made.push(grp.id); counts[keep] = (counts[keep] || 0) + 1;
        }));
        let k = 0; const placed = [];
        for (let pp = p; pp <= 2 && k < made.length; pp++) {
          if (pp === src) continue;
          if (!t.plates[pp]) t.plates[pp] = { sections: [] };
          t.plates[pp].flat = t.derivedRatio === 'equal'; const nsl = triSlots(t.plates[pp]);
          const secs = Array(nsl).fill(''); for (let i = 0; i < nsl && k < made.length; i++) secs[i] = made[k++];
          t.plates[pp].sections = secs; placed.push(pp);
        }
        triSync();
        return { counts, placed, overflow: made.length - k };
      }
      /* Fill plate p with EVERY pair of the chemical reagents (whether or not a triplet contains it), then every single reagent twice:
         once at 1 equivalent (x) and once at 2 equivalents (2x). Always flat: pairs get 1 eq of each reagent. */
      // Derives the all-pairs plate (every doublet, singles at x1 and x2).
      function triDeriveAll(p) {
        const t = S.tri, size = triSize(), add = new Set(t.adds.map(a => a.code)), chem = S.reagents.filter(r => !add.has(r.code)), used = chem.filter(r => r.name || (r.stock !== '' && r.stock != null)), pool = (used.length >= 2 ? used : chem).map(r => r.code);
        if (pool.length < 2 || size < 2) return null;
        const mk = (codes, scale) => { const members = Array(size).fill(''); codes.forEach((c, i) => { members[i] = c; }); const key = [...codes].sort().join('|') + '#' + scale; let grp = t.groups.find(x => x.derived && [...x.members].filter(Boolean).sort().join('|') + '#' + (x.scale || 1) === key);
          if (!grp) { const names = new Set(t.groups.map(x => x.name)); let nm = codes.join('+') + (scale > 1 ? ' (' + scale + ' eq)' : ''), k = 2; const b0 = nm; while (names.has(nm)) nm = b0 + ' #' + k++; grp = { id: Math.random().toString(36).slice(2, 8), name: nm, members, derived: true }; if (scale > 1) grp.scale = scale; t.groups.push(grp); } return grp.id; };
        const made = []; let pairs = 0, singles = 0;
        for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) { made.push(mk([pool[i], pool[j]], 1)); pairs++; }
        for (const sc of [1, 2]) pool.forEach(c => { made.push(mk([c], sc)); singles++; });
        t.derivedRatio = 'equal'; let k = 0; const placed = [];
        for (let pp = p; pp <= 2 && k < made.length; pp++) { if (!t.plates[pp]) t.plates[pp] = { sections: [] }; t.plates[pp].flat = true; const n = triSlots(t.plates[pp]), secs = Array(n).fill(''); for (let i = 0; i < n && k < made.length; i++) secs[i] = made[k++]; t.plates[pp].sections = secs; placed.push(pp); }
        t.plates.forEach(pl => { if (pl && !pl.flat) pl.flat = false; });
        triSync();
        return { pairs, singles, pool, placed, overflow: made.length - k };
      }
      /* One row per well of every used plate (54 per plate): target concentration (mM) of each reagent.
         concentration = ratio x base concentration (1 eq), additive = equivalents x base concentration, so the volumes equal
         eq x base x V / stock, as in the lab's plate builder. Wells outside any section, or in an empty section, are blank (all volumes 0). */
      // Converts the whole triplet setup into the list of vials (and blank wells) for the engine.
      function triBuildRows() {
        const t = S.tri, g = triGeom(); if (!g.n) throw new Error('This pattern does not fit on a 6 × 9 plate. Use fewer ratios or additive rows.');
        const idxOf = code => S.reagents.findIndex(r => r.code === code), base = +t.base, rows = [], blank = new Set(), meta = [];
        t.plates.forEach((pl, p) => {
          if (!pl) return;
          if (triFlat(pl)) {
            const reps = triReps(), nad = Math.max(1, t.adds.length), blockN = nad * reps, wells = Array.from({ length: 54 }, (_, w) => ({ plate: p, well: w, blank: true })), vecs = Array(54).fill(null);
            pl.sections.forEach((id, si) => {
              const grp = id && t.groups.find(x => x.id === id); if (!grp) return;
              for (let a = 0; a < nad; a++) for (let rp = 0; rp < reps; rp++) {
                const w = si * blockN + a * reps + rp; if (w >= 54) continue; const vec = new Array(S.reagents.length).fill(0), ratios = triColumnFor(grp, 0), ad = t.adds[a];
                grp.members.forEach((m, j) => { if (!m) return; const i = idxOf(m); if (i < 0) throw new Error(`${grp.name}: reagent ${m} does not exist.`); vec[i] += ratios[j] * (grp.scale || 1) * base; });
                if (ad && ad.code) { const i = idxOf(ad.code); if (i >= 0) vec[i] += (+ad.equiv) * base; }
                vecs[w] = vec; wells[w] = { plate: p, well: w, section: si + 1, group: grp.name, cond: ratios.filter((v, j) => grp.members[j]).map(v => v * (grp.scale || 1)).join(':') + (ad && ad.code ? ' + ' + ad.code : ''), blank: false };
              }
            });
            for (let w = 0; w < 54; w++) { rows.push((vecs[w] || new Array(S.reagents.length).fill(0)).map(v => Math.round(v * 1e9) / 1e9)); if (wells[w].blank) blank.add(rows.length - 1); meta.push(wells[w]); }
            return;
          }
          for (let w = 0; w < 54; w++) {
            const row = Math.floor(w / 9), col = w % 9, vec = new Array(S.reagents.length).fill(0), sr = Math.floor(row / g.r), sc = Math.floor(col / g.c); let info = { plate: p, well: w, blank: true };
            if (sr < g.down && sc < g.across) {
              const si = sr * g.across + sc, id = pl.sections[si], grp = id && t.groups.find(x => x.id === id);
              if (grp) {
                if (!grp.derived && grp.members.some(m => !m)) throw new Error(`${grp.name}: pick a reagent for every position.`);
                const c = col % g.c, a = row % g.r, ratios = triColumnFor(grp, c), ad = t.adds[a];
                grp.members.forEach((m, j) => { if (!m) return; const i = idxOf(m); if (i < 0) throw new Error(`${grp.name}: reagent ${m} does not exist.`); vec[i] += ratios[j] * base; });
                if (ad && ad.code) { const i = idxOf(ad.code); if (i >= 0) vec[i] += (+ad.equiv) * base; }
                info = { plate: p, well: w, section: si + 1, group: grp.name, cond: ratios.filter((v, j) => grp.members[j]).join(':') + (ad && ad.code ? ' + ' + ad.code : ''), blank: false };
              }
            }
            rows.push(vec.map(v => Math.round(v * 1e9) / 1e9)); if (info.blank) blank.add(rows.length - 1); meta.push(info);
          }
        });
        if (!meta.some(m => !m.blank)) return null;
        const usedIdx = t.plates.map((x, i) => x ? i : -1).filter(i => i >= 0); meta.forEach(m => { m.plate = usedIdx.indexOf(m.plate); });
        return { rows, blank, meta };
      }
      function stockHints() { return S.reagents.filter(r => r.stock !== '' && +r.stock > 0 && +r.stock < 5).map(r => `Stock ${r.name || r.code} is ${+r.stock} mM. Did you mean ${+(+r.stock * 1000).toPrecision(6)} mM? The field is in mM (0.225 mol/L = 225 mM).`); }
      // Triplet-specific warnings shown in the panel.
      function triWarnings() {
        const w = [], t = S.tri, adds = t.adds.map(a => a.code).filter(Boolean), key = g => [...g.members].sort().join('|');
        t.groups.forEach(g => {
          if (g.derived ? !g.members.some(Boolean) : g.members.some(m => !m)) w.push(`${g.name}: pick a reagent for every position.`);
          else if (new Set(g.members.filter(Boolean)).size < g.members.filter(Boolean).length) w.push(`${g.name}: ${g.members.map(rName).join(' + ')} uses the same reagent more than once.`);
          if (g.members.some(m => adds.includes(m))) w.push(`${g.name}: contains an additive reagent.`);
        });
        const by = {}; t.groups.forEach(g => { if (g.members.every(Boolean)) (by[key(g)] = by[key(g)] || []).push(g); });
        Object.values(by).forEach(l => { if (l.length > 1) w.push(`${l.map(g => g.name).join(' / ')} are the same reaction (${l[0].members.map(rName).join(' + ')}), only the order differs.`); });
        t.plates.forEach((p, pi) => {
          if (!p) return; const seen = {};
          p.sections.forEach((id, si) => { const g = t.groups.find(x => x.id === id); if (g && g.members.every(Boolean)) (seen[key(g)] = seen[key(g)] || []).push(si + 1); });
          Object.entries(seen).forEach(([k, secs]) => { if (secs.length > 1) w.push(`plate${pi}: sections ${secs.join(', ')} run the same reaction (${k.split('|').map(rName).join(' + ')}), a duplicate.`); });
        });
        if (t.plates[2] && !t.plates[1]) w.push('plate2 is used but plate1 is not. The robot fills plates 0, 1, 2 in order, so leave no gap.');
        if (!triStats().sections) w.push('No section has a group yet. Assign groups to sections below.');
        const g = triGeom(); if (g.n < 1) w.push('This pattern does not fit on a 6 × 9 plate. Use fewer ratios or additive rows.');
        return w;
      }
      function reagentOptions(sel, emptyLabel) { return `<option value="">${emptyLabel}</option>` + S.reagents.map(r => `<option value="${esc(r.code)}" ${r.code === sel ? 'selected' : ''}>${esc(rLabel(r.code))}</option>`).join(''); }
      function groupOptions(sel) { return '<option value="">(empty)</option>' + S.tri.groups.map(g => `<option value="${esc(g.id)}" ${g.id === sel ? 'selected' : ''}>${esc(g.name)}${g.derived && g.name === g.members.filter(Boolean).join('+') ? '' : ' (' + esc(g.derived ? g.members.filter(Boolean).join('+') : g.members.map(m => m || '?').join('+')) + ')'}</option>`).join(''); }
      function triPatternHTML() {
        const t = S.tri, g = triGeom(), size = triSize(), pre = triDetectPreset(), gn = triGroupName();
        const ratioRows = t.ratios.map((v, i) => `<tr><td class="mono">${i + 1}</td>${v.map((x, j) => `<td><input type="number" step="any" min="0" class="f mono" data-k="tri.ratios.${i}.${j}" value="${x}" style="width:76px;height:32px" aria-label="Ratio ${i + 1}, reagent ${j + 1}"></td>`).join('')}<td>${t.ratios.length > 1 ? `<button class="ib" data-act="trirmratio" data-i="${i}" aria-label="Remove ratio ${i + 1}" title="Remove">✕</button>` : ''}</td></tr>`).join('');
        const addRows = t.adds.map((a, i) => `<tr><td><select class="f" data-rs data-k="tri.adds.${i}.code" aria-label="Additive ${i + 1}">${reagentOptions(a.code, 'No additive')}</select></td><td><input type="number" step="any" min="0" class="f mono" data-k="tri.adds.${i}.equiv" value="${a.equiv}" style="width:84px;height:32px" aria-label="Additive ${i + 1} equivalents"></td><td><button class="ib" data-act="trirmadd" data-i="${i}" aria-label="Remove additive ${i + 1}" title="Remove">✕</button></td></tr>`).join('');
        const cells = []; for (let rr = 0; rr < g.r; rr++) for (let cc = 0; cc < g.c; cc++) { const a = t.adds[rr]; cells.push(`<div class="tcell"><b class="mono">${esc((t.ratios[cc] || []).join(':'))}</b><span>${a && a.code ? esc(a.code) + ' ' + nf(a.equiv, 3) + ' eq' : 'no additive'}</span></div>`); }
        return `<div class="card pad"><div class="chead"><div class="ct">Plate pattern</div><select class="f" data-tripre style="width:auto" aria-label="Pattern preset"><option value="triplet" ${pre === 'triplet' ? 'selected' : ''}>Triplet (3 reagents)</option><option value="doublet" ${pre === 'doublet' ? 'selected' : ''}>Doublet (2 reagents)</option><option value="quartet" ${pre === 'quartet' ? 'selected' : ''}>Quartet (4 reagents)</option>${pre === 'custom' ? '<option value="custom" selected>Custom (edited)</option>' : ''}</select></div>
 <p class="sub" style="margin-top:-8px">Every section of the plate holds one ${gn}. Its columns are the ratios, its rows the additives.</p>
 <div class="pgrid"><div class="fld"><label class="lbl">Base concentration, 1 eq (mM)</label><input type="number" class="f mono" step="any" data-k="tri.base" value="${t.base}"></div>
 <div class="fld"><label class="lbl">Reagents per group</label><div class="seg full" role="group" aria-label="Reagents per group">${[2, 3, 4].map(n => `<button data-act="trisize" data-v="${n}" class="${size === n ? 'on' : ''}">${n}</button>`).join('')}</div></div></div>
 <div class="tbl" style="margin-top:14px"><table class="tri-tbl"><thead><tr><th>Ratio</th>${Array.from({ length: size }, (_, j) => `<th>Reagent ${j + 1}</th>`).join('')}<th></th></tr></thead><tbody>${ratioRows}</tbody></table></div>
 ${t.ratios.length < 9 ? '<button class="btn sm" style="margin-top:8px" data-act="triaddratio">Add ratio</button>' : ''}
 <div class="tbl" style="margin-top:16px"><table class="tri-tbl"><thead><tr><th>Additive (reagent)</th><th>Equivalents</th><th></th></tr></thead><tbody>${addRows || '<tr><td colspan="3" class="hint">No additive: each section is a single row.</td></tr>'}</tbody></table></div>
 ${t.adds.length < 6 ? '<button class="btn sm" style="margin-top:8px" data-act="triaddadd">Add additive row</button>' : ''}
 <div class="lbl" style="margin-top:16px">ONE SECTION</div><div class="tri-prev" style="grid-template-columns:repeat(${g.c},minmax(70px,1fr));max-width:${g.c * 120}px">${cells.join('')}</div>
 <div class="hint" style="margin:0">${g.n ? `${g.across} × ${g.down} = ${g.n} sections per plate, ${g.c} × ${g.r} wells each${g.leftover ? `, ${g.leftover} wells left unused` : ''}.` : 'This pattern does not fit on a 6 × 9 plate.'}</div></div>`;
      }
      function triGroupsHTML() {
        const t = S.tri, size = triSize(), gn = triGroupName();
        const rows = t.groups.map((g, i) => `<tr><td><input type="text" class="f" data-k="tri.groups.${i}.name" value="${esc(g.name)}" style="width:110px;height:32px" aria-label="${gn} name">${g.derived ? ' <span class="chip mut">derived</span>' : ''}</td>${g.members.map((m, j) => `<td><select class="f" data-rs data-k="tri.groups.${i}.members.${j}" aria-label="${esc(g.name)} reagent ${j + 1}">${reagentOptions(m, g.derived ? '(solvent)' : 'Pick…')}</select></td>`).join('')}<td><button class="ib" data-act="trirmgroup" data-i="${i}" aria-label="Remove ${esc(g.name)}" title="Remove">✕</button></td></tr>`).join('');
        return `<div class="card pad"><div class="chead"><div class="ct">${gn[0].toUpperCase() + gn.slice(1)}s <span class="cnt">${t.groups.length}</span></div><button class="btn" data-act="triaddgroup">Add ${gn}</button></div>
 <div class="tbl"><table class="tri-tbl"><thead><tr><th>Name</th>${Array.from({ length: size }, (_, j) => `<th>Reagent ${j + 1}</th>`).join('')}<th></th></tr></thead><tbody>${rows || `<tr><td colspan="${size + 2}" class="hint">No ${gn} yet. Add one, then pick its reagents (from the reagent list above).</td></tr>`}</tbody></table></div></div>`;
      }
      function triPlatesHTML() {
        const t = S.tri, g = triGeom();
        const body = t.plates.map((pl, p) => {
          const head = `<div class="rhead"><b>plate${p}</b><span class="chip mut">${pl ? pl.sections.filter(Boolean).length + ' of ' + triSlots(pl) + (triFlat(pl) ? ' vial blocks' : ' sections') : 'not used'}</span><span style="flex:1"></span>${pl ? `<select class="f sm" data-tricopy="${p}" aria-label="Copy sections to plate${p}"><option value="">Copy from…</option>${t.plates.map((o, oi) => o && oi !== p ? `<option value="${oi}">plate${oi}</option>` : '').join('')}</select>` : ''}${p > 0 && t.plates.some((o, oi) => o && oi !== p && o.sections.some(Boolean)) ? `<select class="f sm" data-triderive="${p}" aria-label="Fill plate${p} with doublets and singlets" title="Fills this plate with the sub-groups of the groups on another plate: doublets first, then singlets as controls. The left-out reagent becomes solvent."><option value="">Doublets + singlets from…</option>${t.plates.map((o, oi) => o && oi !== p && o.sections.some(Boolean) ? `<option value="${oi}">plate${oi}</option>` : '').join('')}</select>` : ''}${p > 0 ? `<button class="btn sm" data-act="triall" data-i="${p}" title="Every pair of the reagents, then every single reagent at 1 eq and at 2 eq (always 1:1 amounts)">All pairs + singles ×1, ×2</button>` : ''}${p > 0 || !pl || t.plates.some((o, oi) => o && oi !== p) ? `<button class="btn sm" data-act="triplate" data-i="${p}">${pl ? 'Do not use' : 'Use this plate'}</button>` : ''}</div>`;
          const grid = pl && g.n ? `<div class="tri-grid" style="grid-template-columns:repeat(${triFlat(pl) ? 3 : g.across},minmax(0,1fr))">${pl.sections.map((id, si) => `<label><span class="l">${triFlat(pl) ? 'Vials ' + (si * triBlock() + 1) + '–' + Math.min(54, (si + 1) * triBlock()) : 'Section ' + (si + 1)}</span><select class="f" data-gs data-k="tri.plates.${p}.sections.${si}" aria-label="plate${p} section ${si + 1}">${groupOptions(id)}</select></label>`).join('')}</div>` : '';
          return `<div class="rcard" style="border-left-color:${rcol(p)}">${head}${grid}</div>`;
        }).join('');
        return `<div class="card pad"><div class="chead"><div class="ct">Plates</div></div><p class="sub" style="margin-top:-8px">Pick a ${triGroupName()} for each section. Empty sections stay unfilled (all volumes 0).</p>${triDerivedSwitch()}${body}</div>`;
      }
      function triCards() { return `<div id="tripat">${triPatternHTML()}</div><div id="trigroups" style="margin-top:20px">${triGroupsHTML()}</div><div id="triplates" style="margin-top:20px">${triPlatesHTML()}</div>`; }
      function paintTri(which) { for (const [id, fn] of [['tripat', triPatternHTML], ['trigroups', triGroupsHTML], ['triplates', triPlatesHTML]]) if (which.includes(id)) { const el = $('#' + id); if (el) el.innerHTML = fn(); } }
      function refreshLabels() { document.querySelectorAll('select[data-rs] option').forEach(o => { if (o.value) o.textContent = rLabel(o.value); }); }
      // The whole triplet panel (patterns, groups, plates).
      function triPanel() {
        const st = triStats(), warns = triWarnings(), g = st.g;
        return `<div class="card pad"><div class="lbl">THIS RUN</div>
 <div class="big"><b>${st.wells}</b><span>wells · ${st.plates} plate${st.plates === 1 ? '' : 's'}</span></div><div class="hr"></div>
 <div class="crows"><div class="crow"><span>Sections filled</span><b class="mono">${st.sections} of ${S.tri.plates.reduce((a, pl) => a + (pl ? triSlots(pl) : 0), 0)}</b></div><div class="crow"><span>${triGroupName()[0].toUpperCase() + triGroupName().slice(1)}s defined</span><b class="mono">${S.tri.groups.length}</b></div></div>
 ${blank ? `<div class="hint" style="margin-top:12px;font-size:14px">${esc(err)}</div>` : ''}
 <div style="margin-top:14px">${warns.length ? warns.map(x => `<div class="issue warn"><span>${esc(x)}</span></div>`).join('') : '<div class="issue ok"><span>The layout is consistent.</span></div>'}</div>
 ${blank ? '' : `<div class="hint" style="margin-top:12px">${esc(err)}</div>`}</div>
 <div class="btns"><button class="btn lg" data-act="save">Save draft</button></div>`;
      }

