      // ENGINE 60 - the "verified fixes" search: tries changes (stock concentration, vial volume, dilution factor, threshold)
      // and keeps only those that clear every blocking issue when re-run through buildRun. Edit here to try other kinds of fixes.
      // ------------------------------------------------------------
      // Counts blocking issues of a candidate run.
      function blocking(run) { return run.issues.filter(i => i.severity === 'block' && i.type !== 'deck-capacity').length; }
      // Re-runs buildRun with changed settings.
      function trySettings(data, patch) { try { const r = buildRun({ ...data, ...patch }); return { run: r, blocks: blocking(r), warns: r.warningCount }; } catch (e) { return null; } }
      /* Auto-fix search: returns verified fixes only (each one was recalculated and has no blocking issue).
         1. single changes: lower threshold, bigger vial, or a different stock concentration for one reagent, or a different dilution factor;
         2. if none of those works alone, the smallest combination of threshold + vial. */
      // Searches combinations of settings and returns verified fixes. Time-limited.
      function suggestFixes(data) {
        const base = trySettings(data, {}); if (!base || base.blocks === 0) return [];
        const out = [], seen = new Set(), thr = num(data.threshold ?? 50), vial = num(data.vialVolume, 500);
        const t0 = Date.now(), over = () => Date.now() - t0 > 2500;
        const add = f => { const k = JSON.stringify(f.patch); if (!seen.has(k)) { seen.add(k); out.push(f); } };
        for (let t = thr - 5; t >= 5; t -= 5) { const x = trySettings(data, { threshold: t }); if (x && x.blocks === 0) { add({ kind: 'threshold', label: `Threshold ${thr} → ${t} µL`, patch: { threshold: t }, warns: x.warns }); break; } if (over()) break; }
        for (let v = vial + 50; v <= 1000; v += 50) { const x = trySettings(data, { vialVolume: v }); if (x && x.blocks === 0) { add({ kind: 'vial', label: `Vial ${vial} → ${v} µL`, patch: { vialVolume: v }, warns: x.warns }); break; } if (over()) break; }
        /* dilution factor N: nearest working values first */
        const curN = num(data.dilutionFactor, 5), nFixes = [];
        for (const nn of [2, 3, 4, 5, 6, 8, 10].filter(x => x !== curN).sort((a, b) => Math.abs(a - curN) - Math.abs(b - curN))) { const x = trySettings(data, { dilutionFactor: nn }); if (x && x.blocks === 0) nFixes.push({ kind: 'dilution', label: `Dilution factor ${curN} → ${nn}`, patch: { dilutionFactor: nn }, warns: x.warns }); if (nFixes.length >= 2 || over()) break; }
        nFixes.forEach(add);
        /* stock concentration of one reagent: try nearby, then bigger jumps; keep the smallest change per reagent */
        const factors = [0.8, 1.25, 0.75, 1.5, 0.6, 2, 0.5, 2.5, 0.4, 3, 0.25, 4, 5], rs = data.reagents || [];
        const stockFixes = [];
        for (let k = 0; k < rs.length && !over(); k++) {
          const cur = num(rs[k].stock); if (!(cur > 0)) continue;
          for (const f of factors) {
            const ns = Number((cur * f).toPrecision(3)); if (!(ns > 0) || ns === cur) continue;
            const reagents = rs.map((r, q) => q === k ? { ...r, stock: ns } : r);
            const x = trySettings(data, { reagents });
            if (x && x.blocks === 0) { stockFixes.push({ kind: 'stock', label: `${rs[k].code} stock ${cur} → ${ns} mM`, patch: { stocks: { [k]: ns } }, warns: x.warns, dist: Math.abs(Math.log(f)) }); break; }
            if (over()) break;
          }
        }
        stockFixes.sort((a, b) => a.dist - b.dist || a.warns - b.warns).slice(0, 3).forEach(add);
        if (!out.length && !over()) {
          /* combined threshold + vial, smallest total number of steps first */
          const nt = Math.max(0, Math.floor((thr - 5) / 5)), nv = Math.max(0, Math.floor((1000 - vial) / 50));
          search: for (let s = 2; s <= nt + nv; s++) for (let a = 1; a < s; a++) {
            const b = s - a; if (a > nt || b > nv) continue;
            const t = thr - 5 * a, v = vial + 50 * b, x = trySettings(data, { threshold: t, vialVolume: v });
            if (x && x.blocks === 0) { add({ kind: 'both', label: `Threshold ${thr} → ${t} µL and vial ${vial} → ${v} µL`, patch: { threshold: t, vialVolume: v }, warns: x.warns }); break search; }
            if (over()) break search;
          }
        }
        return out;
      }
      /* Plain-language reasons why nothing above could be offered (or why only some problems clear). */
      // When nothing works, explains which reagent/volume is the obstacle.
      function explainNoFix(data) {
        const base = trySettings(data, {}); if (!base || base.blocks === 0) return [];
        const r = base.run, vial = num(data.vialVolume, 500), thr = num(data.threshold ?? 50), N = num(data.dilutionFactor, 5), rs = data.reagents || [], out = [], f1 = v => (Math.round(v * 10) / 10).toLocaleString('en-US');
        const direct = row => row.recipe.reduce((s, rc, k) => s + (num(rc.target_concentration) * vial / Math.max(num(rs[k] && rs[k].stock), 1e-12)), 0);
        const types = new Set(r.issues.filter(i => i.severity === 'block' && i.type !== 'deck-capacity').map(i => i.type));
        if (types.has('negative-solvent')) {
          let worst = null; r.rows.forEach((row, i) => { const s = num(row['vol#solvent']); if (s < -1e-8 && (!worst || s < worst.s)) worst = { row, i, s }; });
          if (worst) {
            const D = direct(worst.row), n = worst.row.global_index + 1;
            if (D > 1000 + 1e-9) out.push(`Vial ${n} would need ${f1(D)} µL of reagent even from the undiluted stocks, more than the largest vial this tool offers (1000 µL). Its concentrations are too high for these stocks. Raise the stock concentrations of the reagents that take most of the volume, or lower that vial's concentrations.`);
            else if (D > vial + 1e-9) out.push(`Vial ${n} would need ${f1(D)} µL of reagent even from the undiluted stocks, but the vial holds ${f1(vial)} µL. A bigger vial fits that vial, but then other vials break the threshold, so no single change clears everything. Raise a stock concentration or lower that vial's concentrations.`);
            else out.push(`Vial ${n}: the undiluted stocks would need ${f1(D)} µL, which fits in ${f1(vial)} µL, but the small amounts are taken from ${N}× diluted stocks to stay above the ${thr} µL threshold, and that adds up to ${f1(vial - worst.s)} µL. Changing the threshold or vial alone does not remove every such vial.`);
          }
        }
        if (types.has('large-transfer')) {
          const it = r.issues.find(i => i.type === 'large-transfer' && i.severity === 'block'); if (it) out.push(it.message + ' A single dispense is limited to one 1000 µL tip, so the stock of that reagent is too dilute for its highest concentration: raise its stock concentration.');
        }
        if (types.has('subminimum')) out.push('Some transfers are below 0.5 µL, which the robot skips. A stock is too concentrated for the lowest concentration of that reagent: lower its stock concentration or raise the lowest concentration.');
        if (types.has('low-solvent')) out.push(`In some vials the solvent left over is above 0 but under the ${thr} µL threshold, which the robot cannot pipette accurately. Either the vial is almost full of reagents (raise the vial volume or lower the amounts) or lower the threshold.`);
        if (!out.length) out.push('No change to the threshold, vial volume or one stock concentration clears every blocking check. Narrow a range or change several settings together.');
        return out;
      }
      /* Suggested stock concentration per reagent: highest stock that still lets the smallest non-zero target be pipetted directly (>= threshold). */
      // Suggests stock concentrations that avoid sub-threshold transfers.
      function suggestStocks(data) { const vial = num(data.vialVolume, 500), thr = num(data.threshold ?? 50), mode = data.mode || 'concentration', rs = data.reagents || []; if (!rs.length) return []; const minAA = num(rs[0].min); return rs.map((r, i) => { let minT = num(r.min); if (minT <= 0) minT = num(r.step); if (mode === 'equivalence' && i > 0) minT = minT * Math.max(minAA, 1e-9); const ideal = minT * vial / Math.max(thr, 1e-9); return { code: r.code, current: num(r.stock), direct_max_stock: ideal }; }); }


