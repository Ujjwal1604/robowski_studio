      // APP 60 - files in and out: reopening exported files, reagent library CSV, backup restore, saving files, previews, saving runs.
      // Edit here to: change the Export previews (openPreview), what each Save button writes (doDownload), the library CSV columns,
      // the backup file format (restoreBackup + the 'backup' action in file 50), or how a saved run record is built (saveRun).
      // ------------------------------------------------------------
      /* Rebuild triplet plates from a robot file this app exported (description sheet: "plate P · well W · section S · r:r:r + Ac"). Returns null for any other file. */
      // Rebuilds a triplet setup from a robot file this app exported.
      function triFromImport(d) {
        if (!d.desc || d.desc.length < 2) return null;
        const re = /^plate (\d+), well (\d+), section (\d+) \| ratio ([^|]+?) \|/, ent = [];
        for (let ri = 0; ri < d.desc.length - 1; ri++) {
          const r = d.desc[ri + 1]; if (!r || r[0] == null) continue; const cond = String(r[2] == null ? '' : r[2]), m = re.exec(cond), k = d.srcIdx.indexOf(ri);
          if (!m) { if (/^plate \d+, well \d+ \| blank$/.test(cond) && k < 0) continue; return null; }
          if (k < 0) return null;
          const parts = m[4].split(' + '), ratios = parts[0].split(':').map(Number); if (ratios.some(x => !(x >= 0))) return null;
          ent.push({ ri, k, plate: +m[1] - 1, well: +m[2] - 1, sec: +m[3] - 1, name: String(r[1]).split(': ')[0], ratios, rs: parts[0], add: parts[1] || '', conc: d.rows[k] });
        }
        if (!ent.length || ent.some(e => e.plate < 0 || e.plate > 2)) return null;
        const codes = d.reagents.map(r => r.code), ci = c => codes.indexOf(c), byName = {};
        ent.forEach(e => (byName[e.name] = byName[e.name] || []).push(e));
        if (ent.some(e => e.add && ci(e.add) < 0)) return null;
        const size = Math.max(...ent.map(e => e.ratios.length)), groups = [], gid = {};
        const full = [];
        for (const [name, es] of Object.entries(byName)) {
          const addCodes = new Set(es.map(e => e.add).filter(Boolean));
          const chem = codes.filter((c, j) => es.some(e => e.conc[j] > 1e-12 && e.add !== c));
          const g = { id: Math.random().toString(36).slice(2, 8), name, es, chem, derived: !(es[0].ratios.length === size && chem.length === size) };
          groups.push(g); gid[name] = g; if (!g.derived) full.push(g);
        }
        const flatGroup = g => g.es.every(e => e.ratios.every(x => x === g.es[0].ratios[0]) && e.rs === g.es[0].rs);
        if (!full.length || groups.every(flatGroup)) {
          /* No triplets in the file: a plate of flat 1:1 pairs/singles only (one vial per additive row, one after another). */
          const flatG = flatGroup;
          if (!groups.every(flatG)) return null;
          const sz = Math.max(3, ...groups.map(g => g.chem.length)); if (sz > 4) return null;
          const g0 = groups[0], e0 = [...g0.es].sort((x, y) => x.well - y.well)[0], base = e0.conc[ci(g0.chem[0])] / e0.ratios[0]; if (!(base > 0)) return null;
          const adds = []; [...ent].sort((x, y) => x.plate - y.plate || x.well - y.well).forEach(e => { if (!adds.includes(e.add)) adds.push(e.add); });
          const nad = adds.length, addIdx = e => adds.indexOf(e.add); if (ent.some(e => e.well !== e.sec * nad + addIdx(e))) return null;
          const addList = adds.map(a => { if (!a) return { code: '', equiv: 0 }; const e = ent.find(x => x.add === a); return { code: a, equiv: Math.round(e.conc[ci(a)] / base * 1e6) / 1e6 }; });
          const out = groups.map(g => { const o = { id: g.id, name: g.name, members: [...g.chem, ...Array(sz).fill('')].slice(0, sz), derived: true }; if (g.es[0].ratios[0] > 1) o.scale = g.es[0].ratios[0]; return o; });
          const plates = [null, null, null]; ent.forEach(e => { const pl = plates[e.plate] = plates[e.plate] || { sections: [], flat: true }; pl.sections[e.sec] = gid[e.name].id; });
          plates.forEach(p => { if (p) for (let i = 0; i < p.sections.length; i++) if (p.sections[i] == null) p.sections[i] = ''; });
          return { base: Math.round(base * 1e6) / 1e6, ratios: triPresetData(sz === 4 ? 'quartet' : 'triplet').ratios, adds: addList, groups: out, plates, derivedRatio: 'equal' };
        }
        /* order members of full groups by matching each reagent's concentration series to a ratio position */
        for (const g of full) {
          const slots = Array(size).fill(''), used = new Set();
          for (let j = 0; j < size; j++) for (const c of g.chem) { if (used.has(c)) continue; const cj = ci(c); let q = null, ok = true; for (const e of g.es) { const rj = e.ratios[j]; if (rj === 0) { if (e.conc[cj] > 1e-12) { ok = false; break; } continue; } const x = e.conc[cj] / rj; if (q == null) q = x; else if (Math.abs(x - q) > 1e-6 * Math.max(1, Math.abs(q))) { ok = false; break; } } if (ok && q != null) { slots[j] = c; used.add(c); break; } }
          g.members = slots.map((m, j) => m || g.chem.filter(c => !used.has(c))[0] || '');
          if (new Set(g.members).size !== size) g.members = g.chem.slice(0, size);
        }
        for (const g of groups.filter(x => x.derived)) { const f = full.find(x => g.chem.every(c => x.members.includes(c))); g.members = f ? f.members.map(m => g.chem.includes(m) ? m : '') : [...g.chem, ...Array(size).fill('')].slice(0, size); }
        /* pattern: columns and additive rows from the first full group's first section */
        const f0 = full[0], sec0 = f0.es[0].sec, es0 = f0.es.filter(e => e.sec === sec0).sort((a, b) => a.well - b.well), cols = [], adds = [];
        es0.forEach(e => { if (!cols.includes(e.rs)) cols.push(e.rs); if (!adds.includes(e.add)) adds.push(e.add); });
        const ratios = cols.map(x => x.split(':').map(Number)); if (ratios.some(r => r.length !== size)) return null;
        const e0 = es0[0], j0 = ci(f0.members[0]), base = e0.conc[j0] / e0.ratios[0];
        if (!(base > 0)) return null;
        const addList = adds.map(a => { if (!a) return { code: '', equiv: 0 }; const e = es0.find(x => x.add === a); return { code: a, equiv: Math.round(e.conc[ci(a)] / base * 1e6) / 1e6 }; });
        const plates = [null, null, null]; ent.forEach(e => { const pl = plates[e.plate] = plates[e.plate] || { sections: [] }; pl.sections[e.sec] = gid[e.name].id; });
        const flatG = g => g.es.every(e => e.ratios.every(x => x === g.es[0].ratios[0]) && e.rs === g.es[0].rs), dg = groups.filter(g => g.derived), eq = dg.length > 0 && dg.every(flatG);
        const out = groups.map(g => { const o = { id: g.id, name: g.name, members: g.members }; if (g.derived) { o.derived = true; if (eq && g.es[0].ratios[0] > 1) o.scale = g.es[0].ratios[0]; } return o; });
        const t = { base: Math.round(base * 1e6) / 1e6, ratios, adds: addList, groups: out, plates, derivedRatio: eq ? 'equal' : 'keep' };
        if (eq) {
          const nad = Math.max(1, addList.length); let reps = 0;
          const ok = plates.map((pl, pi) => { if (!pl) return null; const es = ent.filter(e => e.plate === pi); if (!es.every(e => gid[e.name].derived)) return false; const e0 = es.filter(e => e.sec === es[0].sec && e.add === es[0].add); const r = e0.length; if (!r) return false; if (reps && reps !== r) return false; return es.every(e => { const a = addList.findIndex(x => x.code === e.add); return a >= 0 && e.well >= e.sec * nad * r + a * r && e.well < e.sec * nad * r + (a + 1) * r; }) ? r : false; });
          const flatReps = ok.find(x => x);
          if (flatReps && ok.every(x => x === null || x === flatReps || x === false)) { t.reps = flatReps; plates.forEach((pl, pi) => { if (pl && ok[pi]) pl.flat = true; }); }
        }
        t.plates.forEach(p => { if (p) for (let i = 0; i < p.sections.length; i++) if (p.sections[i] == null) p.sections[i] = ''; });
        return t;
      }
      // Opens a robot workbook as a run.
      async function importRobot(f) {
        try {
          const d = await C.importRobotWorkbook(f);
          const tri = triFromImport(d);
          if (tri) {
            const st = exampleState();
            Object.assign(st, { name: d.name, mode: 'triplet', vialVolume: d.vialVolume, threshold: d.threshold, dilutionFactor: d.dilutionFactor, reactionSolvent: d.reactionSolvent, randomize: false, solventAfter: d.solventAfter, reagents: d.reagents.map(r => ({ ...r, min: '', step: '', max: '' })), tri });
            delete st.sets; if (d.deckPlates) st.deckPlates = d.deckPlates;
            triSync(st); S = normalize(st); S.id = null; compute();
            let differ = 0, total = 0; if (run) d.srcIdx.forEach((ri, k) => { const row = run.rows[ri], fr = d.fileRows[k]; total++; if (!row) { differ++; return; } for (const key of d.volCols) { if (Math.abs((+row['vol#' + key] || 0) - (fr[key] || 0)) > 1e-4) { differ++; break; } } });
            view = 'setup'; render(); toast(differ ? `Opened ${f.name} as triplet plates; ${differ} of ${total} wells differ from the file.` : `Opened ${f.name} as triplet plates; all ${total} wells match the file.`); return;
          }
          const st = exampleState();
          Object.assign(st, { name: d.name, mode: 'concentration', vialVolume: d.vialVolume, threshold: d.threshold, dilutionFactor: d.dilutionFactor, reactionSolvent: d.reactionSolvent, randomize: false, solventAfter: d.solventAfter, reagents: d.reagents, imported: { name: d.name, rows: d.rows, skipped: d.skipped } });
          delete st.sets; if (d.deckPlates) st.deckPlates = d.deckPlates;
          S = normalize(st); S.id = null; compute();
          let differ = 0;
          if (run) { run.rows.forEach((row, k) => { const fr = d.fileRows[k]; if (!fr) return; let bad = false; for (const key of d.volCols) { const a = +row['vol#' + key] || 0, b = fr[key] || 0; if (Math.abs(a - b) > 1e-4) { bad = true; break; } } if (bad) differ++; }); }
          const notes = [`Rebuilt ${d.rows.length} vials` + (d.skipped ? ` (${d.skipped} empty rows skipped)` : '') + `; vial volume ${nf(d.vialVolume, 1)} µL, dilution factor ${nf(d.dilutionFactor, 2)}, threshold set to ${nf(d.threshold, 1)} µL.`];
          notes.push(differ ? `${differ} vials come out with different volumes than the file, because the app recalculates volumes from the concentrations.` : 'Every vial reproduces the file\'s volumes exactly.');
          notes.push('Molar masses are not stored in a robot file, so stock-preparation masses are left out. Fill them in under Reagents if you need them.');
          S.imported.note = notes.join(' '); S.imported.differ = differ > 0;
          view = 'setup'; render(); toast('Opened ' + f.name);
        } catch (e) { toast(/needs the sheets/.test(e.message) ? 'This is not a robot input workbook. If it is an old generator spreadsheet, use Import generator .xlsx.' : 'Could not read that workbook: ' + e.message); }
      }
      // Reagent library CSV columns.
      const LIB_HEAD = ['name', 'molar_mass_g_mol', 'density_g_mL', 'stock_solvent', 'stock_mM', 'cas', 'notes', 'smiles', 'iupac_name'];
      const csvq = v => { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v) && !(v.trim() !== '' && isFinite(+v))) v = "'" + v; return /[",\n\r;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      function libCsv(rows) { return '\ufeff' + [LIB_HEAD.join(','), ...rows.map(x => [x.name, x.molarMass, x.density || '', x.solvent || '', x.stock || '', x.cas || '', x.note || '', x.smiles || '', x.iupac || ''].map(csvq).join(','))].join('\r\n') + '\r\n'; }
      const LIBHDR = [['cas', /^cas/], ['smiles', /smiles/], ['iupac', /iupac|systematic/], ['note', /^(note|comment|remark|description)/], ['stock', /stock.*(mm|conc|molar|mmol)|^stock$/], ['solv', /solvent/], ['dens', /dens|g ?ml|g ?cm/], ['mm', /(molar|molecular|formula|mol) ?(mass|weight|wt)|^(mw|fw|mr)( |$)|g ?mol/], ['name', /^(name|reagent|compound|chemical|substance|material)|name/]];
      function mapCols(row) { const cols = {}; row.forEach((h, ci) => { const n = String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); if (!n) return; for (const [k, re] of LIBHDR) if (cols[k] == null && re.test(n)) { cols[k] = ci; break; } }); return cols; }
      function parseNumLoose(v) { if (typeof v === 'number') return v; if (v == null) return NaN; let t = String(v).trim().replace(/\s/g, ''); if (!t) return NaN; if (/^[-+]?\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else if (/^[-+]?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, ''); else t = t.replace(',', '.'); const m = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(t); return m ? parseFloat(m[0]) : NaN; }
      // Reads a CSV/Excel reagent list into the library.
      async function importLibrary(f) {
        try {
          const sheets = await C.readTableFile(f); let found = null;
          for (const sh of sheets) { for (let ri = 0; ri < Math.min(15, sh.rows.length); ri++) { const cols = mapCols(sh.rows[ri] || []); if (cols.name != null && cols.mm != null) { found = { sh, ri, cols }; break; } } if (found) break; }
          if (!found) { toast("Couldn't find the columns. The file needs a name column and a molar mass column (g/mol). Use the Template button for an example."); return; }
          const { sh, ri, cols } = found, byName = new Map(lib.map(l => [String(l.name).trim().toLowerCase(), l])); let added = 0, updated = 0, n = 0; const skipped = [];
          for (const row0 of sh.rows.slice(ri + 1)) {
            const row = row0 && row0.map(c => typeof c === 'string' ? c.replace(/^'(?=[=+\-@\t\r])/, '') : c);
            if (!row || row.every(c => c == null || String(c).trim() === '')) continue; if (++n > 2000) break;
            const name = String(row[cols.name] == null ? '' : row[cols.name]).trim(), mm = parseNumLoose(row[cols.mm]);
            if (!name || !(mm > 0)) { skipped.push(name || '(no name)'); continue; }
            let d = cols.dens != null ? parseNumLoose(row[cols.dens]) : 0; if (!(d > 0)) d = 0;
            const ent = { name, molarMass: mm, density: d };
            if (cols.solv != null) { const sv = String(row[cols.solv] == null ? '' : row[cols.solv]).trim().toLowerCase(), hit = SOLV.find(x => x.toLowerCase() === sv); if (hit) ent.solvent = hit; }
            if (cols.stock != null) { const st = parseNumLoose(row[cols.stock]); if (st > 0) ent.stock = st; }
            if (cols.cas != null) { const c = String(row[cols.cas] == null ? '' : row[cols.cas]).trim(); if (c) ent.cas = c; }
            for (const k of ['smiles', 'iupac']) if (cols[k] != null) { const c = String(row[cols[k]] == null ? '' : row[cols[k]]).trim(); if (c) ent[k] = c; }
            if (cols.note != null) { const c = String(row[cols.note] == null ? '' : row[cols.note]).trim(); if (c) ent.note = c; }
            const key = name.toLowerCase(), ex = byName.get(key);
            if (ex) { const nx = { ...ex, ...ent, id: ex.id }; await putLib(nx); byName.set(key, nx); updated++; } else { const nx = { id: uid(), ...ent }; await putLib(nx); byName.set(key, nx); added++; }
          }
          render();
          toast(`Library: ${added} added, ${updated} updated` + (skipped.length ? `, ${skipped.length} skipped without a name or molar mass (${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''})` : '') + '.');
        } catch (e) { toast('Could not read that file: ' + e.message); }
      }
      // Restores runs and library from a backup file (adds missing, keeps the newer run).
      async function restoreBackup(f) {
        try {
          if (f.size > 50e6) throw new Error('that file is too large to be a backup');
          const pack = JSON.parse(await f.text());
          if (!pack || pack.format !== 'robowski-studio-backup' || !Array.isArray(pack.runs) || !Array.isArray(pack.library)) throw new Error('this is not a Robowski Studio backup file');
          let added = 0, updated = 0, kept = 0, libAdded = 0, skipped = 0;
          for (const r of pack.runs) {
            if (!r || typeof r.id !== 'string' || typeof r.name !== 'string' || !r.state || !Array.isArray(r.state.reagents)) { skipped++; continue; }
            const ex = runsList.find(x => x.id === r.id);
            if (!ex) { await putRun(r); added++; } else if ((+r.updated || 0) > (+ex.updated || 0)) { await putRun(r); updated++; } else kept++;
          }
          const names = new Set(lib.map(x => String(x.name).trim().toLowerCase()));
          for (const x of pack.library) { if (!x || !String(x.name || '').trim()) { skipped++; continue; } const k = String(x.name).trim().toLowerCase(); if (names.has(k)) continue; names.add(k); await putLib({ ...x, id: lib.some(y => y.id === x.id) ? uid() : (x.id || uid()) }); libAdded++; }
          render(); toast(`Restored: ${added} run${added === 1 ? '' : 's'} added, ${updated} updated, ${kept} already up to date; ${libAdded} reagent${libAdded === 1 ? '' : 's'} added${skipped ? '; ' + skipped + ' unreadable entries skipped' : ''}.`);
        } catch (e) { toast('Could not restore: ' + (e && e.message || e)); }
      }
      // Saves a file through the viewer download capability, or a normal browser download. Returns true only if saved.
      async function saveFile(name, data) {
        let dl = null; try { dl = globalThis.claude && await globalThis.claude.use('downloads'); } catch (e) { }
        if (!dl) { try { const blob = data instanceof Blob ? data : new Blob([data]); const url = URL.createObjectURL(blob); const el = document.createElement('a'); el.href = url; el.download = name; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); toast('Downloaded ' + name); return true; } catch (e) { toast('Could not download ' + name + ': ' + (e && e.message || e)); return false; } }
        try { await dl.save({ filename: name, data }); toast('Saved ' + name); return true; } catch (e) { if (e && e.code === 'declined') return false; toast('Could not save ' + name + ': ' + (e && e.message || e)); return false; }
      }
      // Builds and saves one export file; marks the run exported only after a successful save.
      async function doDownload(kind) {
        if (!run || run.blockingIssues > 0) return;
        try {
          let ok = false;
          if (kind === 'xlsx') ok = await saveFile('robowski_run.xlsx', C.workbookBytes(data(), run));
          else if (kind === 'bench') ok = await saveFile('bench_sheet_' + safe(S.name) + '.html', C.benchSheetHtml(run, C.localDate()));
          else if (kind === 'nb') ok = await saveFile('notebook_card_' + safe(S.name) + '.png', await C.notebookCardPngBytes(run, C.localDate()));
          else if (kind === 'stock') ok = await saveFile('stock_preparation.csv', C.stockCsv(run));
          else if (kind === 'load') ok = await saveFile('deck_load_checklist.csv', C.loadCsv(run));
          else if (kind === 'png') ok = await saveFile('run_card.png', await C.runCardPngBytes(run));
          else if (kind === 'zip') { let png = null; try { png = await C.runCardPngBytes(run); } catch (e) { } ok = await saveFile('robowski_package.zip', C.packageBytes(run, png)); }
          if (ok) { status = 'exported'; if (S.id) { const r = runsList.find(x => x.id === S.id); if (r) { r.exports = r.exports || []; r.exports.push({ t: Date.now(), kind }); if (r.exports.length > 50) r.exports = r.exports.slice(-50); r.status = 'exported'; r.updated = Date.now(); try { await putRun(r); } catch (e) { } } } }
        } catch (e) { toast('Export failed: ' + e.message); }
      }
      let nbPending = null;
      // Preview dialog for the notebook card (Save image / Copy as text).
      function openNotebookPreview(rr, dateStr, name) {
        nbPending = { rr, dateStr, name }; closePreview();
        const overlay = document.createElement('div'); overlay.id = 'previewModal'; overlay.className = 'modal-overlay';
        const svg = C.notebookCardSvg(rr, dateStr).replace(/width="\d+" height="\d+" viewBox/, 'width="100%" viewBox');
        overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="pvTitle"><div class="modal-head"><div class="mt" id="pvTitle">Notebook card <b>${esc(name)}</b></div><button class="ib" data-act="closepreview" aria-label="Close preview" title="Close">✕</button></div><div class="modal-body"><div style="overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:#fff"><div style="min-width:640px">${svg}</div></div></div><div class="modal-foot"><button class="btn" data-act="closepreview">Close</button><button class="btn" data-act="nbpcopy">Copy as text</button><button class="btn pri" data-act="nbpsave">Save image (PNG)</button></div></div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) closePreview(); });
        prevFocus = document.activeElement; document.body.appendChild(overlay);
        document.addEventListener('keydown', escPreview, true);
        const first = overlay.querySelector('[data-act="nbpsave"]'); if (first) first.focus();
      }
      // Preview dialog for each export file. The Excel preview is read back from the real generated file.
      async function openPreview(kind) {
        if (!run || run.blockingIssues > 0) return;
        if (kind === 'nb') { openNotebookPreview(run, C.localDate(), S.name); return; }
        const meta = { bench: ['bench_sheet.html', 'Bench sheet', 'HTML · prints on 1-2 pages'], xlsx: ['robowski_run.xlsx', 'Excel workbook', 'Binary · 5 sheets'], stock: ['stock_preparation.csv', 'Stock preparation', 'CSV · comma-separated'], load: ['deck_load_checklist.csv', 'Deck load checklist', 'CSV · comma-separated'], png: ['run_card.png', 'Run card image', 'PNG · 1200 × 900'], zip: ['robowski_package.zip', 'Complete package', 'ZIP · all files bundled'] }[kind];
        let body = '', foot = '';
        try {
          if (kind === 'stock' || kind === 'load') {
            const text = kind === 'stock' ? C.stockCsv(run) : C.loadCsv(run);
            const rows = C.parseDelimited(text).filter(r => r.some(c => c !== ''));
            const head = rows[0] || [];
            const previewRows = rows.slice(0, 200);
            body = `<div class="preview-meta"><span><b>${meta[1]}</b></span><span>${meta[2]}</span><span><b>${rows.length - 1}</b> rows</span></div>
 <div class="tbl" style="max-height:58vh"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${previewRows.slice(1).map(r => `<tr>${head.map((_, ci) => `<td>${esc(r[ci] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
 ${rows.length > 201 ? `<div class="hint" style="margin-top:10px">Showing 200 of ${rows.length - 1} rows. Download to see all.</div>` : ''}`;
            foot = `<button class="btn" data-act="closepreview">Close</button><button class="btn pri" data-act="previewdl" data-v="${kind}">Download</button>`;
          } else if (kind === 'png') {
            const png = await C.runCardPngBytes(run);
            const url = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
            body = `<div class="preview-meta"><span><b>${meta[1]}</b></span><span>${meta[2]}</span><span><b>${(png.length / 1024).toFixed(0)}</b> KB</span></div><div class="preview-svg" style="text-align:center"><img src="${url}" alt="Run card preview" style="max-width:100%;border-radius:10px;box-shadow:var(--shadow-md)" id="previewImg"></div>`;
            foot = `<button class="btn" data-act="closepreview">Close</button><button class="btn pri" data-act="previewdl" data-v="${kind}">Download</button>`;
          } else if (kind === 'xlsx') {
            const wb = C.workbookBytes(data(), run);
            const sheets = await C.readTableFile(new File([wb], 'robowski_run.xlsx'));
            const colName = i => { let n = '', k = i + 1; while (k > 0) { const m = (k - 1) % 26; n = String.fromCharCode(65 + m) + n; k = Math.floor((k - 1) / 26); } return n; };
            const show = v => v == null ? '' : typeof v === 'number' ? String(Number.parseFloat(v.toPrecision(11))) : String(v);
            const tabs = sheets.map((sh, i) => `<button class="sheettab" data-act="sheet" data-v="${i}" data-i="${i}" role="tab"${i === 0 ? ' aria-selected="true"' : ''}>${esc(sh.name)}</button>`).join('');
            const panes = sheets.map((sh, i) => {
              const ncol = Math.max(1, ...sh.rows.map(r => r.length)), head = Array.from({ length: ncol }, (_, c) => `<th>${colName(c)}</th>`).join('');
              const rowsHtml = sh.rows.slice(0, 200).map((r, ri) => `<tr><th>${ri + 1}</th>${Array.from({ length: ncol }, (_, c) => `<td style="text-align:${typeof r[c] === 'number' ? 'right' : 'left'}">${esc(show(r[c]))}</td>`).join('')}</tr>`).join('');
              return `<div class="sheetpane" data-pane="${i}"${i === 0 ? '' : ' hidden'}><div class="tbl" style="max-height:52vh"><table><thead><tr><th></th>${head}</tr></thead><tbody>${rowsHtml || '<tr><td colspan="99" class="empty-note">Empty sheet.</td></tr>'}</tbody></table></div><div class="hint" style="margin-top:8px">${sh.rows.length} row${sh.rows.length === 1 ? '' : 's'} including the header${sh.rows.length > 200 ? '; showing the first 200. Download to see all' : ''}.</div></div>`;
            }).join('');
            body = `<div class="preview-meta"><span><b>${meta[1]}</b></span><span>${meta[2]}</span><span><b>${(wb.length / 1024).toFixed(0)}</b> KB</span><span><b>${sheets.length}</b> sheets</span></div>
 <div class="hint" style="margin-bottom:8px">This view is read back from the generated file itself, laid out like Excel (row numbers, column letters, numbers as Excel shows them). Column widths, fonts and the frozen header row follow your Excel.</div>
 <div class="sheettabs" role="tablist">${tabs}</div>${panes}`;
            foot = `<button class="btn" data-act="closepreview">Close</button><button class="btn pri" data-act="previewdl" data-v="${kind}">Download</button>`;
          } else if (kind === 'bench') {
            const bp = C.benchSheetParts(run, C.localDate());
            body = `<div class="preview-meta"><span><b>${meta[1]}</b></span><span>${meta[2]}</span></div><style>${bp.css}</style><div style="border:1px solid var(--line);border-radius:10px;background:#fff;padding:18px;max-height:58vh;overflow:auto">${bp.body}</div><div class="hint" style="margin-top:8px">Open the downloaded file in any browser and print it (Ctrl+P / Cmd+P) for the hood.</div>`;
            foot = `<button class="btn" data-act="closepreview">Close</button><button class="btn pri" data-act="previewdl" data-v="${kind}">Download</button>`;
          } else if (kind === 'zip') {
            const wb = C.workbookBytes(data(), run);
            let pngSize = 0; try { pngSize = (await C.runCardPngBytes(run)).length; } catch (e) { }
            const items = [['robowski_run.xlsx', wb.length], ['stock_preparation.csv', C.stockCsv(run).length], ['deck_load_checklist.csv', C.loadCsv(run).length], ['run_card.svg', C.runCardSvg(run).length], ['run_card.png', pngSize], ['manifest.json', JSON.stringify(C.runManifest(run)).length]];
            body = `<div class="preview-meta"><span><b>${meta[1]}</b></span><span>${meta[2]}</span><span><b>${items.length}</b> files</span></div>
 <div class="list">${items.map(it => `<div><b class="mono" style="min-width:220px">${esc(it[0])}</b><span class="mono" style="color:var(--fg2)">${(it[1] / 1024).toFixed(1)} KB</span></div>`).join('')}</div>
 <div class="hint" style="margin-top:12px">The workbook, both CSVs, the plate-layout card (SVG and PNG) and a manifest with the seed and assumptions, in one zip.</div>`;
            foot = `<button class="btn" data-act="closepreview">Close</button><button class="btn pri" data-act="previewdl" data-v="${kind}">Download</button>`;
          }
        } catch (e) {
          body = `<div class="issue bad"><span>Could not build the preview: ${esc(e.message)}</span></div>`;
          foot = `<button class="btn" data-act="closepreview">Close</button>`;
        }
        const overlay = document.createElement('div');
        overlay.id = 'previewModal';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="pvTitle"><div class="modal-head"><div class="mt" id="pvTitle">Preview <b>${esc(meta[0])}</b></div><button class="ib" data-act="closepreview" aria-label="Close preview" title="Close">✕</button></div><div class="modal-body">${body}</div><div class="modal-foot">${foot}</div></div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) closePreview(); });
        prevFocus = document.activeElement; document.body.appendChild(overlay);
        document.addEventListener('keydown', escPreview, true);
        const first = overlay.querySelector('[data-act="closepreview"]'); if (first) first.focus();
      }
      let prevFocus = null;
      // Keyboard handling for the dialog (Escape, Tab stays inside).
      function escPreview(e) {
        if (e.key === 'Escape') { closePreview(); return; }
        if (e.key !== 'Tab') return; const m = document.getElementById('previewModal'); if (!m) return;
        const f = [...m.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null); if (!f.length) return;
        const a = f[0], z = f[f.length - 1]; if (!m.contains(document.activeElement)) { e.preventDefault(); a.focus(); } else if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
      function closePreview() {
        const m = document.getElementById('previewModal'); if (m) {
          const img = m.querySelector('#previewImg'); if (img && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
          m.remove();
        }
        document.removeEventListener('keydown', escPreview, true);
        if (prevFocus && document.contains(prevFocus)) { try { prevFocus.focus(); } catch (e) { } } prevFocus = null;
      }

      // Saves the current run into the library of runs.
      async function saveRun(asNew) {
        if (!run && !triPending) { toast('Fix the input error first.'); return; }
        if (asNew || !S.id) S.id = uid();
        const ts = run ? null : triStats(), stocks = run ? Object.keys(run.stocks).length : triUsedCodes().size;
        const sm = { id: S.id, name: S.name, mode: S.mode, hood: S.hood, reactions: run ? (S.mode === 'triplet' ? triMeta.filter(m => !m.blank).length : run.reactions) : ts.wells, plates: run ? run.plates : ts.plates, tips: tipsText(), stocks, codes: S.reagents.map(r => r.code), colors: S.reagents.map((r, i) => rcol(i)), status, updated: Date.now(), state: JSON.parse(JSON.stringify(S)) };
        try { if (run) sm.summary = C.notebookSummary(run).reagents.map(x => ({ code: x.code, text: (x.name && x.name !== x.code ? x.name + ': ' : '') + x.use })); } catch (e) { }
        try { await putRun(sm); toast('Saved "' + S.name + '".'); } catch (e) { toast('Could not save: ' + (e && e.message || e)); }
      }

