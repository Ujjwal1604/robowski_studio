      // ENGINE 20 - deck positions, tips, liquid heights and runtime estimate.
      // Edit here to: change default plate numbers, the surface-height formulas, tip size thresholds or the time model.
      // ------------------------------------------------------------
      // Default deck layout per hood (which plate holds the solvent and which hold stock bottles). Edit to change the default positions.
      function defaultPlates(hood) { return hood === 'left' ? { solventPlate: 4, solventKind: 'jar', solventPos: 0, stockPlates: [3, 5, 6] } : { solventPlate: 3, solventKind: 'bottle', solventPos: 0, stockPlates: [4, 5] }; }
      // Gives every stock bottle a plate and position. A jar takes a whole plate; a bottle solvent reserves one position.
      function assignDeckPositions(hood, stocks, cfg) {
        const c = { ...defaultPlates(hood), ...(cfg || {}) }, rows = Object.values(stocks), base = rows.filter(s => s.dilution_level === 0), diluted = rows.filter(s => s.dilution_level > 0), all = [...base, ...diluted]; const slots = []; for (const p of c.stockPlates) { if (c.solventKind === 'jar' && p === c.solventPlate) continue; for (let k = 0; k < 8; k++) { if (c.solventKind === 'bottle' && p === c.solventPlate && k === c.solventPos) continue; slots.push([p, k]); } }
        all.forEach((s, i) => { const sl = slots[Math.min(i, slots.length - 1)] || [c.stockPlates[0], 0]; s.breadboard_plate_id = sl[0]; s.container_id = sl[1]; s.deck_overflow = i >= slots.length; }); const cap = slots.length, fit = all.length <= cap; return { hood, plates: c.stockPlates, stock_plate: c.stockPlates[0], dilution_plate: c.stockPlates[1] != null ? c.stockPlates[1] : c.stockPlates[0], solvent_plate: c.solventPlate, solvent_kind: c.solventKind, solvent_container: c.solventPos, stock_capacity: cap, dilution_capacity: cap, positions_fit: fit, positions_message: fit ? '' : `${c.solventKind === 'jar' && c.stockPlates.includes(c.solventPlate) ? 'The solvent jar takes all of plate ' + c.solventPlate + ', so no stock bottles can sit there. ' : ''}The chosen plates have ${cap} free bottle positions; this run needs ${all.length} stock positions (${base.length} direct + ${diluted.length} hand-diluted).`, solvent_location: `plate${c.solventPlate}, position ${c.solventPos}` };
      }
      // Liquid surface height the robot needs, from volume. Bottle is fitted to your lab readings; the jar formula is an estimate.
      function surfaceHeight(kind, uL) { const g = kind === 'jar' ? { bottom: 2120, area: 2123.7 } : { bottom: 2190, area: 512.8205 }; /* bottle: fitted to the lab's readings 20 mL = 1800 and 10 mL = 1995 (2026-10-24), straight line */ return Math.round(g.bottom - (uL / g.area) * 10); }
      // Chooses the 50, 300 or 1000 uL tip for a transfer volume.
      function tipSize(v) { if (v < .5) return null; if (v <= 50) return 50; if (v <= 300) return 300; if (v < 2000) return 1000; return null; }
      // Counts tips and racks needed per plate (including the optional stock-volume check).
      function calculateTipCounts(rows, stocks, stockCheck = true, newTipEach = false) { const counts = { 50: 0, 300: 0, 1000: 0 }, perPlate = [], stockKeys = Object.keys(stocks), plateCount = Math.ceil(rows.length / PLATE_CAPACITY); for (let p = 0; p < plateCount; p++) { const plateRows = rows.slice(p * PLATE_CAPACITY, (p + 1) * PLATE_CAPACITY), detail = { 50: 0, 300: 0, 1000: 0 }; for (const key of [...stockKeys, 'solvent']) { const col = key === 'solvent' ? 'vol#solvent' : `vol#${key}`, volumes = plateRows.map(r => num(r[col])).filter(v => v >= .5); if (!volumes.length) continue; if (newTipEach) { for (const v of volumes) { const s = tipSize(v); if (s) detail[s]++; } } else { for (const s of [...new Set(volumes.map(tipSize).filter(Boolean))].sort((a, b) => a - b)) detail[s]++; } } perPlate.push({ plate: p, counts: detail, transfers: plateRows.reduce((n, row) => n + stockKeys.reduce((m, key) => m + (num(row[`vol#${key}`]) >= .5 ? 1 : 0), 0) + (num(row['vol#solvent']) >= .5 ? 1 : 0), 0) }); for (const size of [50, 300, 1000]) counts[size] += detail[size]; } if (stockCheck) counts[300] += stockKeys.length + 1; return { 50: counts[50], 300: counts[300], 1000: counts[1000], rackCapacity: TIP_RACK_CAPACITY, racks: { 50: Math.ceil(counts[50] / TIP_RACK_CAPACITY), 300: Math.ceil(counts[300] / TIP_RACK_CAPACITY), 1000: Math.ceil(counts[1000] / TIP_RACK_CAPACITY) }, perPlate, stockCheck, newTipEach, stockCheckTips: stockCheck ? stockKeys.length + 1 : 0 }; }
      // Formats seconds as "9 min 31 s".
      function formatDuration(seconds) { seconds = Math.max(0, Math.round(seconds)); const mins = Math.floor(seconds / 60), sec = seconds % 60, hours = Math.floor(mins / 60), mm = mins % 60; return hours ? `${hours} h ${String(mm).padStart(2, '0')} min` : mins ? `${mins} min ${String(sec).padStart(2, '0')} s` : `${sec} s`; }
      /* Timing model from the lab's own plate-builder (runplan.py), fitted to three logged runs (2026-10-12, 45 transfers each):
         one transfer with the tip already on = 12.8 s (50 uL tip), 13.0 s (300 uL), 13.8 s (1000 uL); a tip change (discard + pick + prewet) adds about 30 s;
         a transfer larger than its tip needs extra aspirate/dispense cycles (+9 s each, assumed, not measured); +2 s per plate. Homing, rack reloads and manual pauses are not included.
         Order of tips: for each plate, for each substance, transfers largest first; a new tip when the tip size changes or the substance changes. */
      // Run time estimate (low, expected, high) from transfers and tip changes. The constants were fitted to logged runs; change them here when you have better timing data.
      function estimateRuntime(rows, tipCounts, stockCheck = true, newTipEach = false) {
        const TR = { 50: [12.8, 12, 15], 300: [13, 12, 14], 1000: [13.8, 13, 15] }, TC = [30, 28, 33], XC = [9, 6, 13], PE = 2, MAX = { 50: 50, 300: 300, 1000: 1000 };
        const t = [0, 0, 0]; let transfers = 0, cycles = 0, tipChanges = 0;
        const colSet = new Set(); rows.forEach(r => Object.keys(r).forEach(k => { if (k.startsWith('vol#')) colSet.add(k); })); const cols = [...colSet], plates = Math.ceil(rows.length / PLATE_CAPACITY);
        for (let p = 0; p < plates; p++) {
          const plateRows = rows.slice(p * PLATE_CAPACITY, (p + 1) * PLATE_CAPACITY);
          for (const col of cols) {
            const vols = plateRows.map(r => num(r[col])).filter(v => v >= .5).sort((a, b) => b - a); let cur = null;
            for (const v of vols) {
              const s = tipSize(v) || 1000;
              if (newTipEach || s !== cur) { tipChanges++; for (let i = 0; i < 3; i++) t[i] += TC[i]; cur = s; }
              const cyc = Math.max(1, Math.ceil(v / MAX[s] - 1e-9)); transfers++; cycles += cyc;
              for (let i = 0; i < 3; i++) t[i] += TR[s][i] + (cyc - 1) * XC[i];
            }
          }
          for (let i = 0; i < 3; i++) t[i] += PE;
        }
        const half = (t[2] - t[1]) / 2 / 60;
        return { lowSeconds: Math.round(t[1]), highSeconds: Math.round(t[2]), seconds: Math.round(t[0]), label: `${formatDuration(t[0])} (${formatDuration(t[1])} to ${formatDuration(t[2])})`, events: transfers, transfers, cycles, tipChanges, plates, stockBottles: stockCheck ? tipCounts.stockCheckTips : 0, calibrationNote: 'Fitted to three logged runs of 2026-10-12 (about 13 s per transfer plus 30 s per tip change). The 9 s per extra aspirate/dispense cycle is an assumption. Homing, rack reloads, manual pauses and the optional stock-volume check are not included.' };
      }
