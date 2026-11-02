      // ENGINE 45 - bench-ready outputs: stock preparation steps, deck loading list, printable bench sheet.
      // stockSteps()/deckSteps() build the plain-language steps once; the CSVs and the HTML sheet both use them.
      // Edit here to: reword instructions ("Weigh ..."), reorder columns, or change the printable page (benchSheetParts has its CSS).
      // ------------------------------------------------------------
      /* ---- bench-ready sheets: stock preparation, deck loading, printable page ---- */
      // Rounds a number for display (4 significant digits).
      function benchNum(x, d = 4) { return x == null || x === '' || !isFinite(+x) ? '' : +(+x).toPrecision(d); }
      // One step per stock: how to prepare it (weigh, or take X mL + add Y mL), volumes, where it goes.
      function stockSteps(run) {
        const N = run.dilutionFactor, nameOf = {}; run.reagents.forEach(r => nameOf[r.code] = r.name || r.code);
        const list = Object.entries(run.stocks).map(([key, s]) => ({ key, s, onDeck: true })).concat((run.sourceOnlyStocks || []).map(s => ({ key: s.substance, s, onDeck: false })));
        list.sort((a, b) => (a.s.dilution_level || 0) - (b.s.dilution_level || 0));
        return list.map(({ key, s, onDeck }, i) => {
          const lvl = s.dilution_level || 0, rname = nameOf[s.source_reagent] || s.source_reagent, parent = lvl === 1 ? s.source_reagent : key.replace(/_N2$/, '_N');
          const flask = s.flask_label || '', conc = benchNum(s.concentration_mM);
          let how;
          if (lvl > 0) how = `Take ${benchNum(s.base_stock_volume_ml)} mL of stock ${parent} and add ${benchNum(s.diluent_volume_ml)} mL ${s.solvent} (1:${benchNum(N ** lvl)} dilution, ${flask}).`;
          else if (s.mass_g != null) how = `Weigh ${benchNum(s.mass_g)} g of ${rname}${s.chemical_volume_ml != null ? ' (about ' + benchNum(s.chemical_volume_ml, 3) + ' mL as a liquid)' : ''}, dissolve in ${s.solvent} and fill to the mark (${flask}).`;
          else how = `Prepare ${conc} mM ${rname} in ${s.solvent}, ${benchNum(s.prep_volume_ml)} mL (${flask}). Molar mass is missing, so the mass was not calculated.`;
          const need = benchNum(s.required_mL), place = onDeck ? `plate ${s.breadboard_plate_id}, position ${s.container_id}` : 'not on the robot deck (only used to make dilutions)';
          return { n: i + 1, key, reagent: rname, conc, how, prepare: benchNum(s.prep_volume_ml), need, left: benchNum(s.leftover_mL), place, onDeck, solvent: s.solvent };
        });
      }
      // What to put where on the deck: solvent, bottles, vial plates, tip racks.
      function deckSteps(run) {
        const out = [], onDeck = Object.entries(run.stocks).map(([k, s]) => ({ k, s })).sort((a, b) => a.s.breadboard_plate_id - b.s.breadboard_plate_id || a.s.container_id - b.s.container_id);
        const nameOf = {}; run.reagents.forEach(r => nameOf[r.code] = r.name || r.code);
        out.push({ where: `plate ${run.deck.solvent_plate}, position ${run.deck.solvent_container}`, item: `Reaction solvent: ${run.reactionSolvent}`, container: run.deck.solvent_kind === 'jar' ? 'jar (100 mL)' : 'bottle (20 mL)', fill: `at least ${benchNum(run.solventRecommendedMl)} mL` });
        for (const { k, s } of onDeck) out.push({ where: `plate ${s.breadboard_plate_id}, position ${s.container_id}`, item: `Stock ${k}: ${nameOf[s.source_reagent] || s.source_reagent}, ${benchNum(s.concentration_mM)} mM`, container: 'bottle (20 mL)', fill: `${benchNum(s.prep_volume_ml)} mL prepared (robot uses ${benchNum(s.required_mL)} mL)` });
        const tc = run.tipCounts || {};
        for (let p = 0; p < run.plates; p++) { const used = Math.min(54, Math.max(0, run.reactions - p * 54)); out.push({ where: `reaction plate ${p}`, item: `54-vial plate, ${used} vial${used === 1 ? '' : 's'} used`, container: 'empty vials in place', fill: 'robot fills them' }); }
        for (const sz of ['50', '300', '1000']) if (tc[sz] > 0) out.push({ where: 'tip racks', item: `${sz} µL tips`, container: `${tc.racks ? tc.racks[sz] : Math.ceil(tc[sz] / 96)} full rack(s) of 96`, fill: `${tc[sz]} tips needed` });
        return out;
      }
      // stock_preparation.csv from stockSteps().
      function stockCsv(run) {
        const rows = [['done', 'step', 'stock', 'reagent', 'concentration_mM', 'how_to_prepare', 'volume_to_prepare_mL', 'robot_uses_mL', 'left_over_mL', 'put_it_at']];
        for (const x of stockSteps(run)) rows.push(['☐', x.n, x.key, x.reagent, x.conc, x.how, x.prepare, x.need, x.left, x.place]);
        rows.push(['☐', '', 'solvent', run.reactionSolvent, '', `Fill the ${run.deck.solvent_kind === 'jar' ? 'jar' : 'bottle'} with at least ${benchNum(run.solventRecommendedMl)} mL of ${run.reactionSolvent}.`, '', benchNum(run.solventConsumptionMl), '', `plate ${run.deck.solvent_plate}, position ${run.deck.solvent_container}`]);
        return csvText(rows);
      }
      // deck_load_checklist.csv from deckSteps().
      function loadCsv(run) {
        const rows = [['done', 'where', 'what', 'container', 'fill']];
        for (const x of deckSteps(run)) rows.push(['☐', x.where, x.item, x.container, x.fill]);
        return csvText(rows);
      }
      // ---- TLC lane map ------------------------------------------------------------------
      // The vial plate is 6 rows (A-F) x 9 columns (1-9). The robot walks it row by row (A1, A2 ... A9, B1 ...), but the
      // TLC plate is spotted column by column (A1, B1 ... F1, A2 ...). tlcLane() converts between the two.
      // Lanes are numbered 0-53 per vial plate; lanes 0-26 are the first half of the TLC plate, 27-53 the second half.
      // Change TLC_ORDER to 'row' to number lanes the way the robot does instead.
      const TLC_ROWS = 6, TLC_COLS = 9, TLC_ORDER = 'column';
      function tlcLane(container, order = TLC_ORDER) {
        const r = Math.floor(container / TLC_COLS), c = container % TLC_COLS;
        return order === 'row' ? container : c * TLC_ROWS + r;
      }
      function wellLabel(container) { return 'ABCDEF'[Math.floor(container / TLC_COLS)] + (container % TLC_COLS + 1); }
      // One entry per vial, sorted by plate then lane: where the vial is and what is in it.
      function tlcLaneRows(run, order = TLC_ORDER) {
        return run.rows.map(r => ({ plate: r.plate_number, lane: tlcLane(r.container_id, order), half: tlcLane(r.container_id, order) < 27 ? 1 : 2, well: wellLabel(r.container_id), vial: r.container_id, reaction: r.global_index + 1, row: r }))
          .sort((a, b) => a.plate - b.plate || a.lane - b.lane);
      }
      // tlc_lane_map.csv: one line per TLC lane with its well and the target concentration of every reagent.
      function tlcLaneCsv(run, order = TLC_ORDER) {
        const codes = run.rows[0] ? run.rows[0].recipe.map(x => x.code) : [];
        const rows = [['plate', 'tlc_lane', 'tlc_half', 'well', 'robot_vial_index', 'reaction', ...codes.map(c => c + '_mM'), 'solvent_uL']];
        for (const x of tlcLaneRows(run, order)) rows.push([x.plate, x.lane, x.half, x.well, x.vial, x.reaction, ...x.row.recipe.map(rc => benchNum(rc.target_concentration)), benchNum(x.row['vol#solvent'])]);
        return csvText(rows);
      }
      // The bench sheet as CSS + HTML body (also shown in the Export preview).
      function benchSheetParts(run, dateStr) {
        const n = notebookSummary(run, dateStr), st = stockSteps(run), dk = deckSteps(run), e = xmlEsc;
        const css = `.bs{font-family:Arial,Helvetica,sans-serif;color:#1b241f;font-size:13px;line-height:1.4}.bs h1{font-size:22px;margin:0 0 2px}.bs h2{font-size:15px;margin:20px 0 6px;padding-bottom:3px;border-bottom:2px solid #0E6F63;color:#0E6F63}.bs .meta{color:#435047;margin:0 0 4px}.bs table{border-collapse:collapse;width:100%}.bs th{text-align:left;background:#e8f1ee;color:#315e49;font-size:12px}.bs th,.bs td{border:1px solid #cfd6cd;padding:5px 7px;vertical-align:top;text-align:left;white-space:normal;font-weight:normal;font-size:13px;color:#1b241f;background:#fff}.bs th{font-weight:700;background:#e8f1ee;color:#315e49;font-size:12px}.bs td.c{width:22px;text-align:center;font-size:16px}.bs .mono{font-family:Consolas,Menlo,monospace}.bs .note{color:#5b655d;font-size:12px;margin-top:6px}.bs .lines td{height:26px}`;
        const body = `<div class="bs"><h1>${e(n.title)}</h1><p class="meta">${e(n.date)} · ${e(n.meta.join(' · '))}</p>
<h2>1. Prepare the stocks</h2><table><thead><tr><th></th><th>Stock</th><th>How to prepare</th><th>Prepare</th><th>Robot uses</th><th>Put it at</th></tr></thead><tbody>${st.map(x => `<tr><td class="c">☐</td><td><b>${e(x.key)}</b><br>${e(x.reagent)}<br>${e(x.conc)} mM</td><td>${e(x.how)}</td><td class="mono">${e(x.prepare)} mL</td><td class="mono">${e(x.need)} mL</td><td>${e(x.place)}</td></tr>`).join('')}<tr><td class="c">☐</td><td><b>solvent</b><br>${e(run.reactionSolvent)}</td><td>Fill the ${run.deck.solvent_kind === 'jar' ? 'jar' : 'bottle'} with at least ${e(benchNum(run.solventRecommendedMl))} mL.</td><td class="mono">${e(benchNum(run.solventRecommendedMl))} mL</td><td class="mono">${e(benchNum(run.solventConsumptionMl))} mL</td><td>plate ${run.deck.solvent_plate}, position ${run.deck.solvent_container}</td></tr></tbody></table>
<h2>2. Load the deck (${e(run.hood)} hood)</h2><table><thead><tr><th></th><th>Where</th><th>What</th><th>Container</th><th>Fill</th></tr></thead><tbody>${dk.map(x => `<tr><td class="c">☐</td><td>${e(x.where)}</td><td>${e(x.item)}</td><td>${e(x.container)}</td><td>${e(x.fill)}</td></tr>`).join('')}</tbody></table>
<h2>3. Run notes</h2><p class="note">${n.warnings ? n.warnings + ' warning(s) in the validation checks. ' : 'All validation checks passed. '}Estimated time ${e(run.runtime.label)}. Shuffle: ${run.randomize ? 'seed ' + run.randomSeed : 'off'}.</p><table class="lines"><tbody><tr><td>Start time:</td><td>End time:</td><td>Wells that failed:</td></tr><tr><td colspan="3">Notes:</td></tr><tr><td colspan="3">&nbsp;</td></tr></tbody></table>
<p class="note">Made with Robowski Studio. This page is a file only; nothing is sent to the robot.</p></div>`;
        return { css, body, title: n.title };
      }
      // The downloadable bench_sheet.html (complete page with print rules).
      function benchSheetHtml(run, dateStr) { const p = benchSheetParts(run, dateStr); return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${xmlEsc(p.title)} bench sheet</title><style>body{margin:0;padding:24px;background:#fff}@page{margin:12mm}@media print{body{padding:0}h2{break-after:avoid}tr{break-inside:avoid}}${p.css}</style></head><body>${p.body}</body></html>`; }
