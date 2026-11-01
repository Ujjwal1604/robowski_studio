      // APP 30 - validation of what the user typed, compute() (runs the engine and stores run/err), the auto-fix search trigger,
      // step states (done/warn/lock), toast messages, and the deck-confirmation memory.
      // Edit here to: add input checks (validate), change when fixes are searched (FIX_AUTO_MAX), or the toast look-and-feel.
      // ------------------------------------------------------------
      // Checks the setup fields and collects problems per field (red outlines).
      function validate() {
        const m = [], inv = new Set(); const isn = v => v !== '' && v != null && Number.isFinite(+v);
        const chk = (k, label, ok) => { if (!ok) { m.push(label); inv.add(k); } };
        chk('vialVolume', 'vial volume', isn(S.vialVolume) && +S.vialVolume > 0);
        chk('threshold', 'threshold', isn(S.threshold) && +S.threshold > 0);
        chk('dilutionFactor', 'dilution factor', isn(S.dilutionFactor) && +S.dilutionFactor > 1);
        chk('flasksText', 'volumetric flasks', flaskList().length > 0);
        chk('leftoverMl', 'leftover volume', isn(S.leftoverMl) && +S.leftoverMl >= 0);
        const need = S.mode === 'triplet' ? triUsedCodes() : null;
        S.reagents.forEach((r, i) => { if (need && !need.has(r.code)) return; chk(`reagents.${i}.stock`, r.code + ' stock', isn(r.stock) && +r.stock > 0); });
        if (S.mode === 'triplet') { const t = S.tri; chk('tri.base', 'base concentration', isn(t.base) && +t.base > 0); t.ratios.forEach((v, i) => v.forEach((x, j) => chk(`tri.ratios.${i}.${j}`, 'ratios', isn(x) && +x >= 0))); t.adds.forEach((a, i) => chk(`tri.adds.${i}.equiv`, 'additive equivalents', isn(a.equiv) && +a.equiv >= 0)); }
        if (!S.imported && S.mode !== 'triplet') S.sets.forEach((set, si) => set.items.forEach((it, i) => { if (!it.on) return; const p = `sets.${si}.items.${i}.`, code = S.reagents[i].code; chk(p + 'min', code + ' range', isn(it.min) && +it.min >= 0); chk(p + 'max', code + ' range', isn(it.max) && +it.max >= 0); chk(p + 'step', code + ' range', isn(it.step) && +it.step > 0); }));
        return { m: [...new Set(m)], inv };
      }
      // Runs the engine on the current state; sets the global run (result) or err. Called after every edit.
      function saveDraft() { if (ls.set('rs.draft2', JSON.stringify(S))) { draftSavedAt = Date.now(); } else if (!compute.warned) { compute.warned = true; toast('This browser is blocking storage, so your draft will not survive a reload. Export or save the run as a file to keep it.'); } }
      function compute() {
        const v = validate(); missing = v.m; invalid = v.inv;
        allEmpty = S.mode === 'triplet' ? (S.reagents.every(r => r.stock === '' || r.stock == null) && !S.tri.groups.length) : (!S.imported && S.reagents.every(r => r.stock === '' || r.stock == null) && S.sets.every(s => s.items.every(it => it.min === '' || it.min == null)));
        if (allEmpty) invalid = new Set();
        blank = missing.length > 0; vialFocus = null; triPending = false;
        if (blank) { run = null; rowsCache = []; setOf = []; clearTimeout(fixTimer); err = allEmpty ? (S.mode === 'triplet' ? 'Fill in the stock concentrations of the reagents you use and add some groups to see the plate.' : 'Fill in the reagents and the vial-set ranges to see the checks, combinations and deck.') : 'Still to fill in: ' + missing.slice(0, 5).join(', ') + (missing.length > 5 ? ' …' : '') + '.'; fixes = []; saveDraft(); return; }
        let tb = null;
        if (S.mode === 'triplet') {
          try { tb = triBuildRows(); } catch (e) { run = null; rowsCache = []; setOf = []; triMeta = []; clearTimeout(fixTimer); fixes = []; err = e.message; saveDraft(); return; }
          if (!tb) { triPending = true; run = null; rowsCache = []; setOf = []; triMeta = []; clearTimeout(fixTimer); fixes = []; err = 'Assign a group to at least one section to see the volumes.'; saveDraft(); return; }
          rowsCache = tb.rows; triBlank = tb.blank; triMeta = tb.meta; setOf = tb.rows.map(() => 0);
        }
        try { if (!tb) { const b = buildRows(); rowsCache = b.rows; setOf = b.setOf; } run = C.buildRun(data()); err = null; } catch (e) { run = null; err = e.message; }
        fixes = []; clearTimeout(fixTimer);
        fixesDone = false; whyNot = [];
        fixesBusy = false;
        if (run && run.blockingIssues > 0 && run.reactions <= FIX_AUTO_MAX) fixTimer = setTimeout(runFixSearch, 250);
        saveDraft();
      }
      /* searching for verified fixes runs on the main thread: automatic for small runs, on a button for big ones (so typing never freezes) */
      // Fix search runs automatically only up to this many vials; larger runs use the button.
      const FIX_AUTO_MAX = 300;
      let fixesBusy = false;
      // Runs the verified-fix search (slow part), then repaints.
      function runFixSearch() { try { fixes = C.suggestFixes(data()); } catch (e) { fixes = []; } try { whyNot = C.explainNoFix(data()); } catch (e) { whyNot = []; } fixesDone = true; fixesBusy = false; paintLive(); }
      const rcol = i => PAL[i % PAL.length];
      function codeColor(code) { const i = S.reagents.findIndex(r => r.code === code); return rcol(i < 0 ? 0 : i); }

      /* ---------- helpers ---------- */
      // Tips summary text "50/300/1000".
      function tipsText() { if (!run) return '-'; const t = run.tipCounts; return `${t[50]} / ${t[300]} / ${t[1000]}`; }
      // The pass/fail rows in the live panel.
      function checks() {
        if (!run) return [];
        const out = [];
        S.reagents.forEach((r, i) => {
          let min = 1e9, max = 0; const keys = Object.keys(run.stocks).filter(k => run.stocks[k].source_reagent === r.code);
          run.rows.forEach(row => keys.forEach(k => { const v = +row['vol#' + k] || 0; if (v > 0) { min = Math.min(min, v); max = Math.max(max, v); } }));
          out.push({ code: r.code, i, min: min === 1e9 ? 0 : min, max, okMin: min >= S.threshold - 1e-9 || min === 1e9, okMax: max < 1000 });
        });
        let smin = 1e9, neg = 0; run.rows.forEach(row => { const v = +row['vol#solvent']; if (v < 0) neg++; if (v > 0) smin = Math.min(smin, v); });
        out.push({ code: 'solvent', i: -1, min: smin === 1e9 ? 0 : smin, max: 0, okMin: smin >= S.threshold - 1e-9 || smin === 1e9, okMax: true, neg });
        return out;
      }
      function recipeText(row, idx) {
        if (!row) return '';
        const lines = [`<b>Reaction ${row.global_index + 1}</b> · plate ${row.plate_number} · vial ${row.container_id}`];
        row.recipe.forEach(rc => { if (rc.target_concentration > 0) lines.push(`${esc(rc.code)} ${nf(rc.target_concentration, 3)} mM &larr; ${nf(rc.transfer_volume, 1)} µL of ${esc(rc.stock_key)}${rc.dilution_level ? ` (${S.dilutionFactor ** rc.dilution_level}×)` : ''}`); });
        lines.push(`solvent ${nf(row['vol#solvent'], 1)} µL` + (row['vol#solvent'] < 0 ? ' &#9888; negative' : ''));
        return lines.join('<br>');
      }
      // Small message at the bottom. Pass a function as the second argument to show an Undo button.
      function toast(m, undo) {
        document.querySelectorAll('.toast').forEach(x => x.remove());
        const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); const sp = document.createElement('span'); sp.textContent = m; t.appendChild(sp);
        if (undo) { const b = document.createElement('button'); b.className = 'btn sm'; b.textContent = 'Undo'; b.onclick = () => { t.remove(); undo(); }; t.appendChild(b); }
        document.body.appendChild(t); setTimeout(() => t.remove(), undo ? 9000 : Math.max(3200, m.length * 55));
      }
      const snap = () => { const j = JSON.stringify(S); return () => { S = JSON.parse(j); compute(); render(); }; };
      function blockSet() { if (!run) return new Set(); if (_bsRun !== run) { _bsRun = run; _bs = new Set(run.issues.filter(x => x.severity === 'block' && x.row != null).map(x => x.row)); } return _bs; }
      const LOCK = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5.5" width="7" height="5" rx="1.2"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>';
      function plateSig() { if (!run) return ''; const d = run.deck; return JSON.stringify([S.hood, d.solvent_kind, d.solvent_plate, d.solvent_container, d.plates]); }
      let platesMem = [];
      function platesList() { let a = []; try { a = JSON.parse(ls.get('rs.platesOk') || '[]'); } catch (e) { } return [...new Set([...a, ...platesMem])]; }
      function setPlates(l) { platesMem = l; ls.set('rs.platesOk', JSON.stringify(l.slice(-50))); }
      // Has the user confirmed this deck layout? (remembered per layout)
      function platesOk() { return !!run && platesList().includes(plateSig()); }
      // State of each step tab: done / warn / lock.
      function stepState(id) {
                if (id === 'setup') return (blank || triPending) ? '' : (err || (run && run.blockingIssues > 0)) ? 'warn' : 'done';
        if (id === 'combos') return !run ? '' : run.blockingIssues > 0 ? 'warn' : visited.combos ? 'done' : '';
        if (id === 'deck') return !run ? '' : !run.deck.positions_fit ? 'warn' : visited.deck ? (platesOk() ? 'done' : 'warn') : '';
        if (id === 'export') return (!run || run.blockingIssues > 0) ? 'lock' : status === 'exported' ? 'done' : '';
        return '';
      }
      function stepsHTML() {
        return `<nav class="steps" id="stepsnav" role="tablist" aria-label="Run steps">${TABS.filter(t => t[0] !== 'runs').map((t, i) => { const st = stepState(t[0]); const mark = st === 'done' ? '✓' : st === 'warn' ? '!' : st === 'lock' ? LOCK : i + 1; return `<button class="step ${view === t[0] ? 'on' : ''} ${st}" role="tab" aria-selected="${view === t[0]}" tabindex="${view === t[0] ? 0 : -1}" data-act="tab" data-v="${t[0]}"${st === 'lock' ? ' title="Fix the blocking checks first"' : ''}><b>${mark}</b>${t[1]}</button>`; }).join('')}</nav>`;
      }
      function markInvalid() { document.querySelectorAll('[data-k]').forEach(el => { const b = invalid.has(el.dataset.k); el.classList.toggle('inv', b); if (b) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }); }
      // The "Before you download" summary on the Export tab.
      function readyCard() {
        const d = run.deck, ok = platesOk(), seq = S.reagents.map(r => r.code); seq.splice(Math.min(Math.max(+S.solventAfter || 0, 0), seq.length), 0, 'solvent');
        const nSt = Object.keys(run.stocks).length, nDil = Object.values(run.stocks).filter(x => x.dilution_level > 0).length, t = run.tipCounts;
        const row = (k, v) => `<div><b>${k}</b><span>${v}</span></div>`;
        return `<div class="rdy" style="margin-bottom:18px"><h3 style="margin:0 0 8px">Before you download</h3>
 ${row('Hood and plates', `${S.hood === 'left' ? 'Left' : 'Right'} hood · solvent at ${esc(d.solvent_location)} · stock plates ${d.plates.join(', ')} ${ok ? '<span class="chip ok">confirmed</span>' : '<span class="chip warn">not checked against your deck</span> <button class="btn sm" data-act="tab" data-v="deck">Check on Deck</button>'}`)}
 ${row('Vials', `${S.mode === 'triplet' ? triMeta.filter(m => !m.blank).length + ' wells' : run.reactions} in ${run.plates} plate${run.plates === 1 ? '' : 's'} · ${S.mode === 'triplet' ? 'fixed plate layout (not shuffled)' : S.imported ? 'order from the imported file' : S.randomize ? 'shuffled, seed ' + esc(S.randomSeed) : 'generator order (not shuffled)'}`)}
 ${row('Addition order', seq.map(esc).join(' → '))}
 ${row('Stocks', `${nSt} on the deck${nDil ? ` (${nDil} made by hand dilution)` : ''} · ${S.leftoverMl} mL leftover each`)}
 ${row('Tips to load', `50 µL: ${t[50]} · 300 µL: ${t[300]} · 1000 µL: ${t[1000]}`)}
 ${row('Checks', run.warningCount ? `no blocking issues · ${run.warningCount} warning${run.warningCount === 1 ? '' : 's'}` : 'all pass')}</div>`;
      }
      function plateConfirmHTML() {
        if (platesOk()) return `<div class="issue ok"><span><b>Confirmed.</b> You checked these plate numbers against your ${S.hood} hood deck.</span><button class="btn sm" data-act="unconfirmplates">Undo</button></div>`;
        return `<div class="issue warn"><span><b>Not checked yet.</b> These are the app's default plate numbers for the ${S.hood} hood. Compare them with your physical deck before running.</span><button class="btn sm pri" data-act="confirmplates">These match my deck</button></div>`;
      }
      function inlineRanges() { return S.mode !== 'triplet' && !S.imported && S.sets.length === 1 && S.sets[0].items.every(it => it.on); }

