      // APP 50 - events. One delegated click handler reads the button's data-act and runs the action (add a new button: put
      // data-act="myaction" in a view, then add  else if (a === 'myaction') {...}  in the click handler below).
      // Input/change handlers write values into the state through data-k paths (setPath), then compute() and render().
      // Edit here to: add actions, change what a button does, or the reagent-rename rules (renameReagent).
      // ------------------------------------------------------------
      /* ---------- events ---------- */
      // Writes a value into the state by path, e.g. "reagents.0.stock".
      function setPath(path, val) { const p = path.split('.'); let o = S; for (let i = 0; i < p.length - 1; i++)o = o[p[i]]; o[p[p.length - 1]] = val; }
      document.addEventListener('input', e => {
        const t = e.target; if (!t.dataset || !t.dataset.k || t.type === 'checkbox') return;
        const k = t.dataset.k; let v = t.value;
        const textual = /(^randomize$|^name$|\.code$|\.name$|\.solvent$|reactionSolvent|^tri\.groups\.\d+\.members|^tri\.plates\.|\.smiles$|\.iupac$|^product\.|^flasksText$)/.test(k);
        if (!textual) { if (String(v).trim() === '') { if (k === 'randomSeed') return; v = k.endsWith('density') ? 0 : ''; } else { v = parseFloat(v); if (Number.isNaN(v)) return; } }
        if (k === 'randomize') v = (v === 'true');
        setPath(k, v); if (k === 'tri.reps') triSync(); compute();
        if (k === 'randomize') { render(); return; }
        if (view === 'setup') { paintLive(); if (/^reagents\.\d+\.name$/.test(k)) { refreshLabels(); paintTri('triplates'); } else if (/^tri\.groups\./.test(k)) paintTri('triplates'); }
        if (t.id === 'runsearch') { runSearch = t.value; if (view === 'runs') render(); }
      });
      document.addEventListener('change', e => {
        const t = e.target;
        if (t.dataset && t.dataset.code !== undefined) { if (!renameReagent(+t.dataset.code, t.value)) t.value = S.reagents[+t.dataset.code].code; return; }
        if (t.dataset && t.dataset.k === 'tri.reps') { paintTri('triplates'); return; }
        if (t.dataset && /^reagents\.\d+\.name$/.test(t.dataset.k || '')) {
          const i = +t.dataset.k.split('.')[1], nm = t.value.trim().toLowerCase(), x = nm && lib.find(l => String(l.name).trim().toLowerCase() === nm);
          if (x) {
            const r = S.reagents[i]; r.name = x.name; r.molarMass = x.molarMass || ''; r.density = x.density || 0; r.smiles = x.smiles || r.smiles || ''; r.iupac = x.iupac || r.iupac || '';
            const set = (k, val) => { const el = document.querySelector(`[data-k="reagents.${i}.${k}"]`); if (el) el.value = val; };
            set('name', x.name); set('molarMass', r.molarMass); set('density', r.density || '');
            if (x.solvent && SOLV.includes(x.solvent)) { r.solvent = x.solvent; set('solvent', x.solvent); }
            if (x.stock > 0 && (r.stock === '' || r.stock == null)) { r.stock = x.stock; set('stock', x.stock); }
            compute(); paintLive(); refreshLabels(); paintTri('triplates'); toast(`Filled ${x.name} from the library: ${nf(x.molarMass, 3)} g/mol, ${x.density ? x.density + ' g/mL' : 'solid'}.`);
          }
          return;
        }
        if (t.dataset && t.dataset.tripre) { if (t.value !== 'custom') { S.tri.ratios = triPresetData(t.value).ratios; triSync(); compute(); render(); } return; }
        if (t.dataset && t.dataset.triderive !== undefined) {
          if (t.value === '') return; const u = snap(), p = +t.dataset.triderive, src = +t.value, r = triDerive(p, src);
          if (!r) { toast('Plate' + src + ' has no complete groups to derive from.'); t.value = ''; return; }
          const nm = { 1: 'singlet', 2: 'doublet', 3: 'triplet' }, parts = Object.keys(r.counts).sort((a, b) => b - a).map(k => r.counts[k] + ' ' + (nm[k] || k + '-reagent group') + (r.counts[k] === 1 ? '' : 's'));
          compute(); render(); toast(`Filled ${r.placed.map(x => 'plate' + x).join(' and ')} with ${parts.join(' and ') || 'nothing new'} from plate${src} (${S.tri.derivedRatio === 'equal' ? 'flat 1:1' : 'triplet ratios'}).` + (r.overflow ? ` ${r.overflow} did not fit on the 3 plates.` : ''), u); return;
        }
        if (t.dataset && t.dataset.tricopy !== undefined) { if (t.value === '') return; const p = +t.dataset.tricopy, src = S.tri.plates[+t.value]; if (src && S.tri.plates[p]) { S.tri.plates[p].sections = [...src.sections]; compute(); render(); } return; }
        if (t.type === 'checkbox' && t.dataset.k) { setPath(t.dataset.k, t.checked); compute(); render(); return; }
        if (t.dataset && t.dataset.act === 'pick' && t.value) { const x = lib.find(l => l.id === t.value); if (x) { const r = S.reagents[+t.dataset.i]; r.name = x.name; r.molarMass = x.molarMass; r.density = x.density || 0; r.smiles = x.smiles || r.smiles || ''; r.iupac = x.iupac || r.iupac || ''; compute(); render(); } }
        if (t.dataset && t.dataset.dp) { const dp = S.deckPlates || (S.deckPlates = C.defaultPlates(S.hood)); dp[t.dataset.dp] = t.dataset.dp === 'solventKind' ? t.value : +t.value; compute(); render(); return; }
        if (t.id === 'file' && t.files[0]) importFile(t.files[0]);
        if (t.id === 'file2' && t.files[0]) importRobot(t.files[0]);
        if (t.id === 'file4' && t.files[0]) { const f = t.files[0]; t.value = ''; restoreBackup(f); }
        if (t.id === 'file3' && t.files[0]) { const f = t.files[0]; t.value = ''; importLibrary(f); }
      });
      document.addEventListener('click', async e => {
        const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
        const a = b.dataset.act, v = b.dataset.v, i = +b.dataset.i, id = b.dataset.id;
        if (a === 'tab') { vialFocus = null; view = v; page = 0; render(); window.scrollTo(0, 0); }
        else if (a === 'theme') { const cur = document.documentElement.dataset.theme; const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches; document.documentElement.dataset.theme = dark ? 'light' : 'dark'; ls.set('rs.theme', dark ? 'light' : 'dark'); }
        else if (a === 'mode') {
          if (v === 'triplet') {
            if (S.imported) { toast('Discard the imported vials first (Setup, Imported vials).'); return; }
            if (S.reagents.every(r => !r.name && (r.stock === '' || r.stock == null))) { S.reagents = triReagents(); delete S.sets; S.tri = triDefault(); normalize(S); }
          }
          S.mode = v; triSync(); compute(); render();
        }
        else if (a === 'trisize') { const n = +v; if (triDetectPreset() !== 'custom') S.tri.ratios = triPresetData(({ 2: 'doublet', 3: 'triplet', 4: 'quartet' })[n]).ratios; else S.tri.ratios = S.tri.ratios.map(vec => { const o = vec.slice(0, n); while (o.length < n) o.push(1); return o; }); triSync(); compute(); render(); }
        else if (a === 'triaddratio') { const size = triSize(), nv = Array(size).fill(1); nv[S.tri.ratios.length % size] = 2; S.tri.ratios.push(nv); triSync(); compute(); render(); }
        else if (a === 'trirmratio') { S.tri.ratios.splice(i, 1); triSync(); compute(); render(); }
        else if (a === 'triaddadd') { S.tri.adds.push({ code: '', equiv: 0.5 }); triSync(); compute(); render(); }
        else if (a === 'trirmadd') { S.tri.adds.splice(i, 1); triSync(); compute(); render(); }
        else if (a === 'triaddgroup') { S.tri.groups.push(triNewGroup()); triSync(); compute(); render(); }
        else if (a === 'trirmgroup') { const u = snap(), nm = S.tri.groups[i].name; S.tri.groups.splice(i, 1); triSync(); compute(); render(); toast('Removed ' + nm + '.', u); }
        else if (a === 'triderivemode') { S.tri.derivedRatio = v === 'equal' ? 'equal' : 'keep'; S.tri.plates.forEach(pl => { if (pl) pl.flat = S.tri.derivedRatio === 'equal' && pl.sections.some(Boolean) && pl.sections.every(id => !id || (S.tri.groups.find(x => x.id === id) || {}).derived); }); triSync(); compute(); render(); }
        else if (a === 'triall') { const u = snap(), r = triDeriveAll(i); if (!r) { toast('Need at least two chemical reagents (not additives).'); return; } compute(); render(); toast(`Filled ${r.placed.map(x => 'plate' + x).join(' and ')} with ${r.pairs} pairs and ${r.singles} singles twice (1 eq and 2 eq) from ${r.pool.join(', ')}; amounts are flat 1:1.` + (r.overflow ? ` ${r.overflow} did not fit on the 3 plates.` : ''), u); }
        else if (a === 'triplate') { if (S.tri.plates[i] && !S.tri.plates.some((o, oi) => o && oi !== i)) { toast('Keep at least one plate in use.'); return; } S.tri.plates[i] = S.tri.plates[i] ? null : { sections: [] }; triSync(); compute(); render(); }
        else if (a === 'vv') { if (v === 'custom') { if ([500, 800].includes(+S.vialVolume)) S.vialVolume = +S.vialVolume + 100; } else S.vialVolume = +v; compute(); render(); }
        else if (a === 'hood') { S.hood = v; S.deckPlates = null; compute(); render(); }
        else if (a === 'unimport') { const u = snap(); delete S.imported; S.randomize = true; compute(); render(); toast('Imported vials discarded.', u); }
        else if (a === 'addset') { const last = S.sets[S.sets.length - 1]; S.sets.push({ name: 'Set ' + (S.sets.length + 1), items: JSON.parse(JSON.stringify(last.items)) }); compute(); render(); }
        else if (a === 'dupset') { const src = S.sets[i]; S.sets.splice(i + 1, 0, { name: src.name + ' copy', items: JSON.parse(JSON.stringify(src.items)) }); compute(); render(); }
        else if (a === 'rmset') { const u = snap(); S.sets.splice(i, 1); compute(); render(); toast('Set removed.', u); }
        else if (a === 'addr') { const n = S.reagents.length; const have = new Set(S.reagents.map(r => r.code)), single = Array.from({ length: 26 }, (_, k) => String.fromCharCode(65 + k)).find(c => !have.has(c)), code = S.mode === 'triplet' ? (single || 'R' + (n + 1)) : (n < 26 ? String.fromCharCode(65 + n) + String.fromCharCode(65 + n) : 'R' + (n + 1)); S.reagents.push({ code, name: '', molarMass: 100, density: 0, stock: 100, solvent: S.reactionSolvent, pipettingMode: 'empty' }); S.sets.forEach((set, si) => set.items.push({ on: si === 0, min: S.mode === 'equivalence' ? .1 : 1, step: S.mode === 'equivalence' ? .1 : 1, max: S.mode === 'equivalence' ? .2 : 2 })); compute(); render(); }
        else if (a === 'mv') { const j = i + +v; if (j >= 0 && j < S.reagents.length) { [S.reagents[i], S.reagents[j]] = [S.reagents[j], S.reagents[i]]; S.sets.forEach(set => { [set.items[i], set.items[j]] = [set.items[j], set.items[i]]; }); compute(); render(); } }
        else if (a === 'sp') { const dp = S.deckPlates || (S.deckPlates = C.defaultPlates(S.hood)); const p = +v; const k = dp.stockPlates.indexOf(p); if (k >= 0) { if (dp.stockPlates.length > 1) dp.stockPlates.splice(k, 1); } else { dp.stockPlates.push(p); dp.stockPlates.sort(); } compute(); render(); }
        else if (a === 'rmr') { const u = snap(), nm = S.reagents[i].code; S.reagents.splice(i, 1); S.sets.forEach(set => set.items.splice(i, 1)); triSync(); compute(); render(); toast('Removed reagent ' + nm + '.', u); }
        else if (a === 'tolib') { const r = S.reagents[i]; if (!r.name) { toast('Give the reagent a name first.'); return; } await putLib({ id: uid(), name: r.name, molarMass: +r.molarMass || 0, density: +r.density || 0 }); toast(r.name + ' saved to the library.'); render(); }
        else if (a === 'findfixes') { fixesBusy = true; paintLive(); setTimeout(runFixSearch, 40); }
        else if (a === 'fix') { const f = fixes[i]; if (f) { const u = snap(); const { stocks, ...rest } = f.patch; Object.assign(S, rest); if (stocks) Object.entries(stocks).forEach(([k, v]) => { S.reagents[+k].stock = v; }); compute(); render(); toast('Applied: ' + f.label, u); } }
        else if (a === 'pg') { page += +v; render(); }
        else if (a === 'fbad') { filterBad = !filterBad; page = 0; render(); }
        else if (a === 'rf') { runFilter = v; render(); }
        else if (a === 'cmp') { const id2 = b.dataset.id; const ix = compareIds.indexOf(id2); if (ix >= 0) compareIds.splice(ix, 1); else if (compareIds.length < 2) compareIds.push(id2); render(); }
        else if (a === 'cmpgo') { if (compareIds.length === 2) { view = 'compare'; render(); window.scrollTo(0, 0); } }
        else if (a === 'cmpclear') { compareIds = []; render(); }
        else if (a === 'dl') await doDownload(v);
        else if (a === 'preview') openPreview(v);
        else if (a === 'closepreview') closePreview();
        else if (a === 'previewdl') { closePreview(); await doDownload(v); }
        else if (a === 'sheet') { const m = document.getElementById('previewModal'); if (m) { m.querySelectorAll('.sheettab').forEach(t => { const on = t === b; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.classList.toggle('on', on); }); m.querySelectorAll('.sheetpane').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.v; }); } }
        else if (a === 'save') await saveRun(false);
        else if (a === 'saveas') await saveRun(true);
        else if (a === 'new') { const u = snap(); status = 'draft'; S = normalize(exampleState()); S.name = 'new-run'; visited = { setup: 1 }; compute(); view = 'setup'; render(); const rn = $('#runname'); if (rn) rn.focus(), rn.select(); toast('Started a new run.', u); }
        else if (a === 'open') { const r = runsList.find(x => x.id === id); if (r) { status = r.status || 'draft'; S = normalize(JSON.parse(JSON.stringify(r.state))); S.id = r.id; visited = { setup: 1 }; compute(); view = 'setup'; render(); } }
        else if (a === 'dup') { const r = runsList.find(x => x.id === id); if (r) { status = 'draft'; S = normalize(JSON.parse(JSON.stringify(r.state))); S.id = null; S.name = r.name + '-copy'; visited = { setup: 1 }; compute(); view = 'setup'; render(); toast('Duplicated. Save it to keep the copy.'); } }
        else if (a === 'nbcopy') { if (!run) return; const txt = C.notebookText(run); let ok = false; try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) { } if (ok) toast('Copied. Paste into your notebook or slide notes.'); else { const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;left:8px;right:8px;top:20%;height:50%;z-index:99;font:13px monospace'; document.body.appendChild(ta); ta.select(); toast('Select and copy the text, then click elsewhere to close it.'); ta.addEventListener('blur', () => ta.remove()); } }
        else if (a === 'nbpcopy') { if (!nbPending) return; const txt = C.notebookText(nbPending.rr, nbPending.dateStr); let ok = false; try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) { } toast(ok ? 'Copied. Paste into your notebook or slide notes.' : 'Your browser blocked copying. Use Save image instead, or open the run and use Copy as text on the Export step.'); }
        else if (a === 'nbpsave') { if (!nbPending) return; try { if (await saveFile('notebook_card_' + safe(nbPending.name) + '.png', await C.notebookCardPngBytes(nbPending.rr, nbPending.dateStr))) closePreview(); } catch (e) { toast('Could not make the image: ' + (e && e.message || e)); } }
        else if (a === 'nbpng') { if (!run) return; openNotebookPreview(run, C.localDate(), S.name); }
        else if (a === 'del') { const r = runsList.find(x => x.id === id); try { await delRun(id); } catch (e) { toast('Could not delete: ' + (e && e.message || e)); } render(); if (r) toast('Deleted "' + r.name + '".', async () => { try { await putRun(r); } catch (e) { toast('Could not restore: ' + (e && e.message || e)); } render(); }); }
        else if (a === 'card') { const r = runsList.find(x => x.id === id); if (r) { try { openNotebookPreview(C.buildRun(dataFor(r.state)), C.localDate(r.updated || Date.now()), r.name); } catch (er) { toast('Could not draw the card: ' + er.message); } } }
        else if (a === 'import') { const f = $('#file'); if (f) f.click(); }
        else if (a === 'importrobot') { const f = $('#file2'); if (f) f.click(); }
        else if (a === 'addlib') { const n = $('#ln').value.trim(); if (!n) return; await putLib({ id: uid(), name: n, molarMass: parseFloat($('#lm').value) || 0, density: parseFloat($('#ld').value) || 0 }); render(); }
        else if (a === 'dellib') { const x = lib.find(y => y.id === id); try { await delLib(id); } catch (e) { toast('Could not delete: ' + (e && e.message || e)); } render(); if (x) toast('Removed "' + x.name + '" from the library.', async () => { try { await putLib(x); } catch (e) { toast('Could not restore: ' + (e && e.message || e)); } render(); }); }
        else if (a === 'showvials') { const idx = new Set(run.issues.filter(x => x.type === b.dataset.t && x.row != null).map(x => x.row)); vialFocus = { label: ISSUE_NAMES[b.dataset.t] || b.dataset.t, rows: idx }; view = 'combos'; page = 0; render(); window.scrollTo(0, 0); }
        else if (a === 'clearfocus') { vialFocus = null; page = 0; render(); }
        else if (a === 'confirmplates') { const l = platesList(); const sg = plateSig(); if (!l.includes(sg)) l.push(sg); setPlates(l); render(); toast('Plate numbers confirmed for the ' + S.hood + ' hood.'); }
        else if (a === 'unconfirmplates') { const sg = plateSig(); setPlates(platesList().filter(x => x !== sg)); render(); }
        else if (a === 'backup') { const pack = { format: 'robowski-studio-backup', version: 1, exported_at: new Date().toISOString(), runs: runsList, library: lib }; const ok = await saveFile('robowski_backup_' + C.localDate() + '.json', JSON.stringify(pack, null, 1)); if (ok) { ls.set('rs.lastBackup', String(Date.now())); render(); } }
        else if (a === 'restore') { const f = $('#file4'); if (f) f.click(); }
        else if (a === 'importlib') { const f = $('#file3'); if (f) f.click(); }
        else if (a === 'libtpl') await saveFile('reagent_library_template.csv', libCsv([{ name: 'ethyl acetoacetate', molarMass: 130.14, density: 1.03, solvent: 'ethanol', cas: '141-97-9', note: 'liquid: give density' }, { name: 'p-toluic acid', molarMass: 136.15, density: 0, solvent: 'ethanol', cas: '99-94-5', note: 'solid: leave density empty' }]));
        else if (a === 'libexp') await saveFile('reagent_library.csv', libCsv(lib));
      });
      // Adds colours to a copy of a saved state.
      function withColors(st) { const d = JSON.parse(JSON.stringify(st)); d.reagents.forEach((r, i) => { r.color = PAL[i % 6]; }); return d; }
      // Makes a safe file name.
      const safe = s => String(s || 'run').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40);
      /* rename a reagent code and everything that points at it (additives, triplet groups and their auto-names) */
      // Validates and applies a new reagent code (unique, allowed characters), with Undo.
      function renameReagent(i, raw) {
        const nc = String(raw).trim(), r = S.reagents[i], old = r.code; if (nc === old) return true;
        let msg = '';
        if (!/^[A-Za-z0-9_-]{1,24}$/.test(nc)) msg = 'A code can only use letters, numbers, _ and -.';
        else if (/_N2?$/i.test(nc)) msg = 'Codes ending in _N or _N2 are reserved for diluted stocks.';
        else if (nc.toLowerCase() === 'solvent') msg = "'solvent' is reserved for the reaction solvent.";
        else if (S.reagents.some((x, j) => j !== i && x.code.toLowerCase() === nc.toLowerCase())) msg = 'Another reagent already uses that code.';
        if (msg) { toast(msg); return false; }
        const u = snap(), auto = g => g.members.filter(Boolean).join('+') + (g.scale > 1 ? ' (' + g.scale + ' eq)' : '');
        S.tri.groups.forEach(g => { const wasAuto = g.derived && (g.name === auto(g) || g.name.startsWith(auto(g) + ' #')), suffix = g.name.slice(auto(g).length); g.members = g.members.map(m => m === old ? nc : m); if (wasAuto) g.name = auto(g) + suffix; });
        S.tri.adds.forEach(a => { if (a.code === old) a.code = nc; });
        r.code = nc; compute(); render(); toast(`Renamed ${old} to ${nc}.`, u); return true;
      }
      // Routes a chosen file to the generator import or robot-file import.
      async function importFile(f) {
        /* a robot input workbook opened with the generator button: open it as a robot file instead */
        let isRobot = false; try { await C.importRobotWorkbook(f); isRobot = true; } catch (e) { }
        if (isRobot) return importRobot(f);
        try { const d = await C.importGenerator(f); delete S.sets; Object.assign(S, exampleState(), { name: f.name.replace(/\.xlsx$/i, '') }, { mode: d.mode, vialVolume: d.vialVolume, threshold: d.threshold, dilutionFactor: d.dilutionFactor, reactionSolvent: d.reactionSolvent, reagents: d.reagents.map(r => ({ code: r.code, name: r.name, molarMass: r.molarMass, density: r.density, stock: r.stock, solvent: r.solvent, min: r.min, step: r.step, max: r.max, pipettingMode: 'empty' })) }); delete S.sets; normalize(S); S.id = null; compute(); view = 'setup'; render(); toast('Imported ' + f.name); }
        catch (e) { toast('Could not read that workbook: ' + e.message); }
      }

