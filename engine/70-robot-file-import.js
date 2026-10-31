      // ENGINE 70 - reading robot input workbooks back (to reopen a run) and CSV/XLSX tables (reagent library).
      // Edit here to: change how an exported file is recognised or how its reactions are mapped back to a setup.
      // ------------------------------------------------------------
      /* ---- Re-open a robot input workbook (robowski_run.xlsx): rebuild reagents, stocks and per-vial concentrations ---- */
      // Reads every sheet of an .xlsx into rows of cell values.
      function readAllSheets(files) {
        const shared = files['xl/sharedStrings.xml'] ? Array.from(parseXml(files['xl/sharedStrings.xml']).getElementsByTagNameNS('*', 'si')).map(si => Array.from(si.getElementsByTagNameNS('*', 't')).map(t => t.textContent).join('')) : [];
        const wb = parseXml(files['xl/workbook.xml']), rels = parseXml(files['xl/_rels/workbook.xml.rels']), out = {};
        const relOf = Object.fromEntries(Array.from(rels.getElementsByTagNameNS('*', 'Relationship')).map(r => [r.getAttribute('Id'), r.getAttribute('Target')]));
        for (const sh of Array.from(wb.getElementsByTagNameNS('*', 'sheet'))) {
          const rid = sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sh.getAttribute('r:id'), target = relOf[rid]; if (!target) continue;
          const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, ''); if (!files[path]) continue;
          const sheet = parseXml(files[path]), rows = [];
          for (const c of Array.from(sheet.getElementsByTagNameNS('*', 'c'))) {
            const ref = c.getAttribute('r') || '', m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) continue;
            let col = 0; for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64); col -= 1; const r = Number(m[2]) - 1;
            const type = c.getAttribute('t'), v = c.getElementsByTagNameNS('*', 'v')[0], inl = c.getElementsByTagNameNS('*', 'is')[0]; let value = null;
            if (type === 'inlineStr' && inl) value = Array.from(inl.getElementsByTagNameNS('*', 't')).map(t => t.textContent).join('');
            else if (v) { const txt = v.textContent; if (type === 's') value = shared[Number(txt)] ?? ''; else if (type === 'str') value = txt; else if (type === 'b') value = txt === '1'; else value = txt === '' ? null : Number.isFinite(Number(txt)) ? Number(txt) : txt; }
            (rows[r] = rows[r] || [])[col] = value;
          }
          out[sh.getAttribute('name')] = Array.from(rows, r => r || []);
        }
        return out;
      }
      // Rebuilds a run (reagents, concentrations, deck) from the robot sheets.
      function robotSheetsToRun(sh, fileName) {
        const rx = sh['reactions_with_run_info'], ss = sh['stock_solutions'], cc = sh['stock_solution_concentration'];
        if (!rx || !ss || !cc) throw new Error('This workbook needs the sheets reactions_with_run_info, stock_solutions and stock_solution_concentration.');
        const H = rx[0].map(x => String(x || '')), volCols = H.map((h, i) => [h, i]).filter(([h]) => h.startsWith('vol#')).map(([h, i]) => ({ key: h.slice(4), i }));
        const hdr = (cc[1] || []).map(x => x == null ? '' : String(x)), codes = hdr.slice(1).filter(x => x);
        if (!codes.length) throw new Error('Could not read the reagent names from stock_solution_concentration.');
        const concOf = {}; for (const row of cc.slice(2)) { if (!row || row[0] == null) continue; const nm = String(row[0]); hdr.forEach((h, j) => { if (j > 0 && h && num(row[j]) > 0) concOf[nm] = num(row[j]); }); }
        const stockOf = nm => { const m = /^(.*?)(_N2?)$/.exec(nm); return m ? { base: m[1], level: m[2] === '_N' ? 1 : 2 } : { base: nm, level: 0 }; };
        let factor = 0; for (const [nm, cv] of Object.entries(concOf)) { const { base, level } = stockOf(nm); if (level && concOf[base]) { const f = Math.pow(concOf[base] / cv, 1 / level); if (f > 1) factor = f; } }
        if (!factor) factor = 5;
        const baseStock = {}; for (const [nm, cv] of Object.entries(concOf)) { const { base, level } = stockOf(nm); const b = cv * Math.pow(factor, level); if (!(base in baseStock) || level === 0) baseStock[base] = b; }
        const sol = {}; for (const r of ss.slice(1)) { if (r && r[0] != null) sol[String(r[0])] = { plate: num(r[1]), pos: num(r[2]), solvent: canonicalSolvent(r[3]), density: num(r[4]), vol: num(r[5]), h: num(r[6]), mode: r[7] || 'empty' }; }
        const order = []; for (const v of volCols) { if (v.key === 'solvent') continue; const b = stockOf(v.key).base; if (!order.includes(b)) order.push(b); }
        const solvIdx = volCols.findIndex(v => v.key === 'solvent'); let solventAfter = 0; if (solvIdx >= 0) { const before = new Set(); volCols.slice(0, solvIdx).forEach(v => before.add(stockOf(v.key).base)); solventAfter = [...before].filter(b => order.includes(b)).length; }
        const rows = [], skipped = [], fileRows = [], srcIdx = []; let totals = [];
        rx.slice(1).forEach((row, ri) => {
          if (!row || row.every(x => x == null)) return; let total = 0; for (const v of volCols) total += num(row[v.i]);
          const nonSolv = volCols.filter(v => v.key !== 'solvent').reduce((a, v) => a + num(row[v.i]), 0);
          if (!(total > 0) || nonSolv === 0) { skipped.push(ri); return; }
          totals.push(total); srcIdx.push(ri); fileRows.push(Object.fromEntries(volCols.map(v => [v.key, num(row[v.i])]))); const conc = order.map(b => { let c = 0; for (const v of volCols) { if (v.key === 'solvent') continue; if (stockOf(v.key).base !== b) continue; const cv = concOf[v.key]; if (cv) c += num(row[v.i]) * cv / total; } return Math.round(c * 1e9) / 1e9; }); rows.push(conc);
        });
        if (!rows.length) throw new Error('No vials with volumes were found in this workbook.');
        totals.sort((a, b) => a - b); const vial = Math.round(totals[Math.floor(totals.length / 2)] * 1000) / 1000;
        let minV = 1e18; rx.slice(1).forEach(row => { if (!row) return; for (const v of volCols) { if (v.key === 'solvent') continue; const x = num(row[v.i]); if (x > 0) minV = Math.min(minV, x); } });
        const solv = sol['solvent'] || {}, reactionSolvent = canonicalSolvent(solv.solvent || 'ethanol');
        const reagents = order.map(b => { const key = Object.keys(sol).find(k => k === b) || Object.keys(sol).find(k => stockOf(k).base === b); return { code: b, name: b, molarMass: 0, density: 0, stock: Math.round(baseStock[b] * 1e6) / 1e6, solvent: canonicalSolvent((sol[key] || {}).solvent || reactionSolvent), pipettingMode: (sol[key] || {}).mode || 'empty' }; });
        const stockPlates = [...new Set(Object.entries(sol).filter(([k]) => k !== 'solvent').map(([, v]) => v.plate))].sort((a, b) => a - b);
        const deckPlates = solv.plate != null ? { solventPlate: solv.plate, solventKind: (solv.vol > 0 && solv.h > 0) ? (Math.abs(surfaceHeight('jar', solv.vol) - solv.h) < Math.abs(surfaceHeight('bottle', solv.vol) - solv.h) ? 'jar' : 'bottle') : (stockPlates.includes(solv.plate) ? 'bottle' : 'jar'), solventPos: solv.pos || 0, stockPlates: stockPlates.length ? stockPlates : [3] } : null;
        const solvAdj = Math.min(solventAfter, reagents.length);
        return { name: String(fileName || 'imported').replace(/\.xlsx$/i, ''), vialVolume: vial, threshold: Math.min(50, Math.floor(minV * 1000) / 1000 || 50), dilutionFactor: Math.round(factor * 1000) / 1000, reactionSolvent, reagents, rows, skipped: skipped.length, solventAfter: solvAdj, deckPlates, fileRows, srcIdx, desc: sh['description'] || null, volCols: volCols.map(v => v.key) };
      }
      // Public entry: robot .xlsx -> run.
      async function importRobotWorkbook(file) { const files = await readZipFile(file); return robotSheetsToRun(readAllSheets(files), file.name); }

      // CSV/TSV parser that understands quotes and commas inside quotes.
      function parseDelimited(text) {
        text = text.replace(/^\ufeff/, ''); const first = text.split(/\r?\n/, 1)[0]; const counts = { ',': 0, ';': 0, '\t': 0 }; let q = false;
        for (const ch of first) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++; }
        const d = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0], delim = counts[d] ? d : ',';
        const rows = []; let row = [], cell = '', inq = false;
        for (let i = 0; i < text.length; i++) { const ch = text[i];
          if (inq) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inq = false; } else cell += ch; }
          else if (ch === '"') inq = true; else if (ch === delim) { row.push(cell); cell = ''; }
          else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
          else cell += ch; }
        if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
        return rows;
      }
      // Reads .csv/.tsv/.txt/.xlsx into sheets of rows. Also used for the Excel preview.
      async function readTableFile(file) {
        const name = file.name || '';
        if (/\.xls$/i.test(name)) throw new Error('Old .xls files are not supported. Save the file as .xlsx or .csv.');
        if (/\.xls[xm]$/i.test(name)) { const sheets = readAllSheets(await readZipFile(file)); return Object.entries(sheets).map(([n, rows]) => ({ name: n, rows })); }
        return [{ name, rows: parseDelimited(await file.text()) }];
      }
