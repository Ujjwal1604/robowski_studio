      // APP 45 - TLC map: upload a lane CSV and the aligned plate images, get a 6 x 9 map of the vial plate where every well
      // shows its own TLC lane (cut out of the aligned image) next to its recipe. You can load several TLC sets (for example
      // the same plate run in different solvent systems), switch between them, or compare them side by side for every well.
      // TLC data belongs to the open run: the lane CSV text and the settings are saved inside the run (S.tlc), the images are
      // kept in this browser (IndexedDB, keyed by the set's uid) because they are too big for the run record. Opening another
      // run shows that run's TLC sets. Nothing is uploaded. Lane maths is in engine/46-tlc-lanes.js; styles are
      // in style/04-tlc-map.css. To change what a cell shows, edit tlcCell(); to change how lanes are drawn, edit tlcDraw().
      const TLC_KEYS = ['UV254', 'White', 'UV366'];                                   // panel order, left to right
      const TLC_LABEL = { UV254: 'UV 254 nm', White: 'Visible', UV366: 'UV 365 nm' };
      const tlcNewSet = n => ({ uid: uid(), name: 'Set ' + n, cfgText: '', cfg: null, cfgName: '', frameW: C.LANE_FRAME_WIDTH, imgs: {}, frontPx: null, prof: {}, frontAuto: null });
      const tlcReset = set => { set.prof = {}; set.frontAuto = null; };   // forget cached brightness profiles and spots (after new files or settings)
      // sets: one entry per TLC run (own lane CSV + images). cur: the set shown. compare: show every set side by side, one panel type (cmpKey).
      let tlc = { _key: '', _tok: 0, sets: [tlcNewSet(1)], cur: 0, compare: false, cmpKey: 'UV254', zoom: 0.45, plate: 0, rf: true, show: { UV254: true, White: true, UV366: true } };
      const tlcCur = () => tlc.sets[tlc.cur];
      const tlcLetter = i => String.fromCharCode(65 + i);

      // ---- saving with the run ----------------------------------------------------------------------------
      // Images: IndexedDB, one record per set + panel. Every call fails soft (private windows, blocked storage).
      let tlcDb = null;
      const tlcIdb = () => tlcDb || (tlcDb = new Promise(res => { try { const q = indexedDB.open('robowski-tlc', 1); q.onupgradeneeded = () => q.result.createObjectStore('img'); q.onsuccess = () => res(q.result); q.onerror = q.onblocked = () => res(null); setTimeout(() => res(null), 3000); } catch (e) { res(null); } }));
      async function tlcIdbDo(mode, fn) { const db = await tlcIdb(); if (!db) return null; return new Promise(res => { setTimeout(() => res(null), 8000); try { const tx = db.transaction('img', mode), r = fn(tx.objectStore('img')); tx.oncomplete = () => res(r && 'result' in r ? r.result : true); tx.onerror = tx.onabort = () => res(null); } catch (e) { res(null); } }); }
      const tlcImgPut = (uid, key, name, blob) => tlcIdbDo('readwrite', st => st.put({ name, blob }, uid + '/' + key));
      const tlcImgGet = (uid, key) => tlcIdbDo('readonly', st => st.get(uid + '/' + key));
      // What goes into the run: everything except the pictures and the cached measurements.
      function tlcPack() {
        return { cur: tlc.cur, plate: tlc.plate, compare: tlc.compare, cmpKey: tlc.cmpKey, sets: tlc.sets.map(x => ({ uid: x.uid, name: x.name, cfgText: x.cfgText, cfgName: x.cfgName, frameW: x.frameW, frontPx: x.frontPx, imgNames: Object.fromEntries(Object.entries(x.imgs).map(([k, im]) => [k, im.name])) })) };
      }
      // Writes the TLC state into the open run (and its saved copy, if the run has been saved) after every change.
      function tlcPersist() {
        S.tlc = tlcPack(); tlc._key = S.tlc.sets.map(x => x.uid).join();
        saveDraft();
        const r = S.id && runsList.find(x => x.id === S.id);
        if (r) { r.state = { ...r.state, tlc: JSON.parse(JSON.stringify(S.tlc)) }; Promise.resolve(putRun(r)).catch(() => { }); }
      }
      // If the open run is not the one the sets on screen came from (opened, started or duplicated another run), switch to
      // the sets saved in this run, or to an empty one. The pictures come back from this browser's storage a moment later.
      function tlcSync() {
        const saved = S.tlc && S.tlc.sets && S.tlc.sets.length ? S.tlc : null, key = saved ? saved.sets.map(x => x.uid).join() : '';
        if (tlc._key === key) return;
        const tok = ++tlc._tok; tlc.sets.forEach(x => Object.values(x.imgs).forEach(im => im.bmp.close && im.bmp.close()));
        tlc._key = key; tlc.compare = !!(saved && saved.compare); tlc.cmpKey = saved && saved.cmpKey || 'UV254'; tlc.plate = saved && saved.plate || 0; tlc.cur = 0;
        if (!saved) { tlc.sets = [tlcNewSet(1)]; return; }
        tlc.sets = saved.sets.map(x => {
          const set = { ...tlcNewSet(1), uid: x.uid, name: x.name, cfgText: x.cfgText || '', cfgName: x.cfgName || '', frameW: x.frameW || C.LANE_FRAME_WIDTH, frontPx: x.frontPx || null };
          if (set.cfgText) { try { set.cfg = C.parseLaneConfig(set.cfgText); } catch (e) { } }
          return set;
        });
        tlc.cur = Math.min(saved.cur || 0, tlc.sets.length - 1);
        saved.sets.forEach((x, si) => Object.entries(x.imgNames || {}).forEach(async ([k, nm]) => {
          const rec = await tlcImgGet(x.uid, k); if (tok !== tlc._tok) return;
          if (!rec || !rec.blob) { tlc.sets[si].missing = (tlc.sets[si].missing || []).concat(nm); if (view === 'tlc') render(); return; }
          try { const bmp = await createImageBitmap(rec.blob); if (tok !== tlc._tok) { bmp.close(); return; } tlc.sets[si].imgs[k] = { name: rec.name || nm, bmp }; tlcReset(tlc.sets[si]); } catch (e) { }
          if (view === 'tlc') render();
        }));
      }
      // Gives a duplicated run its own copy of the TLC sets, so removing or replacing images in one run never touches the other.
      function tlcFork(st) {
        if (!st.tlc || !st.tlc.sets) return;
        st.tlc.sets.forEach(x => { const old = x.uid; x.uid = uid(); Object.keys(x.imgNames || {}).forEach(async k => { const rec = await tlcImgGet(old, k); if (rec) tlcImgPut(x.uid, k, rec.name, rec.blob); }); });
      }

      // Work out which panel an image file belongs to from its name (…UV254…, …UV366…, …White…); otherwise the first free panel.
      function tlcKeyOf(name, set) {
        if (/254/.test(name)) return 'UV254';
        if (/36[56]|uv.?3/i.test(name)) return 'UV366';
        if (/white|visible|vis\b|day/i.test(name)) return 'White';
        return ['UV254', 'UV366', 'White'].find(k => !set.imgs[k]) || null;   // no hint in the name: fill UV254, UV366, White in that order
      }
      async function tlcLoadCsv(f) {
        const set = tlcCur();
        try { const txt = await f.text(), p = C.parseLaneConfig(txt); set.cfg = p; set.cfgText = txt; set.cfgName = f.name; tlcReset(set); tlcPersist(); toast(`Read ${p.lanes.length} lanes from ${f.name}.` + (p.warnings.length ? ' ' + p.warnings[0] : '')); }
        catch (e) { toast('Could not read the lane file: ' + e.message); }
        render();
      }
      async function tlcLoadImages(files) {
        const set = tlcCur(); let n = 0;
        for (const f of files) {
          const key = tlcKeyOf(f.name, set); if (!key) { toast(`${f.name}: could not tell which image this is (UV254, White or UV366). Put that in the file name.`); continue; }
          try { const bmp = await createImageBitmap(f); if (set.imgs[key] && set.imgs[key].bmp.close) set.imgs[key].bmp.close(); set.imgs[key] = { name: f.name, bmp }; set.missing = []; tlcReset(set); n++; tlcImgPut(set.uid, key, f.name, f).then(ok => { if (!ok && !tlcImgPut.warned) { tlcImgPut.warned = 1; toast('This browser would not keep the images, so they last until you reload; the lane file and settings are still saved with the run.'); } }); }
          catch (e) { toast(`Could not open ${f.name}: ${e.message || e}`); }
        }
        if (n) { tlcPersist(); toast(`Loaded ${n} image${n === 1 ? '' : 's'}.`); } render();
      }
      const tlcLaneOf = (set, t) => set.cfg && set.cfg.lanes.find(l => l.id === t);
      // ---- Rf values ----------------------------------------------------------------------------------------
      // For every lane we average the brightness across the middle of the strip (one number per pixel up the lane), find the
      // spots in that curve (engine/46) and convert their position to Rf = (spot - origin) / (front - origin).
      // The origin comes from the lane CSV (px_location_of_zero_rf); the solvent front is found from the bright band in the UV 365 nm image.
      const TLC_SIGNAL = { UV254: { ch: 1, sign: -1 }, UV366: { ch: 2, sign: 1 }, White: { ch: 2, sign: -1 } };   // colour channel to read, and whether spots are dark (-1) or bright (+1)
      let tlcScratch = null;
      function tlcProfile(set, key, lane) {
        const ck = key + ':' + lane.id; if (set.prof[ck]) return set.prof[ck];
        const im = set.imgs[key], W = Math.round(lane.width), L = Math.round(lane.length);
        tlcScratch = tlcScratch || document.createElement('canvas'); tlcScratch.width = W; tlcScratch.height = L;
        const ctx = tlcScratch.getContext('2d', { willReadFrequently: true }); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, L);
        ctx.setTransform(...C.laneMatrix(lane, im.bmp.width / set.frameW, 1)); ctx.drawImage(im.bmp, 0, 0);
        const data = ctx.getImageData(0, 0, W, L).data, ch = TLC_SIGNAL[key].ch, x0 = Math.floor(W * 0.25), x1 = Math.ceil(W * 0.75), out = new Array(L);
        for (let y = 0; y < L; y++) { let sum = 0; for (let x = x0; x < x1; x++) sum += data[(y * W + x) * 4 + ch]; out[L - 1 - y] = sum / (x1 - x0); }
        return set.prof[ck] = out;
      }
      const tlcHalf = lane => lane.id < 27 ? 0 : 1;   // lanes 0-26 and 27-53 are the two halves of the TLC plate, each with its own front
      function tlcFront(set, lane) {
        if (set.frontPx > 0) return set.frontPx;
        if (!set.imgs.UV366) return Math.round(lane.length * 0.93);
        set.frontAuto = set.frontAuto || {}; const h = tlcHalf(lane);
        if (set.frontAuto[h] == null) { const v = set.cfg.lanes.filter(l => tlcHalf(l) === h).map(l => C.detectFront(tlcProfile(set, 'UV366', l))).sort((a, b) => a - b); set.frontAuto[h] = v[v.length >> 1]; }
        return set.frontAuto[h];
      }
      const tlcPrimary = set => ['UV254', 'UV366', 'White'].find(k => set.imgs[k]);
      function tlcSpots(set, key, lane) {
        if (!tlc.rf || lane.zeroRf == null || !set.imgs[key]) return null;
        const ck = 'sp:' + key + ':' + lane.id; if (set.prof[ck]) return set.prof[ck];
        return set.prof[ck] = C.findSpots(tlcProfile(set, key, lane), { sign: TLC_SIGNAL[key].sign, origin: lane.zeroRf, front: tlcFront(set, lane), radius: lane.spotRadius || 24 });
      }
      const tlcRfText = sp => sp ? (sp.length ? sp.slice(0, 4).map(x => x.rf.toFixed(2)).join(' · ') : 'no spots') : '';
      // The line of Rf values under a well: for the current set, or one line per set when comparing.
      function tlcRfLine(t) {
        if (!tlc.rf) return '';
        if (tlc.compare && tlc.sets.length > 1) return tlc.sets.map((s, i) => { const l = tlcLaneOf(s, t), k = s.imgs[tlc.cmpKey] ? tlc.cmpKey : tlcPrimary(s); return l && k ? `<div><b>${tlcLetter(i)}</b> ${tlcRfText(tlcSpots(s, k, l))}</div>` : ''; }).join('');
        const s = tlcCur(), l = tlcLaneOf(s, t), k = tlcPrimary(s); if (!l || !k) return '';
        const sp = tlcSpots(s, k, l); return sp ? `<div title="Rf of the spots found in the ${TLC_LABEL[k]} image">Rf ${tlcRfText(sp)}</div>` : '';
      }
      // The picture panels to draw for TLC lane t: the shown images of the current set, or (compare mode) one panel per set.
      function tlcPanels(t) {
        if (tlc.compare && tlc.sets.length > 1) return tlc.sets.map((s, i) => ({ s, i, key: tlc.cmpKey, lane: tlcLaneOf(s, t), label: tlcLetter(i) })).filter(p => p.lane && p.s.imgs[p.key]).map(p => ({ ...p, spots: tlcSpots(p.s, p.key, p.lane) }));
        const s = tlcCur(); return TLC_KEYS.filter(k => s.imgs[k] && tlc.show[k]).map(k => ({ s, i: tlc.cur, key: k, lane: tlcLaneOf(s, t), label: '' })).filter(p => p.lane).map(p => ({ ...p, spots: tlcSpots(p.s, p.key, p.lane) }));
      }
      // Draw lane panels upright (starting line at the bottom), side by side. k = screen px per frame px.
      function tlcDraw(canvas, panels, k) {
        if (!panels.length) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2), gap = Math.max(3, Math.round(k * 6)), ph = Math.round(Math.max(...panels.map(p => k * p.lane.length)));
        const ws = panels.map(p => Math.round(k * p.lane.width)), cssW = ws.reduce((a, b) => a + b, 0) + gap * (panels.length - 1);
        canvas.width = cssW * dpr; canvas.height = ph * dpr; canvas.style.width = cssW + 'px'; canvas.style.height = ph + 'px';
        const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'; let x = 0;
        panels.forEach((p, j) => {
          const im = p.s.imgs[p.key], l = p.lane, m = C.laneMatrix(l, im.bmp.width / p.s.frameW, k), top = ph - k * l.length, w = ws[j];
          ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.beginPath(); ctx.rect(x, top, w, k * l.length); ctx.clip();
          ctx.setTransform(dpr * m[0], dpr * m[1], dpr * m[2], dpr * m[3], dpr * (m[4] + x), dpr * (m[5] + top)); ctx.drawImage(im.bmp, 0, 0); ctx.restore();
          ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          if (l.zeroRf != null) {   // small ticks at both edges where the spot origin is
            ctx.strokeStyle = '#FFC857'; ctx.lineWidth = 1.5; const y = top + k * (l.length - l.zeroRf);
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y); ctx.moveTo(x + w - 5, y); ctx.lineTo(x + w, y); ctx.stroke();
          }
          if (p.spots) { ctx.strokeStyle = '#FF4D8D'; ctx.lineWidth = 1.5; ctx.beginPath(); for (const sp of p.spots.slice(0, 6)) { const y = top + k * (l.length - sp.pos); ctx.moveTo(x + w - 7, y); ctx.lineTo(x + w, y); } ctx.stroke(); }   // pink ticks at the spots found
          if (p.label) { ctx.font = '600 11px sans-serif'; ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x, 0, 14, 15); ctx.fillStyle = '#fff'; ctx.fillText(p.label, x + 3, 12); }
          ctx.restore(); x += w + gap;
        });
      }
      const tlcRow = i => run && run.rows.find(r => r.plate_number === tlc.plate && r.container_id === i);
      const tlcRecipe = row => row ? row.recipe.filter(rc => rc.target_concentration > 0).map(rc => { const ci = S.reagents.findIndex(r => r.code === rc.code); return `<span title="${esc(rc.code)}"><i style="background:${rcol(ci < 0 ? 0 : ci)}"></i>${nf(rc.target_concentration, 3)}</span>`; }).join('') : '<span class="mut">no vial</span>';
      // One well of the map: well name, lane number, the lane picture, and the target concentrations (mM) of that vial.
      function tlcCell(i) {
        const t = C.tlcLane(i, 'column'), row = tlcRow(i), has = tlcPanels(t).length > 0;
        return `<button class="tlccell" data-tact="open" data-i="${i}" aria-label="Well ${C.wellLabel(i)}, TLC lane ${t}. Open larger view"><div class="tch"><b>${C.wellLabel(i)}</b><span>lane ${t}</span></div>${has ? `<canvas data-i="${i}"></canvas>` : `<div class="tcempty">${tlcCur().cfg ? 'no image' : 'no lane'}</div>`}<div class="tcr">${tlcRecipe(row)}</div><div class="tcrf">${tlcRfLine(t)}</div></button>`;
      }
      const tlcCells = () => [...Array(54).keys()].map(tlcCell).join('');
      function tlcView() {
        tlcSync();
        const s = tlcCur(), p = s.cfg, have = TLC_KEYS.some(k => s.imgs[k]), plates = run ? run.plates : 1, multi = tlc.sets.length > 1;
        const imgChips = TLC_KEYS.map(k => s.imgs[k] ? `<label class="chip"><input type="checkbox" data-tlc="show" data-k2="${k}" ${tlc.show[k] ? 'checked' : ''}> ${TLC_LABEL[k]} <span class="mut">${esc(s.imgs[k].name.length > 26 ? '…' + s.imgs[k].name.slice(-24) : s.imgs[k].name)}</span></label>` : '').join('');
        const tabs = tlc.sets.map((x, i) => `<button class="tlcsetbtn ${i === tlc.cur ? 'on' : ''}" data-tact="setsel" data-i="${i}" aria-pressed="${i === tlc.cur}">${multi ? `<b>${tlcLetter(i)}</b> ` : ''}${esc(x.name)}</button>`).join('');
        return `<div class="card tlcctl"><h2>TLC map</h2><p class="sub">Each well of the vial plate is shown with its TLC lane. Lanes are numbered column by column (A1, B1 … F1, A2 …) while the robot fills row by row, so the lane number differs from the vial number. This TLC data belongs to the run <b>${esc(S.name)}</b>: the lane CSV and settings are saved with it, the images stay in this browser.</p>
 <div class="tlcsets" role="group" aria-label="TLC sets">${tabs}<button class="btn sm" data-tact="setadd">+ Add set</button></div>
 <div class="tlcbtns"><label class="tlcz">Name <input type="text" class="f" data-tlc="setname" value="${esc(s.name)}" maxlength="40" style="width:210px" placeholder="e.g. 50% EtOAc in hexane"></label>${multi ? '<button class="btn sm" data-tact="setdel">Remove this set</button>' : ''}</div>
 <div class="tlcbtns"><button class="btn" data-tact="pickcsv">${p ? 'Replace lane CSV' : 'Choose lane CSV'}</button><button class="btn" data-tact="pickimg">${have ? 'Add or replace images' : 'Choose plate images'}</button>
 <label class="tlcz">Zoom <input type="range" min="0.25" max="0.9" step="0.05" value="${tlc.zoom}" data-tlc="zoom" aria-label="Zoom"></label>
 <label class="tlcz"><input type="checkbox" data-tlc="rf" ${tlc.rf ? 'checked' : ''}> Mark spots and show Rf</label>
 ${plates > 1 ? `<label class="tlcz">Plate <select class="f" data-tlc="plate">${[...Array(plates).keys()].map(x => `<option value="${x}" ${x === tlc.plate ? 'selected' : ''}>${x}</option>`).join('')}</select></label>` : ''}</div>
 <div class="tlcstat">${p ? `<span class="chip ok">${p.lanes.length} lanes · ${esc(s.cfgName)}${p.hasZeroRf ? ' · microadjusted' : ''}</span>` : '<span class="chip warn">No lane CSV yet</span>'}${p && !p.hasZeroRf ? '<span class="chip warn" title="Rf needs the spot origin, which is the px_location_of_zero_rf column of the microadjusted lane CSV">Rf needs the microadjusted lane CSV</span>' : ''}${imgChips || '<span class="chip warn">No images yet</span>'}${s.missing && s.missing.length ? `<span class="chip warn" title="${esc(s.missing.join(', '))}">Images saved with this run are not in this browser. Add them again.</span>` : ''}</div>
 ${multi ? `<div class="tlcbtns" style="margin-top:12px"><label class="tlcz"><input type="checkbox" data-tlc="compare" ${tlc.compare ? 'checked' : ''}> Compare sets side by side</label>${tlc.compare ? `<label class="tlcz">Image <select class="f" data-tlc="cmpkey" style="min-width:130px">${TLC_KEYS.map(k => `<option value="${k}" ${k === tlc.cmpKey ? 'selected' : ''}>${TLC_LABEL[k]}</option>`).join('')}</select></label><span class="hint" style="margin:0">${tlc.sets.map((x, i) => `<b>${tlcLetter(i)}</b> ${esc(x.name)}`).join(' · ')}</span>` : ''}</div>` : ''}
 <details class="det" style="margin-top:10px"><summary>Image settings (this set)</summary><div class="tlcset"><label class="lbl">Frame width the lane coordinates refer to (px)</label><input type="number" class="f mono" data-tlc="frameW" value="${s.frameW}" style="max-width:140px"><div class="hint" style="margin-top:4px">3280 for the aligned images from the lane tool. Smaller copies of the same images work automatically.</div>
 <label class="lbl" style="margin-top:12px">Solvent front (px from the start of the lane)</label><input type="number" class="f mono" data-tlc="front" value="${s.frontPx || ''}" placeholder="auto" style="max-width:140px"><div class="hint" style="margin-top:4px">Leave empty to find it from the bright band in the UV 365 nm image${s.cfg && s.imgs.UV366 && !s.frontPx ? ` (found at ${tlcFront(s, s.cfg.lanes[0])} px for the first half, ${tlcFront(s, s.cfg.lanes.find(l => l.id >= 27) || s.cfg.lanes[0])} px for the second)` : ''}. Rf = (spot − origin) / (front − origin).</div></div></details>
 ${s.cfg && tlcPrimary(s) && s.cfg.hasZeroRf ? '<div class="tlcbtns" style="margin-top:12px"><button class="btn" data-tact="rfcsv">Download Rf table (CSV)</button><span class="hint" style="margin:0">All sets, every lane: Rf values and strengths next to the recipe.</span></div>' : ''}
 <input type="file" id="tlcCsv" accept=".csv,.txt" hidden><input type="file" id="tlcImg" accept="image/png,image/jpeg,image/webp" multiple hidden></div>
 <div class="tlcwrap"><div class="tlcgrid" id="tlcgrid">${tlcCells()}</div></div>`;
      }
      function tlcPaint() {
        const grid = document.getElementById('tlcgrid'); if (!grid) return;
        grid.querySelectorAll('canvas[data-i]').forEach(cv => tlcDraw(cv, tlcPanels(C.tlcLane(+cv.dataset.i, 'column')), tlc.zoom));
      }
      // Larger view of one well: all panels at full size, the recipe, and the lane numbers.
      function tlcOpen(i) {
        const t = C.tlcLane(i, 'column'), row = tlcRow(i), panels = tlcPanels(t); closePreview();
        const overlay = document.createElement('div'); overlay.id = 'previewModal'; overlay.className = 'modal-overlay';
        const lines = row ? row.recipe.filter(rc => rc.target_concentration > 0).map(rc => `${esc(rc.code)} ${nf(rc.target_concentration, 3)} mM`).concat([`solvent ${nf(row['vol#solvent'], 1)} µL`]).join(' · ') : 'No vial in this well for the current run.';
        const cap = tlc.compare && tlc.sets.length > 1 ? `${TLC_LABEL[tlc.cmpKey]} · ${tlc.sets.map((x, j) => `<b>${tlcLetter(j)}</b> ${esc(x.name)}`).join(' · ')}` : (panels.map(p => TLC_LABEL[p.key]).join(' · ') + (panels.length ? ' · ' + esc(tlcCur().name) : ''));
        const word = x => x > 0.5 ? 'strong' : x > 0.2 ? 'medium' : 'weak', rfs = panels.filter(p => p.spots).map(p => `<div><b>${tlc.compare && tlc.sets.length > 1 ? tlcLetter(p.i) + ' ' + esc(p.s.name) : TLC_LABEL[p.key]}</b>: ${p.spots.length ? p.spots.map(x => `Rf ${x.rf.toFixed(2)} (${word(x.strength)})`).join(', ') : 'no spots found'}</div>`).join('');
        overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="pvTitle"><div class="modal-head"><div class="mt" id="pvTitle">Well <b>${C.wellLabel(i)}</b> · TLC lane ${t}</div><button class="ib" data-act="closepreview" aria-label="Close" title="Close">✕</button></div><div class="modal-body"><p class="hint" style="margin:0 0 10px">${lines}${row ? ` · reaction ${row.global_index + 1}, vial ${i}` : ''}</p>${panels.length ? `<div class="tlcbig"><canvas id="tlcbig"></canvas></div><div class="hint" style="margin-top:8px">${cap}${panels.some(p => p.lane.zeroRf != null) ? ' · yellow ticks mark the spot origin, pink ticks the spots found' : ''}</div>${rfs ? `<div class="hint tlcrfs">${rfs}</div>` : ''}` : '<p>No lane picture for this well yet. Load a lane CSV and images first.</p>'}</div></div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) closePreview(); });
        prevFocus = document.activeElement; document.body.appendChild(overlay); document.addEventListener('keydown', escPreview, true);
        const big = overlay.querySelector('#tlcbig'); if (big) tlcDraw(big, panels, 1);
        const box = overlay.querySelector('.tlcbig'); if (box) box.scrollTop = box.scrollHeight;   // start at the spot origin
      }
      // tlc_rf_table.csv: one line per lane of every set, with the vial recipe, the front used, and up to 5 spots (Rf and strength).
      async function tlcRfCsv() {
        const codes = S.reagents.map(r => r.code), head = ['set', 'plate', 'well', 'tlc_lane', 'reaction', ...codes.map(c => c + '_mM'), 'solvent_uL', 'image', 'origin_px', 'front_px', 'spots'];
        for (let n = 1; n <= 5; n++) head.push('rf_' + n, 'strength_' + n);
        const rows = [head];
        for (const set of tlc.sets) {
          const key = tlcPrimary(set); if (!set.cfg || !key) continue;
          for (const l of [...set.cfg.lanes].sort((a, b) => a.id - b.id)) {
            if (l.id < 0 || l.id > 53) continue; const i = C.containerOfLane(l.id), row = tlcRow(i), sp = tlcSpots(set, key, l); if (!sp) continue;
            const r = [set.name, tlc.plate, C.wellLabel(i), l.id, row ? row.global_index + 1 : '', ...codes.map(c => { const rc = row && row.recipe.find(x => x.code === c); return rc ? +rc.target_concentration.toFixed(4) : ''; }), row ? +(+row['vol#solvent']).toFixed(2) : '', TLC_LABEL[key], Math.round(l.zeroRf), tlcFront(set, l), sp.length];
            for (let n = 0; n < 5; n++) r.push(sp[n] ? +sp[n].rf.toFixed(3) : '', sp[n] ? +sp[n].strength.toFixed(2) : '');
            rows.push(r);
          }
        }
        if (rows.length < 2) { toast('Nothing to export yet. Load a microadjusted lane CSV and images first.'); return; }
        if (await saveFile('tlc_rf_table_' + safe(S.name) + '.csv', C.csvText(rows))) toast('Saved the Rf table.');
      }
      document.addEventListener('click', e => {
        const b = e.target.closest('[data-tact]'); if (!b) return;
        const a = b.dataset.tact;
        if (a === 'pickcsv') { const f = $('#tlcCsv'); if (f) f.click(); }
        else if (a === 'pickimg') { const f = $('#tlcImg'); if (f) f.click(); }
        else if (a === 'open') tlcOpen(+b.dataset.i);
        else if (a === 'rfcsv') tlcRfCsv();
        else if (a === 'setsel') { tlc.cur = +b.dataset.i; tlcPersist(); render(); }
        else if (a === 'setadd') { tlc.sets.push(tlcNewSet(tlc.sets.length + 1)); tlc.cur = tlc.sets.length - 1; tlcPersist(); render(); }
        else if (a === 'setdel') { const s = tlcCur(); Object.values(s.imgs).forEach(im => im.bmp.close && im.bmp.close()); tlc.sets.splice(tlc.cur, 1); tlc.cur = Math.max(0, tlc.cur - 1); if (tlc.sets.length < 2) tlc.compare = false; tlcPersist(); toast(`Removed "${s.name}".`); render(); }
      });
      document.addEventListener('change', e => {
        const t = e.target; if (!t) return;
        if (t.id === 'tlcCsv' && t.files[0]) { const f = t.files[0]; t.value = ''; tlcLoadCsv(f); }
        else if (t.id === 'tlcImg' && t.files.length) { const fs = [...t.files]; t.value = ''; toast('Reading images…'); tlcLoadImages(fs); }
        else if (t.dataset && t.dataset.tlc === 'show') { tlc.show[t.dataset.k2] = t.checked; render(); }
        else if (t.dataset && t.dataset.tlc === 'plate') { tlc.plate = +t.value; tlcPersist(); render(); }
        else if (t.dataset && t.dataset.tlc === 'frameW') { const v = +t.value; if (v >= 100) { tlcCur().frameW = v; tlcReset(tlcCur()); tlcPersist(); render(); } }
        else if (t.dataset && t.dataset.tlc === 'front') { const v = +t.value; tlcCur().frontPx = v > 0 ? v : null; tlcReset(tlcCur()); tlcPersist(); render(); }
        else if (t.dataset && t.dataset.tlc === 'rf') { tlc.rf = t.checked; render(); }
        else if (t.dataset && t.dataset.tlc === 'setname') { tlcCur().name = t.value.trim() || 'Set ' + (tlc.cur + 1); tlcPersist(); render(); }
        else if (t.dataset && t.dataset.tlc === 'compare') { tlc.compare = t.checked; tlcPersist(); render(); }
        else if (t.dataset && t.dataset.tlc === 'cmpkey') { tlc.cmpKey = t.value; tlcPersist(); render(); }
      });
      document.addEventListener('input', e => {
        const t = e.target; if (t && t.dataset && t.dataset.tlc === 'zoom') { tlc.zoom = +t.value; const g = document.getElementById('tlcgrid'); if (g) { g.innerHTML = tlcCells(); tlcPaint(); } }
      });
