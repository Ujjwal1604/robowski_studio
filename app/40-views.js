      // APP 40 - the screens. Each *View function returns an HTML string (template literal); render() puts it in the page.
      // Edit here to: change the layout or wording of Setup / Combinations / Deck / Export / Runs, add a card, or add a column.
      // Buttons use data-act="name"; the matching code is in file 50 (click handler). Inputs use data-k="path" bound to the state S.
      // Colours and spacing live in style/*.css, not here.
      // ------------------------------------------------------------
      /* ---------- views ---------- */
      // Summary strip under the step tabs (mode, vial volume, wells, time, reagent badges).
      function strip() {
        const bad = run ? run.blockingIssues : 0, warn = run ? run.warningCount : 0;
        const chip = triPending ? '<span class="chip mut">No groups placed yet</span>' : blank ? (allEmpty ? '<span class="chip mut">Not filled in yet</span>' : `<span class="chip warn">${missing.length} to fill in</span>`) : err ? '<span class="chip bad">Input error</span>' : bad ? `<span class="chip bad">${bad} check${bad > 1 ? 's' : ''} failing</span>` : warn ? `<span class="chip warn">${warn} warning${warn > 1 ? 's' : ''}</span>` : '<span class="chip ok">All checks pass</span>';
        return `<div class="sband" id="strip"><div class="sbin">
 <span>Mode <b>${S.mode === 'equivalence' ? 'Equivalence' : S.mode === 'triplet' ? 'Triplet plate' : 'Concentration'}</b></span>
 <span>Vial <b class="mono">${nf(S.vialVolume, 0)} µL</b></span>
 <span>${S.mode === 'triplet' ? 'Wells' : 'Combinations'} <b class="mono">${run ? (S.mode === 'triplet' ? triMeta.filter(m => !m.blank).length : run.reactions) : '-'}</b></span>
 <span>Vial plates <b class="mono">${run ? run.plates : '-'}</b></span>
 <span>Tips 50/300/1000 <b class="mono">${tipsText()}</b></span>
 <span title="${run ? esc(run.runtime.calibrationNote) : ''}">Est. time <b>${run ? esc(run.runtime.label) : '-'}</b></span>
 <span style="display:inline-flex;gap:6px;align-items:center">${S.reagents.map((r, i) => `<span class="rdot" style="background:${rcol(i)}">${esc(r.code)}</span>`).join('')}</span>
 ${chip}</div></div>`;
      }
      // One row of the reagent table (editable code, name, molar mass, density, stock, solvent).
      function reagentRow(r, i) {
        const c = rcol(i), inl = inlineRanges(), it = inl ? S.sets[0].items[i] : null, unit = (S.mode === 'equivalence' && i > 0) ? 'equiv.' : 'mM';
        return `<div class="rrow" data-i="${i}"><div class="rw">
  <input type="text" class="code code-in" style="background:${c};font-size:${r.code.length <= 4 ? 14 : r.code.length <= 6 ? 11 : r.code.length <= 10 ? 9 : 7}px" data-code="${i}" value="${esc(r.code)}" maxlength="24" autocomplete="off" spellcheck="false" aria-label="Reagent ${i + 1} code" title="Added #${i + 1}. Click to rename this code (letters, numbers, _ and -).">
  <input type="text" class="f" data-k="reagents.${i}.name" list="libnames" autocomplete="off" value="${esc(r.name)}" aria-label="${esc(r.code)} name" placeholder="name (library suggests)">
  <input type="number" class="f mono" step="any" data-k="reagents.${i}.molarMass" value="${r.molarMass}" aria-label="${esc(r.code)} molar mass">
  <input type="number" class="f mono" step="any" data-k="reagents.${i}.density" value="${r.density || ''}" placeholder="solid" aria-label="${esc(r.code)} density">
  <input type="number" class="f mono" step="any" data-k="reagents.${i}.stock" value="${r.stock}" aria-label="${esc(r.code)} stock">
  <select class="f" data-k="reagents.${i}.solvent" aria-label="${esc(r.code)} stock solvent">${SOLV.map(s => `<option ${s === r.solvent ? 'selected' : ''}>${s}</option>`).join('')}</select>
  <div class="racts"><button class="ib" data-act="mv" data-v="-1" data-i="${i}" aria-label="Add earlier" title="Add earlier" ${i === 0 ? 'disabled' : ''}>↑</button><button class="ib" data-act="mv" data-v="1" data-i="${i}" aria-label="Add later" title="Add later" ${i === S.reagents.length - 1 ? 'disabled' : ''}>↓</button>
  <button class="ib" data-act="tolib" data-i="${i}" title="Save to library" aria-label="Save to library">★</button>
  ${S.reagents.length > 2 ? `<button class="ib" data-act="rmr" data-i="${i}" aria-label="Remove reagent ${esc(r.code)}" title="Remove">✕</button>` : '<span class="ib ph"></span>'}</div></div>
  ${inl ? `<div class="rng"><span class="l">Range in ${unit}</span>${['min', 'step', 'max'].map(f => `<label class="l" style="display:flex;gap:6px;align-items:center">${f}<input type="number" class="f mono" step="any" data-k="sets.0.items.${i}.${f}" value="${it[f]}" aria-label="${esc(r.code)} ${f}"></label>`).join('')}<span class="rp" id="rp${i}"></span></div>` : ''}
  ${S.mode === 'triplet' ? `<div class="hint" id="role${i}"></div>` : ''}<div id="dots${i}"></div></div>`;
      }
      function dotsFor(i) {
        const r = S.reagents[i]; if (!run) return '';
        const used = Object.keys(run.stocks).some(k => run.stocks[k].source_reagent === r.code && run.stocks[k].dilution_level > 0);
        if (!used) return '';
        let minT = 1e18, maxT = 0; rowsCache.forEach(row => { const v = row[i]; if (v > 0) { minT = Math.min(minT, v); maxT = Math.max(maxT, v); } });
        if (minT === 1e18) return '';
        const ideal = minT * S.vialVolume / Math.max(S.threshold, 1e-9), mv = maxT * S.vialVolume / ideal;
        return `<div class="hint">Needs hand dilutions at ${nf(r.stock, 1)} mM. A stock of ≤ <b class="mono">${nf(ideal, 1)} mM</b> would pipette the smallest amount directly, but then the largest is about <b class="mono">${nf(mv, 0)} µL</b>${mv >= 1000 ? ' (too big for one dispense)' : ''}.</div>`;
      }
      // The list of blocking issues and warnings.
      function issuesHTML() {
        if (err) return (blank || triPending) ? `<div class="hint">${esc(err)}</div>` : `<div class="issue bad"><span>${esc(err)}</span></div>`;
        if (!run) return '';
        const groups = {}; run.issues.forEach(x => { (groups[x.type] = groups[x.type] || []).push(x); });
        const names = ISSUE_NAMES;
        let h = '';
        const bad = run.issues.filter(x => x.severity === 'block').length;
        if (!run.issues.length) h = '<div class="issue ok"><span>All volumes are within limits: every transfer ≥ threshold, under 1000 µL, solvent never negative.</span></div>';
        for (const [t, list] of Object.entries(groups)) {
          const sev = list.some(x => x.severity === 'block') ? 'bad' : 'warn';
          const rowsIx = [...new Set(list.map(x => x.row).filter(x => x != null))];
          h += `<div class="issue ${sev}"><span><b>${names[t] || t}</b> (${list.length}) · ${esc(list[0].message)}${list.length > 1 ? ` <i>+${list.length - 1} more</i>` : ''}</span>${rowsIx.length ? `<button class="btn sm" data-act="showvials" data-t="${esc(t)}">Show ${rowsIx.length} vial${rowsIx.length > 1 ? 's' : ''}</button>` : ''}</div>`;
        }
        if (bad && fixes.length) h += `<div class="issue warn"><span><b>Verified fixes</b> (each one was recalculated and clears every blocking check)</span>${fixes.map((f, i) => `<button class="btn sm" data-act="fix" data-i="${i}">${esc(f.label)}</button>`).join('')}${fixes.some(f => f.kind === 'stock') ? '<span class="hint" style="flex-basis:100%">A stock change means preparing that stock at the new concentration. Check it still dissolves.</span>' : ''}</div>`;
        else if (bad && run.reactions > 1500) h += `<div class="hint">This run has more than 1,500 vials, so fixes are not searched automatically.</div>`;
        else if (bad && !fixesDone && run.reactions > FIX_AUTO_MAX) h += fixesBusy ? `<div class="hint">Searching for verified fixes… this can take a few seconds.</div>` : `<div class="issue warn"><span>This run has ${run.reactions} vials, so fixes are searched on request.</span><button class="btn sm" data-act="findfixes">Find verified fixes</button></div>`;
        else if (bad && !fixesDone) h += `<div class="hint">Looking for a verified fix…</div>`;
        else if (bad && fixesDone) h += `<div class="issue warn"><span><b>No single change fixes this</b></span></div>`;
        if (bad && fixesDone && !fixes.length && whyNot.length) h += `<div class="issue warn"><span><b>Why</b>${whyNot.map(t => `<br>${esc(t)}`).join('')}</span></div>`;
        return h;
      }
      function checkTable() {
        const cs = checks(); if (!cs.length) return '';
        return `<div class="tbl"><table><thead><tr><th>Check</th>${S.reagents.map((r, i) => `<th><span class="rdot" style="background:${rcol(i)}">${esc(r.code)}</span></th>`).join('')}<th>solvent</th></tr></thead><tbody>
 <tr><td>All volumes ≥ ${S.threshold} µL</td>${cs.map(c => `<td>${c.okMin ? '✓' : '<b style="color:var(--bad)">✗ ' + nf(c.min, 1) + '</b>'}</td>`).join('')}</tr>
 <tr><td>All volumes &lt; 1000 µL</td>${cs.map(c => `<td>${c.okMax ? '✓' : '<b style="color:var(--bad)">✗ ' + nf(c.max, 0) + '</b>'}</td>`).join('')}</tr>
 <tr><td>Solvent never negative</td>${cs.map(c => c.code === 'solvent' ? (c.neg ? `<td><b style="color:var(--bad)">✗ ${c.neg}</b></td>` : '<td>✓</td>') : '<td class="mono" style="color:var(--mut)">-</td>').join('')}</tr></tbody></table></div>`;
      }
      function setCount(set) { let t = 1, ok = true; for (const it of set.items) { if (!it.on) continue; const st = +it.step, mn = +it.min, mx = +it.max; if (!(st > 0) || mx < mn) { ok = false; break; } const k = (mx - mn) / st; if (Math.abs(k - Math.round(k)) > 1e-7) { ok = false; break; } t *= Math.round(k) + 1; } return ok && set.items.some(i => i.on) ? t : -1; }
      function setsCard() {
        const eq = S.mode === 'equivalence';
        return `<div class="card" style="margin-top:20px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px"><div><h2>Vial sets</h2><p class="sub" style="margin:0">Each set picks which reagents go in and their ranges. The vials of all sets are added together.</p></div><button class="btn" data-act="addset">Add set</button></div>
 ${S.sets.map((set, si) => `<div class="rcard" style="border-left-color:${rcol(si)}"><div class="rhead"><input type="text" data-k="sets.${si}.name" value="${esc(set.name)}" style="width:170px;height:32px;font-weight:600"><span class="chip mut" id="sc${si}"></span><span style="flex:1"></span><button class="btn sm" data-act="dupset" data-i="${si}">Duplicate</button>${S.sets.length > 1 ? `<button class="btn sm" data-act="rmset" data-i="${si}">Remove</button>` : ''}</div>
  <div class="tbl"><table><thead><tr><th>Reagent</th><th>Min</th><th>Step</th><th>Max</th><th></th></tr></thead><tbody>${S.reagents.map((r, i) => { const it = set.items[i], unit = (eq && i > 0) ? 'equiv.' : 'mM'; return `<tr><td><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" data-k="sets.${si}.items.${i}.on" ${it.on ? 'checked' : ''} style="width:18px;height:18px;accent-color:${rcol(i)}"><span class="rdot" style="background:${rcol(i)}">${esc(r.code)}</span></label></td>${['min', 'step', 'max'].map(f => `<td><input type="number" step="any" data-k="sets.${si}.items.${i}.${f}" value="${it[f]}" ${it.on ? '' : 'disabled'} style="width:84px;height:30px"></td>`).join('')}<td class="hint" style="text-align:left">${it.on ? unit : 'not in this set'}</td></tr>`; }).join('')}</tbody></table></div></div>`).join('')}
 <div class="hint">${eq ? 'Equivalence mode: the first reagent is a concentration in mM, the others are multiples of it.' : 'Concentration mode: every ticked reagent has its own range in mM.'} For a single amount, set min and max equal.</div></div>`;
      }
      function importedCard() {
        const im = S.imported; return `<div class="card" style="margin-top:20px"><h2>Imported vials</h2><p class="sub">${im.rows.length} vials rebuilt from <b>${esc(im.name)}</b>. Their concentrations are fixed; change reagents, stocks or run settings above and everything recalculates.</p>
 ${im.note ? `<div class="issue ${im.differ ? 'warn' : 'ok'}"><span>${esc(im.note)}</span></div>` : ''}
 <button class="btn" data-act="unimport">Discard imported vials and use vial sets</button></div>`;
      }
      // The Setup screen.
      function setupView() {
        const pre = [500, 800];
        return `<div class="bodyw"><div class="lcol">
 <div class="card pad"><div class="chead"><div class="ct">Run parameters</div>
  <div class="seg" role="group" aria-label="Generator mode"><button data-act="mode" data-v="concentration" class="${S.mode === 'concentration' ? 'on' : ''}">Concentration</button><button data-act="mode" data-v="equivalence" class="${S.mode === 'equivalence' ? 'on' : ''}">Equivalence</button><button data-act="mode" data-v="triplet" class="${S.mode === 'triplet' ? 'on' : ''}">Triplet plate</button></div></div>
 <div class="pgrid">
 <div class="fld" style="grid-column:span 2"><label class="lbl">Run name</label><input type="text" class="f" data-k="name" value="${esc(S.name)}"></div>
 <div class="fld"><label class="lbl">Total vol. per vial (µL)</label><div class="seg full" role="group" aria-label="Vial volume presets">${pre.map(p => `<button data-act="vv" data-v="${p}" class="${+S.vialVolume === p ? 'on' : ''}">${p}</button>`).join('')}<button data-act="vv" data-v="custom" class="${pre.includes(+S.vialVolume) ? '' : 'on'}">Custom</button></div>
  ${pre.includes(+S.vialVolume) ? '' : `<input type="number" class="f mono" data-k="vialVolume" value="${S.vialVolume}" aria-label="Vial volume" style="margin-top:6px">`}</div>
 <div class="fld"><label class="lbl">Pipetting threshold (µL)</label><input type="number" class="f mono" data-k="threshold" value="${S.threshold}"></div>
 <div class="fld"><label class="lbl">Dilution factor (N)</label><input type="number" class="f mono" data-k="dilutionFactor" value="${S.dilutionFactor}"></div>
 <div class="fld"><label class="lbl">Solvent</label><select class="f" data-k="reactionSolvent">${SOLV.map(s => `<option ${s === S.reactionSolvent ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
 <div class="fld"><label class="lbl">Leftover per stock (mL)</label><input type="number" class="f mono" step="any" data-k="leftoverMl" value="${S.leftoverMl}"></div>
 <div class="fld"><label class="lbl">Volumetric flasks (mL)</label><input type="text" class="f mono" data-k="flasksText" value="${esc(S.flasksText == null ? '2, 5, 10, 20, 50, 100' : S.flasksText)}" placeholder="2, 5, 10, 20"><div class="hint" style="margin:4px 0 0">Stocks are rounded up to the smallest flask that fits.</div></div>
 <div class="fld"><label class="lbl">Solvent is added</label><select class="f" data-k="solventAfter">${S.reagents.map((r, i) => `<option value="${i}" ${+S.solventAfter === i ? 'selected' : ''}>${i === 0 ? 'first' : 'after ' + esc(S.reagents[i - 1].code)}</option>`).join('')}<option value="${S.reagents.length}" ${+S.solventAfter >= S.reagents.length ? 'selected' : ''}>last</option></select></div>
 ${S.mode === 'triplet' ? '' : `<div class="fld"><label class="lbl">Shuffle vial order</label><select class="f" data-k="randomize"><option value="true" ${S.randomize ? 'selected' : ''}>On (random)</option><option value="false" ${S.randomize ? '' : 'selected'}>Off (generator order)</option></select></div>
 ${S.randomize ? `<div class="fld"><label class="lbl">Shuffle seed</label><input type="number" class="f mono" data-k="randomSeed" value="${S.randomSeed}"></div>` : ''}`}
 </div>
 <div class="note">${S.mode === 'triplet' ? 'Triplet plate mode: reagents are mixed in fixed ratios of a base concentration, in sections of the plate (set up below).' : S.mode === 'equivalence' ? 'Equivalence mode: the first reagent is a concentration in mM; every other reagent is set as equivalents of it.' : 'Concentration mode: every reagent has its own range in mM.'}</div></div>

 <div class="card pad" style="overflow-x:auto"><div style="min-width:860px"><div class="chead"><div class="ct">Reagents <span class="cnt">${S.reagents.length} of 12 · in order of addition</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="importlib" title="Fill the library from a CSV or Excel file">Import library</button>${S.reagents.length < 12 ? '<button class="btn" data-act="addr"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7 2v10M2 7h10"/></svg>&nbsp;Add reagent</button>' : ''}</div></div>
 <datalist id="libnames">${lib.map(x => `<option value="${esc(x.name)}">${esc(nf(x.molarMass, 3))} g/mol</option>`).join('')}</datalist>
 <div class="rw th"><div>Code</div><div>Name</div><div>Molar mass</div><div>Density</div><div>Stock (mM)</div><div>Stock solvent</div><div>Order · save</div></div>
 ${S.reagents.map(reagentRow).join('')}
 <div class="note" style="margin-top:14px">${S.mode === 'triplet' ? 'Give every reagent a code and a name (type a library name to fill molar mass and density). Additives are chosen in the plate pattern below.' : inlineRanges() ? 'Define each reagent and its range on one row. Type a name from your library to fill molar mass and density.' : 'Define each reagent once; the vial sets below say where it is used and in what range.'}</div>${inlineRanges() ? '<div style="margin-top:10px"><button class="btn sm" data-act="addset">Add a second vial set</button> <span class="hint">for vials that need different reagents or ranges</span></div>' : ''}</div></div>
 ${S.mode === 'triplet' ? `<div style="margin-top:20px">${triCards()}</div>` : S.imported ? importedCard() : inlineRanges() ? '' : setsCard()}</div>
 <div class="rcol" id="live"></div></div>`;
      }
      // Stock preparation card on Setup.
      function stockPrep() {
        if (!run) return '';
        const base = Object.entries(run.stocks).filter(([k, s]) => s.dilution_level === 0);
        const rows = [...base.map(([k, s]) => {
          const r = S.reagents.find(x => x.code === s.source_reagent) || {}; const i = S.reagents.findIndex(x => x.code === s.source_reagent);
          const sub = s.chemical_volume_ml ? `${nf(s.chemical_volume_ml, 3)} mL liquid` : 'weigh solid';
          const need = Object.values(run.stocks).filter(t => t.source_reagent === s.source_reagent && t.dilution_level > 0).map(t => `${S.dilutionFactor ** t.dilution_level}× stock`);
          return `<div class="prow"><div class="code sm" style="background:${rcol(i < 0 ? 0 : i)}">${esc(s.source_reagent)}</div><div style="flex:1;min-width:0"><div style="font-weight:500">${nf(s.prep_volume_ml, 1)} mL at ${nf(s.concentration_mM, 1)} mM · ${esc(s.flask_label || '')}</div><div class="hint" style="margin:0">${sub}${need.length ? ' · also hand-diluted to ' + need.join(', ') : ''} · ${esc(s.solvent)}</div></div><div class="mono pv">${s.mass_g != null ? nf(s.mass_g, 3) + ' g' : nf(s.prep_volume_ml, 1) + ' mL'}</div></div>`;
        }),
        ...(run.sourceOnlyStocks || []).map(s => { const i = S.reagents.findIndex(x => x.code === s.source_reagent); return `<div class="prow"><div class="code sm" style="background:${rcol(i < 0 ? 0 : i)}">${esc(s.source_reagent)}</div><div style="flex:1"><div style="font-weight:500">${nf(s.prep_volume_ml, 0)} mL source stock</div><div class="hint" style="margin:0">not on deck · for hand dilutions only</div></div></div>`; })];
        return rows.join('');
      }
      // Right-hand live panel (this run, checks, stock volumes).
      function livePanel() {
        if (S.mode === 'triplet' && !run) return triPanel();
        if (blank) return `<div class="card pad"><div class="lbl">THIS RUN</div><div class="hint" style="margin-top:8px;font-size:14px">${esc(err)}</div></div>`;
        if (err) return `<div class="card pad"><div class="issue bad"><span>${esc(err)}</span></div></div>`;
        if (!run) return '';
        const cs = checks(), minOk = cs.every(c => c.okMin), maxOk = cs.every(c => c.okMax), neg = (cs.find(c => c.code === 'solvent') || {}).neg || 0;
        const yes = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6.5l2.6 2.6L10 3.5"/></svg>', no = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>';
        const crow = (t, ok, bad) => `<div class="crow"><span>${t}</span><span class="chip ${ok ? 'ok' : 'bad'}">${ok ? yes + 'Yes' : no + bad}</span></div>`;
        return `<div class="card pad"><div class="lbl">THIS RUN</div>
 <div class="big"><b>${S.mode === 'triplet' ? triMeta.filter(m => !m.blank).length : run.reactions}</b><span>${S.mode === 'triplet' ? 'wells' : 'vials'} · ${run.plates} plate${run.plates === 1 ? '' : 's'}</span></div><div class="hr"></div>
 <div class="crows">${crow(`All volumes ≥ ${S.threshold} µL`, minOk, 'No')}${crow('All volumes under 1000 µL', maxOk, 'No')}${crow('Solvent never negative', !neg, 'No · ' + neg + ' vials')}</div>
 <div style="margin-top:14px">${issuesHTML()}${stockHints().map(x => `<div class="issue warn"><span>${esc(x)}</span></div>`).join('')}${S.mode === 'triplet' ? triWarnings().filter(x => !x.startsWith('No section')).map(x => `<div class="issue warn"><span>${esc(x)}</span></div>`).join('') : ''}</div>
 <details class="det"><summary>Check table by reagent</summary>${checkTable()}</details>
 <div class="hint" style="margin-top:12px">Stock volume = total pipetted + ${S.leftoverMl} mL leftover, rounded up to a volumetric flask. Total solvent ${nf(run.solventRecommendedMl, 1)} mL.</div></div>
 <div class="card pad"><div class="ct" style="margin-bottom:10px">Stock preparation</div><div class="plist">${stockPrep()}</div></div>
 <div class="btns"><button class="btn lg" data-act="save" ${err ? 'disabled' : ''}>Save draft</button><button class="btn lg pri" data-act="tab" data-v="combos">Review combinations<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg></button></div>`;
      }
      function paintLive() {
        const l = $('#live'); if (l) l.innerHTML = livePanel();
        S.reagents.forEach((r, i) => { const d = $('#dots' + i); if (d) d.innerHTML = dotsFor(i); });
        S.sets.forEach((set, si) => { const c = $('#sc' + si); if (c) { const n = setCount(set); c.textContent = n < 0 ? 'check ranges' : n + ' vial' + (n === 1 ? '' : 's'); } });
        if (inlineRanges()) S.reagents.forEach((r, i) => { const p = $('#rp' + i); if (!p) return; const it = S.sets[0].items[i]; p.className = 'rp'; if ([it.min, it.step, it.max].some(v => v === '' || v == null)) { p.textContent = ''; return; } try { const a = C.axisValues(it.min, it.step, it.max, r.code); p.textContent = a.length + ' value' + (a.length === 1 ? '' : 's') + ': ' + a.slice(0, 6).map(v => nf(v, 3)).join(', ') + (a.length > 6 ? ' … ' + nf(a[a.length - 1], 3) : ''); } catch (e) { p.className = 'rp e'; p.textContent = e.message.replace(/^[^:]*: /, ''); } });
        if (S.mode === 'triplet') S.reagents.forEach((r, i) => { const d = $('#role' + i); if (!d) return; const ai = S.tri.adds.findIndex(a => a.code === r.code), gs = S.tri.groups.filter(g => g.members.includes(r.code)).map(g => g.name); d.textContent = ai >= 0 ? 'Additive · ' + nf(S.tri.adds[ai].equiv, 3) + ' eq' : gs.length ? 'In ' + gs.join(', ') : 'Not used yet'; });
        const st = $('#strip'); if (st) st.outerHTML = strip();
        const sn = $('#stepsnav'); if (sn) sn.outerHTML = stepsHTML();
        markInvalid();
      }
      // The Combinations table.
      function comboView() {
        if (!run) return `<div class="card">${issuesHTML()}</div>`;
        const tri = S.mode === 'triplet', bs = blockSet(); const rows = run.rows.map((r, i) => ({ r, i, bad: bs.has(i) })).filter(x => !(tri && triMeta[x.i] && triMeta[x.i].blank));
        const list = vialFocus ? rows.filter(x => vialFocus.rows.has(x.i)) : filterBad ? rows.filter(x => x.bad) : rows; const PS = 50, pages = Math.max(1, Math.ceil(list.length / PS)); page = Math.min(page, pages - 1);
        const slice = list.slice(page * PS, page * PS + PS); const badN = rows.filter(x => x.bad).length;
        const multi = !tri && S.sets.length > 1, showCol = S.reagents.map((r, i) => !tri || rows.some(x => x.r.recipe[i] && x.r.recipe[i].target_concentration > 0));
        const head = `<tr><th>#</th><th>Vial</th>${tri ? '<th>Group</th><th>Condition</th>' : ''}${multi ? '<th>Set</th>' : ''}${S.reagents.map((r, i) => !showCol[i] ? '' : `<th><span class="rdot" style="background:${rcol(i)}">${esc(r.code)}</span> mM</th>`).join('')}<th>solvent µL</th></tr>`;
        const body = slice.map(({ r, i, bad }) => `<tr class="hov ${bad ? 'badrow' : ''}" data-row="${i}"><td>${r.global_index + 1}</td><td>p${r.plate_number}·${r.container_id}</td>${tri ? `<td>${esc((triMeta[i] || {}).group || '')}</td><td class="mono">${esc((triMeta[i] || {}).cond || '')}</td>` : ''}${multi ? `<td><span class="chip mut" style="border-left:4px solid ${rcol(setOf[r.combo_index] || 0)}">${esc((S.sets[setOf[r.combo_index]] || {}).name || '')}</span></td>` : ''}${r.recipe.map((rc, ci) => !showCol[ci] ? '' : `<td>${nf(rc.target_concentration, 3)}${rc.dilution_level ? `<span class="tag">${S.dilutionFactor ** rc.dilution_level}×</span>` : ''}</td>`).join('')}<td>${nf(r['vol#solvent'], 1)}</td></tr>`).join('');
        const bars = S.reagents.map((r, i) => {
          const keys = Object.keys(run.stocks).filter(k => run.stocks[k].source_reagent === r.code); const tot = keys.reduce((a, k) => a + run.stocks[k].consumption_uL, 0) || 1;
          return `<div><span class="rdot" style="background:${rcol(i)}">${esc(r.code)}</span><div class="b">${keys.map(k => { const s = run.stocks[k]; return `<i title="${esc(k)}" style="width:${100 * s.consumption_uL / tot}%;background:${rcol(i)};opacity:${1 - 0.28 * s.dilution_level}"></i>` }).join('')}</div><span class="mono">${keys.map(k => esc(run.stocks[k].dilution_label === 'Direct' ? 'direct' : run.stocks[k].dilution_label)).join(' · ')}</span></div>`;
        }).join('');
        return `<div class="grid two"><div class="card" style="min-width:0"><h2>Combinations</h2><p class="sub">${list.length} shown of ${rows.length}. Hover a row for its recipe. Tags show which diluted stock is used.</p>
 ${vialFocus ? `<div class="focuschip"><span class="chip warn">Showing ${vialFocus.rows.size} vial${vialFocus.rows.size === 1 ? '' : 's'}: ${esc(vialFocus.label)}</span><button class="btn sm" data-act="clearfocus">Show all</button></div>` : ''}
 <div class="tbl" style="max-height:620px"><table><thead>${head}</thead><tbody>${body || '<tr><td colspan="9" class="empty-note">Nothing to show.</td></tr>'}</tbody></table></div>
 <div class="pager"><button class="btn sm" data-act="pg" data-v="-1" ${page <= 0 ? 'disabled' : ''}>Prev</button><span class="mono">${page + 1} / ${pages}</span><button class="btn sm" data-act="pg" data-v="1" ${page >= pages - 1 ? 'disabled' : ''}>Next</button></div></div>
 <div style="min-width:0"><div class="card" style="margin-bottom:20px"><h2>Which stock each reagent uses</h2><p class="sub">Share of total volume pipetted. Lighter = more diluted.</p><div class="bars">${bars}</div></div>
 <div class="card"><h2>Needs attention</h2><p class="sub">${badN ? badN + ' vial' + (badN === 1 ? ' has' : 's have') + ' a blocking issue (marked in red).' : 'Nothing to fix.'}</p>${issuesHTML()}${badN ? `<button class="btn sm" data-act="fbad">${filterBad ? 'Show all rows' : 'Show only vials with blocking issues'}</button>` : ''}</div></div></div>`;
      }
      function wellHTML(stock, color) {
        if (!stock) return '<div class="well e"></div>';
        const pct = Math.min(100, 100 * stock.ml / 20);
        return `<div class="well" data-stock="${esc(stock.key)}" style="background:var(--fill);border:3px solid ${color}"><div class="bar" style="height:${pct}%"></div><span>${esc(stock.key.replace('_N2', '×' + +(S.dilutionFactor ** 2).toPrecision(4)).replace('_N', '×' + +(+S.dilutionFactor).toPrecision(4)))}</span></div>`;
      }
      // The Deck screen (bottle plates, vial plates, plate numbers).
      function deckView() {
        function deckPlatesHTML() { const d = run.deck; const ids = [...new Set([...d.plates, d.solvent_plate])].sort(); return ids.map(p => d.solvent_kind === 'jar' && p === d.solvent_plate ? jar : bottle(p, p === d.solvent_plate)).join(''); }
        if (!run) return `<div class="card">${issuesHTML()}</div>`;
        const left = S.hood === 'left', pl = run.deck.plates;
        const byPos = {}; Object.entries(run.stocks).forEach(([k, s]) => { byPos[s.breadboard_plate_id + ':' + s.container_id] = { key: k, ml: s.recommended_volume_ml, color: codeColor(s.source_reagent) }; });
        const bottle = (pn, solv) => {
          let w = ''; for (let c = 0; c < 8; c++) { if (solv && c === run.deck.solvent_container) w += `<div class="well" data-stock="solvent" style="background:var(--fill);border:3px solid var(--fg2)"><div class="bar" style="height:${Math.min(100, 100 * run.solventRecommendedMl / 20)}%"></div><span>solv</span></div>`; else w += wellHTML(byPos[pn + ':' + c], byPos[pn + ':' + c] && byPos[pn + ':' + c].color); }
          return `<div class="plate"><div class="pt">plate${pn} · Bottle 20 mL (2×4)</div><div class="wells8">${w}</div></div>`;
        };
        const jar = `<div class="plate"><div class="pt">plate${run.deck.solvent_plate} · Jar 100 mL (1×2)</div><div class="wells8" style="grid-template-columns:repeat(2,1fr)"><div class="well" data-stock="solvent" style="background:var(--fill);border:3px solid var(--fg2)"><div class="bar" style="height:${Math.min(100, 100 * run.solventRecommendedMl / 100)}%"></div><span>solvent</span></div><div class="well e"></div></div></div>`;
        const vplates = [0, 1, 2].map(p => {
          const used = p < run.plates;
          if (!used) return `<div class="plate off"><div class="pt">plate${p} · 54-vial plate (not needed)</div><div class="wells54">${'<div class="v54 x"></div>'.repeat(54)}</div></div>`;
          const n = Math.min(54, run.reactions - p * 54), tri = S.mode === 'triplet'; let w = '', used54 = 0;
          for (let k = 0; k < 54; k++) { const ri = p * 54 + k, blankW = k < n && tri && triMeta[ri] && triMeta[ri].blank, on = k < n && !blankW; if (on) used54++; const bad = on && blockSet().has(ri); w += `<div class="v54 ${on ? (bad ? 'b' : 'u') : 'x'}" ${on ? `data-row="${ri}"` : ''} ${on && !bad && !tri && S.sets.length > 1 ? `style="border-color:${rcol(setOf[run.rows[ri].combo_index] || 0)};border-width:3px"` : ''}></div>`; }
          return `<div class="plate"><div class="pt">plate${p} · ${used54} of 54 vials used (filled by the robot)</div><div class="wells54">${w}</div></div>`;
        }).join('');
        const loads = Object.entries(run.stocks).map(([k, s]) => {
          const c = codeColor(s.source_reagent); let prep = '';
          if (s.dilution_level === 0) prep = s.mass_g != null ? `Prepare ${nf(s.prep_volume_ml, 1)} mL (${s.flask_label}): weigh ${nf(s.mass_g * 1000, 1)} mg${s.chemical_volume_ml ? ` (or ${nf(s.chemical_volume_ml * 1000, 0)} µL liquid)` : ''} in ${esc(s.solvent)}` : `Prepare ${nf(s.prep_volume_ml, 1)} mL (${s.flask_label}) at ${nf(s.concentration_mM, 1)} mM in ${esc(s.solvent)}`;
          else prep = `Dilute by hand: ${nf(s.base_stock_volume_ml, 2)} mL of ${esc(s.source_reagent)} stock + ${nf(s.diluent_volume_ml, 2)} mL ${esc(s.solvent)} → ${nf(s.concentration_mM, 1)} mM`;
          return `<div><span class="rdot" style="background:${c};min-width:46px">${esc(k)}</span><span class="mono" style="min-width:110px">plate${s.breadboard_plate_id} · pos ${s.container_id}</span><b class="mono" style="min-width:80px">${nf(s.prep_volume_ml, 0)} mL</b><span style="flex:1 1 260px;color:var(--fg2);min-width:0">${prep}</span></div>`;
        }).join('');
        const src = (run.sourceOnlyStocks || []).map(s => `<div><span class="rdot" style="background:${codeColor(s.source_reagent)};min-width:46px">${esc(s.substance)}</span><span class="mono" style="min-width:110px">not on deck</span><b class="mono" style="min-width:80px">${nf(s.prep_volume_ml, 0)} mL</b><span style="flex:1 1 260px;color:var(--fg2)">Source stock for hand dilutions only</span></div>`).join('');
        return `<div class="card" style="margin-bottom:20px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><h2>Deck · ${left ? 'Left' : 'Right'} hood</h2><p class="sub" style="margin:0">Positions are assigned automatically. Bars show how full each bottle will be (of 20 mL).</p></div>
 <div class="seg" role="group" aria-label="Hood"><button data-act="hood" data-v="left" class="${left ? 'on' : ''}">Left hood</button><button data-act="hood" data-v="right" class="${left ? '' : 'on'}">Right hood</button></div></div>
 ${run.deck.positions_fit ? '' : `<div class="issue bad" style="margin-top:12px"><span>${esc(run.deck.positions_message)}</span></div>`}
 <div class="hood" style="margin-top:16px"><div class="plates">${deckPlatesHTML()}</div></div>
 <div class="plates">${vplates}</div>
 ${run.plates > 3 ? `<div class="hint">This run needs ${run.plates} plates; the deck holds 3 at once, so load the next plates after the first batch finishes.</div>` : ''}</div>
 <div class="card" style="margin-bottom:20px"><h2>Plate numbers</h2><p class="sub">Which deck plates hold the stocks and the solvent. Change these if your deck differs; the Excel follows.</p>
 ${plateConfirmHTML()}
 <div class="row"><div class="fld"><label class="lbl">Solvent container</label><select data-dp="solventKind"><option value="jar" ${run.deck.solvent_kind === 'jar' ? 'selected' : ''}>Jar 100 mL</option><option value="bottle" ${run.deck.solvent_kind === 'bottle' ? 'selected' : ''}>Bottle 20 mL</option></select></div>
 <div class="fld"><label class="lbl">Solvent plate</label><select data-dp="solventPlate">${[3, 4, 5, 6, 7].map(p => `<option ${p === run.deck.solvent_plate ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
 <div class="fld"><label class="lbl">Solvent position</label><select data-dp="solventPos">${[0, 1, 2, 3, 4, 5, 6, 7].map(p => `<option ${p === run.deck.solvent_container ? 'selected' : ''}>${p}</option>`).join('')}</select></div></div>
 <div style="margin-top:12px"><span class="lbl">Bottle plates for stocks (filled in this order)</span><div class="seg" role="group" aria-label="Stock plates">${[3, 4, 5, 6].map(p => `<button data-act="sp" data-v="${p}" class="${run.deck.plates.includes(p) ? 'on' : ''}">plate${p}</button>`).join('')}</div></div></div>
 <div class="grid eq"><div class="card" style="min-width:0"><h2>Load list</h2><p class="sub">What goes where, and how to prepare it. Volume is rounded up to a volumetric flask and includes ${S.leftoverMl} mL leftover.</p><div class="list">
 <div><span class="rdot" style="background:var(--fg2);min-width:46px">solv</span><span class="mono" style="min-width:110px">${esc(run.deck.solvent_location)}</span><b class="mono" style="min-width:80px">${nf(run.solventRecommendedMl, 1)} mL</b><span style="flex:1 1 260px;color:var(--fg2)">${esc(S.reactionSolvent)}</span></div>${loads}${src}</div></div>
 <div class="card" style="min-width:0">${tipsCard()}</div></div>`;
      }
      // Tip counts and options.
      function tipsCard() {
        if (!run) return ''; const t = run.tipCounts;
        const rows = [50, 300, 1000].map(s => `<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;padding:8px 0;border-top:1px solid var(--line2)"><span>${s} µL tips</span><span><b class="mono" style="font-size:18px">${t[s]}</b> <span class="hint">${t.racks[s]} rack${t.racks[s] === 1 ? '' : 's'} of 96</span></span></div>`).join('');
        return `<h2>Tips to load</h2><p class="sub">Count how many you need, then refill racks before you start.</p>${rows}
 <label class="chk"><input type="checkbox" data-k="stockVolumeCheck" ${S.stockVolumeCheck ? 'checked' : ''}> Check stock volumes (one 300 µL tip per stock${t.stockCheck ? `, ${t.stockCheckTips} here` : ''})</label>
 <label class="chk"><input type="checkbox" data-k="newTipEveryTransfer" ${S.newTipEveryTransfer ? 'checked' : ''}> New tip after every pipetting</label>
 <div class="hint">A new tip is taken only when the tip size or the substance changes, unless the box above is ticked.</div>`;
      }
      /* reagents that appear as substrates in the description sheet */
      function descReagents() { const add = S.mode === 'triplet' ? S.tri.adds.map(a => a.code) : [], used = S.mode === 'triplet' ? triUsedCodes() : null; return S.reagents.map((r, i) => ({ r, i })).filter(({ r }) => !add.includes(r.code) && (used ? used.has(r.code) : (r.name || r.stock !== ''))); }
      let descOpen = false;
      document.addEventListener('toggle', e => { if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-desc')) descOpen = e.target.open; }, true);
      // Optional description-sheet details.
      function descCard() {
        const L = descReagents(), miss = L.filter(x => !x.r.smiles).length, pr = S.product || {};
        const rows = L.map(({ r, i }) => `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--line)"><div style="display:flex;gap:8px;align-items:center;flex:1 1 100%;min-width:0"><span class="rdot" style="background:${rcol(i)}">${esc(r.code)}</span><b style="overflow-wrap:anywhere">${esc(r.name || 'no name yet')}</b></div><input type="text" class="f" style="flex:1 1 150px;min-width:0" data-k="reagents.${i}.iupac" value="${esc(r.iupac || '')}" placeholder="IUPAC name (optional)" aria-label="${esc(r.code)} IUPAC name"><input type="text" class="f mono" style="flex:2 1 200px;min-width:0" data-k="reagents.${i}.smiles" value="${esc(r.smiles || '')}" placeholder="SMILES" aria-label="${esc(r.code)} SMILES"></div>`).join('');
        return `<details class="card" ${descOpen ? 'open' : ''} data-desc><summary style="cursor:pointer;list-style:none"><h2 style="display:inline">Description sheet details</h2> <span class="chip mut">optional</span></summary><p class="sub" style="margin-top:8px">Everything here is optional. The description sheet already lists each vial's substrates by name and code. Add IUPAC names, SMILES or a product only if you want them in the file; empty cells stay empty. ${L.length ? `${L.length - miss} of ${L.length} SMILES filled.` : ''} The reagent library can store them too (smiles column).</p>
 ${rows}
 <div class="lbl" style="margin:14px 0 6px">Product (same for every vial, optional)</div>
 <div class="pgrid"><div class="fld"><label class="lbl">Product name</label><input type="text" class="f" data-k="product.name" value="${esc(pr.name || '')}"></div><div class="fld"><label class="lbl">Product code</label><input type="text" class="f" data-k="product.code" value="${esc(pr.code || '')}"></div><div class="fld"><label class="lbl">Product SMILES</label><input type="text" class="f mono" data-k="product.smiles" value="${esc(pr.smiles || '')}"></div></div></details>`;
      }
      // The Export screen: the file list (edit the list near the top to add or rename export files).
      function exportView() {
        const blocked = !run || run.blockingIssues > 0;
        const files = [['xlsx', 'robowski_run.xlsx', 'The input workbook for the robot: reactions_with_run_info and stock_solutions sheets, plus reference sheets.'], ['bench', 'bench_sheet.html', 'One printable page for the hood: how to prepare each stock, where everything goes on the deck, tips to load, with tick boxes and room for notes.'], ['stock', 'stock_preparation.csv', 'Stock preparation list with plain instructions (weigh X g, or take X mL and add Y mL), volumes and tick boxes. Opens in Excel.'], ['load', 'deck_load_checklist.csv', 'Deck loading checklist in the order you walk the deck: bottles, solvent, vial plates, tip racks.'], ['nb', 'notebook_card.png', 'The notebook card: conditions, reagents and stock volumes on one image, for the notebook or a slide.'], ['zip', 'robowski_package.zip', 'Everything above in one zip, plus the plate-layout picture and a manifest.']];
        return `<div class="grid two"><div class="card" style="min-width:0"><h2>Export</h2><p class="sub">Files are generated here. Nothing is sent to the robot. Use Preview to inspect a file before downloading.</p>
 ${blocked ? `<div class="issue bad"><span>${err ? esc(err) : `${run.blockingIssues} blocking issue${run.blockingIssues > 1 ? 's' : ''} to fix before export.`}</span><button class="btn sm" data-act="tab" data-v="setup">Open setup</button></div>` : ''}
 ${blocked ? '' : readyCard()}
 <div class="list">${files.map(f => `<div><b class="mono" style="min-width:190px">${f[1]}</b><span style="flex:1 1 240px;color:var(--fg2)">${f[2]}</span><div style="display:flex;gap:6px"><button class="btn sm" data-act="preview" data-v="${f[0]}" ${blocked ? 'disabled' : ''}>Preview</button><button class="btn sm pri" data-act="dl" data-v="${f[0]}" ${blocked ? 'disabled' : ''}>Save</button></div></div>`).join('')}</div></div>
 <div style="min-width:0">${blocked ? '' : nbCard()}<div style="margin-bottom:20px">${descCard()}</div><div class="card" style="margin-bottom:20px">${tipsCard()}</div><div class="card"><h2>Save this run</h2><p class="sub">Keeps the settings, deck and tips as a card in the run library (${storeMode}).</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" data-act="save" ${err ? 'disabled' : ''}>Save run</button><button class="btn" data-act="saveas" ${err ? 'disabled' : ''}>Save as new</button></div></div></div></div>`;
      }
      // Backup / restore card on the Runs page.
      function backupCard() {
        const last = +ls.get('rs.lastBackup') || 0, days = last ? Math.floor((Date.now() - last) / 864e5) : null, stale = (runsList.length || lib.length) && (days === null || days >= 14);
        const when = days === null ? 'No backup made yet.' : days === 0 ? 'Last backup: today.' : `Last backup: ${days} day${days > 1 ? 's' : ''} ago.`;
        return `<div class="card pad" style="margin-bottom:20px"><div class="ct">Backup</div><div class="psub" style="margin-bottom:8px">One file with all runs and the reagent library. Keep a copy in your lab folder or drive; runs kept only in a browser can be lost.</div>${stale ? `<div class="issue warn" style="margin-bottom:10px"><span>${days === null ? 'Nothing is backed up yet.' : 'The last backup is ' + days + ' days old.'}</span></div>` : ''}<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm pri" data-act="backup" ${runsList.length || lib.length ? '' : 'disabled'}>Back up everything</button><button class="btn sm" data-act="restore">Restore from backup</button></div><div class="hint" style="margin-top:8px">${when} Restoring adds missing runs and keeps the newer copy of any run in both.</div></div>`;
      }
      // Notebook card on the Export screen.
      function nbCard() {
        return `<div class="card" style="margin-bottom:20px"><h2>Notebook card</h2><p class="sub">A one-page summary of the run for the lab notebook or a slide: conditions, reagents, stocks.</p><div data-act="nbpng" role="button" tabindex="0" aria-label="Open the notebook card preview" title="Click to enlarge" style="cursor:zoom-in;overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:#fff;margin-bottom:12px"><div style="min-width:560px;pointer-events:none">${C.notebookCardSvg(run).replace(/width="\d+" height="\d+" viewBox/, 'width="100%" viewBox')}</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" data-act="nbpng">Preview and save image</button><button class="btn" data-act="nbcopy">Copy as text</button></div></div>`;
      }
      const sumCache = new Map();
      // Condition lines on each saved-run card (computed once, then cached).
      function summaryLines(r) {
        if (Array.isArray(r.summary)) return r.summary;
        const key = r.id + ':' + r.updated; if (sumCache.has(key)) return sumCache.get(key);
        let lines = []; if ((r.reactions || 0) <= 300) { try { lines = C.notebookSummary(C.buildRun(dataFor(r.state))).reagents.map(x => ({ code: x.code, text: (x.name && x.name !== x.code ? x.name + ': ' : '') + x.use })); } catch (e) { lines = []; } }
        sumCache.set(key, lines); return lines;
      }
function pageHead(t,s,r){return `<div class="phead"><div><div class="ptl">${t}</div><div class="psub">${s}</div></div>${r?`<div class="pr">${r}</div>`:''}</div>`;}
function runsView(){
 const cardHTML=r=>`<div class="card" style="display:flex;flex-direction:column;gap:14px;padding:16px">  <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><b style="font-size:15px;min-width:0;overflow-wrap:anywhere">${esc(r.name)}</b><span class="chip ${r.status==='exported'?'ok':'mut'}">${esc(r.status||'draft')}</span></div>
  <div class="hint" style="margin:0">${esc(r.mode)} · ${esc(r.hood)} hood · ${new Date(r.updated||0).toLocaleDateString()}</div>
  <div style="display:flex;flex-direction:column;gap:4px;font-size:13px">${(()=>{const L=summaryLines(r).filter(x=>x.text.indexOf('not used')<0);return L.length?L.slice(0,6).map(x=>{const i=(r.codes||[]).indexOf(x.code);return `<div style="display:flex;gap:8px;align-items:baseline;min-width:0"><span class="rdot" style="background:${(r.colors||[])[i]||'#777'};flex:none">${esc(x.code)}</span><span style="min-width:0;overflow-wrap:anywhere">${esc(x.text)}</span></div>`}).join('')+(L.length>6?`<div class="hint" style="margin:0">+ ${L.length-6} more</div>`:''):`<div style="display:flex;gap:6px;flex-wrap:wrap">${(r.codes||[]).map((c,i)=>`<span class="rdot" style="background:${(r.colors||[])[i]||'#777'}">${esc(c)}</span>`).join('')}</div>`})()}</div>
  <div style="font-size:13px"><b class="mono">${r.reactions}</b> combinations · <b class="mono">${r.plates}</b> plate${r.plates===1?'':'s'}<br><span class="hint">Tips 50/300/1000: <span class="mono">${esc(r.tips)}</span></span></div>
  <div style="display:flex;flex-direction:column;gap:6px;margin-top:auto"><div style="display:flex;gap:6px"><button class="btn sm" style="flex:1" data-act="open" data-id="${esc(r.id)}">Open</button><button class="btn sm" style="flex:1" data-act="dup" data-id="${esc(r.id)}">Duplicate</button><button class="btn sm" data-act="del" data-id="${esc(r.id)}" aria-label="Delete run">✕</button></div><button class="btn sm" data-act="card" data-id="${esc(r.id)}">Notebook card (PNG)</button></div></div>`;
 const libH=lib.map(x=>`<div><div style="flex:1;min-width:0"><b>${esc(x.name)}</b><div class="hint mono" style="margin:0">${nf(x.molarMass,3)} g/mol · ${x.density?x.density+' g/mL':'solid'}</div></div><button class="btn sm" data-act="dellib" data-id="${esc(x.id)}" aria-label="Delete ${esc(x.name)}">✕</button></div>`).join('');
 const shown=runsList.filter(r=>runFilter==='all'||(runFilter==='exported'?r.status==='exported':r.status!=='exported'));
 return `<div class="bodyw" style="padding-left:0;padding-right:0"><div class="lcol" style="gap:20px">${pageHead('Runs','Every run is saved with its deck, plates and tips (in '+storeMode+'). Open one to edit it, or duplicate it as a starting point.',`<div class="seg" role="group" aria-label="Filter runs">${['all','draft','exported'].map(f=>`<button data-act="rf" data-v="${f}" class="${runFilter===f?'on':''}">${f==='all'?'All':f==='draft'?'Drafts':'Exported'}</button>`).join('')}</div><button class="btn" data-act="importrobot">Open robot .xlsx</button><button class="btn" data-act="import">Import generator .xlsx</button><button class="btn pri" data-act="new">New run</button>`)}
 ${shown.length?`<div class="runs">${shown.map(r=>cardHTML(r)).join('')}</div>`:'<div class="card empty-note">No saved runs here yet. Set one up and press Save run on the Export step.</div>'}</div>
 <div class="rcol">${backupCard()}<div class="card pad"><div class="ct">Reagent library</div><div class="psub" style="margin-bottom:8px">Saved once. Type a name on the Setup screen and it fills molar mass and density.</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"><button class="btn sm pri" data-act="importlib">Import CSV / Excel</button><button class="btn sm" data-act="libtpl">Template</button><button class="btn sm" data-act="libexp" ${lib.length ? '' : 'disabled'}>Export</button></div><div class="list">${libH||'<div class="empty-note">Empty.</div>'}</div>
 <h3>Add</h3><div class="row"><div class="fld" style="grid-column:span 2"><label class="lbl">Name</label><input type="text" class="f" id="ln"></div><div class="fld"><label class="lbl">g/mol</label><input type="number" class="f mono" step="any" id="lm"></div><div class="fld"><label class="lbl">g/mL (liquid)</label><input type="number" class="f mono" step="any" id="ld"></div></div><button class="btn sm" style="margin-top:10px" data-act="addlib">Add to library</button></div></div></div>`;
}


      /* ---------- render ---------- */
      // The step tabs. render(): redraws the whole page from the state (called after most actions).
      const TABS = [['setup', 'Setup'], ['combos', 'Combinations'], ['deck', 'Deck'], ['export', 'Export'], ['runs', 'Runs']];
      function render() {
        visited[view] = 1;
        const top = `<div class="top"><div class="topin"><h1 style="margin:0;font:inherit;display:contents"><button class="logo" data-act="tab" data-v="setup" title="Back to the run"><svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="9" fill="#15211E"/><g fill="#7FD1C2"><circle cx="10" cy="10" r="2.6"/><circle cx="17" cy="10" r="2.6"/><circle cx="24" cy="10" r="2.6"/><circle cx="10" cy="17" r="2.6"/><circle cx="24" cy="17" r="2.6"/><circle cx="10" cy="24" r="2.6"/><circle cx="17" cy="24" r="2.6"/><circle cx="24" cy="24" r="2.6"/></g><circle cx="17" cy="17" r="3.4" fill="#FFC857"/></svg>Robowski Studio</button></h1>
 <div class="seg" role="group" aria-label="Active hood">${['left', 'right'].map(h => `<button data-act="hood" data-v="${h}" class="${S.hood === h ? 'on' : ''}"><span class="hdot" style="background:${S.hood === h ? '#1F9D6B' : '#AEB5AC'}"></span>${h === 'left' ? 'Left' : 'Right'} hood</button>`).join('')}</div>
 <div class="topr"><button class="runsl ${view === 'runs' ? 'on' : ''}" data-act="tab" data-v="runs">Runs &amp; library</button><div class="rname"><div>${esc(S.name)}</div><div class="hint" style="margin:0">${S.id ? 'Saved run' : 'Draft'} · ${storeMode}</div></div><button class="avatar" data-act="theme" aria-label="Toggle dark mode" title="Light / dark"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 2a7 7 0 0 1 0 14z" fill="currentColor"/></svg></button></div></div>
 ${view === 'runs' ? '' : `<div class="stepsbar">${stepsHTML()}</div>`}</div>`;
        let body;
        if (view === 'runs') body = `<div class="wrap">${runsView()}</div>`;
        else body = strip() + `<div class="${view === 'setup' ? '' : 'wrap'}">${({ setup: setupView, combos: comboView, deck: deckView, export: exportView }[view])()}</div>`;
        $('#app').innerHTML = top + '<main id="main">' + body + '</main>' + '<div class="tip" id="tip"></div><input type="file" id="file" accept=".xlsx" hidden><input type="file" id="file2" accept=".xlsx" hidden><input type="file" id="file4" accept=".json,application/json" hidden><input type="file" id="file3" accept=".csv,.tsv,.txt,.xlsx" hidden>';
        let lid = 0; document.querySelectorAll('#app .fld').forEach(f => { const l = f.querySelector('label.lbl:not([for])'), c = f.querySelector('input:not([type=hidden]),select,textarea'); if (l && c) { if (!c.id) c.id = 'f' + (++lid); l.htmlFor = c.id; } });
        if (view === 'setup') paintLive();
      }

