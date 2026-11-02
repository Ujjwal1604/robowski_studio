      // APP 45 - TLC map: upload a lane CSV and the aligned plate images, get a 6 x 9 map of the vial plate where every well
      // shows its own TLC lane (cut out of the aligned image) next to its recipe. You can load several TLC sets (for example
      // the same plate run in different solvent systems), switch between them, or compare them side by side for every well.
      // Nothing is saved or uploaded: the files stay in this browser tab. Lane maths is in engine/46-tlc-lanes.js; styles are
      // in style/04-tlc-map.css. To change what a cell shows, edit tlcCell(); to change how lanes are drawn, edit tlcDraw().
      const TLC_KEYS = ['UV254', 'White', 'UV366'];                                   // panel order, left to right
      const TLC_LABEL = { UV254: 'UV 254 nm', White: 'Visible', UV366: 'UV 365 nm' };
      const tlcNewSet = n => ({ name: 'Set ' + n, cfg: null, cfgName: '', frameW: C.LANE_FRAME_WIDTH, imgs: {} });
      // sets: one entry per TLC run (own lane CSV + images). cur: the set shown. compare: show every set side by side, one panel type (cmpKey).
      let tlc = { sets: [tlcNewSet(1)], cur: 0, compare: false, cmpKey: 'UV254', zoom: 0.45, plate: 0, show: { UV254: true, White: true, UV366: true } };
      const tlcCur = () => tlc.sets[tlc.cur];
      const tlcLetter = i => String.fromCharCode(65 + i);

      // Work out which panel an image file belongs to from its name (…UV254…, …UV366…, …White…); otherwise the first free panel.
      function tlcKeyOf(name, set) {
        if (/254/.test(name)) return 'UV254';
        if (/36[56]|uv.?3/i.test(name)) return 'UV366';
        if (/white|visible|vis\b|day/i.test(name)) return 'White';
        return ['UV254', 'UV366', 'White'].find(k => !set.imgs[k]) || null;   // no hint in the name: fill UV254, UV366, White in that order
      }
      async function tlcLoadCsv(f) {
        const set = tlcCur();
        try { const p = C.parseLaneConfig(await f.text()); set.cfg = p; set.cfgName = f.name; toast(`Read ${p.lanes.length} lanes from ${f.name}.` + (p.warnings.length ? ' ' + p.warnings[0] : '')); }
        catch (e) { toast('Could not read the lane file: ' + e.message); }
        render();
      }
      async function tlcLoadImages(files) {
        const set = tlcCur(); let n = 0;
        for (const f of files) {
          const key = tlcKeyOf(f.name, set); if (!key) { toast(`${f.name}: could not tell which image this is (UV254, White or UV366). Put that in the file name.`); continue; }
          try { const bmp = await createImageBitmap(f); if (set.imgs[key] && set.imgs[key].bmp.close) set.imgs[key].bmp.close(); set.imgs[key] = { name: f.name, bmp }; n++; }
          catch (e) { toast(`Could not open ${f.name}: ${e.message || e}`); }
        }
        if (n) toast(`Loaded ${n} image${n === 1 ? '' : 's'}.`); render();
      }
      const tlcLaneOf = (set, t) => set.cfg && set.cfg.lanes.find(l => l.id === t);
      // The picture panels to draw for TLC lane t: the shown images of the current set, or (compare mode) one panel per set.
      function tlcPanels(t) {
        if (tlc.compare && tlc.sets.length > 1) return tlc.sets.map((s, i) => ({ s, i, key: tlc.cmpKey, lane: tlcLaneOf(s, t), label: tlcLetter(i) })).filter(p => p.lane && p.s.imgs[p.key]);
        const s = tlcCur(); return TLC_KEYS.filter(k => s.imgs[k] && tlc.show[k]).map(k => ({ s, i: tlc.cur, key: k, lane: tlcLaneOf(s, t), label: '' })).filter(p => p.lane);
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
          if (p.label) { ctx.font = '600 11px sans-serif'; ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x, 0, 14, 15); ctx.fillStyle = '#fff'; ctx.fillText(p.label, x + 3, 12); }
          ctx.restore(); x += w + gap;
        });
      }
      const tlcRow = i => run && run.rows.find(r => r.plate_number === tlc.plate && r.container_id === i);
      const tlcRecipe = row => row ? row.recipe.filter(rc => rc.target_concentration > 0).map(rc => { const ci = S.reagents.findIndex(r => r.code === rc.code); return `<span title="${esc(rc.code)}"><i style="background:${rcol(ci < 0 ? 0 : ci)}"></i>${nf(rc.target_concentration, 3)}</span>`; }).join('') : '<span class="mut">no vial</span>';
      // One well of the map: well name, lane number, the lane picture, and the target concentrations (mM) of that vial.
      function tlcCell(i) {
        const t = C.tlcLane(i, 'column'), row = tlcRow(i), has = tlcPanels(t).length > 0;
        return `<button class="tlccell" data-tact="open" data-i="${i}" aria-label="Well ${C.wellLabel(i)}, TLC lane ${t}. Open larger view"><div class="tch"><b>${C.wellLabel(i)}</b><span>lane ${t}</span></div>${has ? `<canvas data-i="${i}"></canvas>` : `<div class="tcempty">${tlcCur().cfg ? 'no image' : 'no lane'}</div>`}<div class="tcr">${tlcRecipe(row)}</div></button>`;
      }
      const tlcCells = () => [...Array(54).keys()].map(tlcCell).join('');
      function tlcView() {
        const s = tlcCur(), p = s.cfg, have = TLC_KEYS.some(k => s.imgs[k]), plates = run ? run.plates : 1, multi = tlc.sets.length > 1;
        const imgChips = TLC_KEYS.map(k => s.imgs[k] ? `<label class="chip"><input type="checkbox" data-tlc="show" data-k2="${k}" ${tlc.show[k] ? 'checked' : ''}> ${TLC_LABEL[k]} <span class="mut">${esc(s.imgs[k].name.length > 26 ? '…' + s.imgs[k].name.slice(-24) : s.imgs[k].name)}</span></label>` : '').join('');
        const tabs = tlc.sets.map((x, i) => `<button class="tlcsetbtn ${i === tlc.cur ? 'on' : ''}" data-tact="setsel" data-i="${i}" aria-pressed="${i === tlc.cur}">${multi ? `<b>${tlcLetter(i)}</b> ` : ''}${esc(x.name)}</button>`).join('');
        return `<div class="card tlcctl"><h2>TLC map</h2><p class="sub">Each well of the vial plate is shown with its TLC lane. Lanes are numbered column by column (A1, B1 … F1, A2 …) while the robot fills row by row, so the lane number differs from the vial number. Files stay in this browser tab.</p>
 <div class="tlcsets" role="group" aria-label="TLC sets">${tabs}<button class="btn sm" data-tact="setadd">+ Add set</button></div>
 <div class="tlcbtns"><label class="tlcz">Name <input type="text" class="f" data-tlc="setname" value="${esc(s.name)}" maxlength="40" style="width:210px" placeholder="e.g. 50% EtOAc in hexane"></label>${multi ? '<button class="btn sm" data-tact="setdel">Remove this set</button>' : ''}</div>
 <div class="tlcbtns"><button class="btn" data-tact="pickcsv">${p ? 'Replace lane CSV' : 'Choose lane CSV'}</button><button class="btn" data-tact="pickimg">${have ? 'Add or replace images' : 'Choose plate images'}</button>
 <label class="tlcz">Zoom <input type="range" min="0.25" max="0.9" step="0.05" value="${tlc.zoom}" data-tlc="zoom" aria-label="Zoom"></label>
 ${plates > 1 ? `<label class="tlcz">Plate <select class="f" data-tlc="plate">${[...Array(plates).keys()].map(x => `<option value="${x}" ${x === tlc.plate ? 'selected' : ''}>${x}</option>`).join('')}</select></label>` : ''}</div>
 <div class="tlcstat">${p ? `<span class="chip ok">${p.lanes.length} lanes · ${esc(s.cfgName)}${p.hasZeroRf ? ' · microadjusted' : ''}</span>` : '<span class="chip warn">No lane CSV yet</span>'}${imgChips || '<span class="chip warn">No images yet</span>'}</div>
 ${multi ? `<div class="tlcbtns" style="margin-top:12px"><label class="tlcz"><input type="checkbox" data-tlc="compare" ${tlc.compare ? 'checked' : ''}> Compare sets side by side</label>${tlc.compare ? `<label class="tlcz">Image <select class="f" data-tlc="cmpkey" style="min-width:130px">${TLC_KEYS.map(k => `<option value="${k}" ${k === tlc.cmpKey ? 'selected' : ''}>${TLC_LABEL[k]}</option>`).join('')}</select></label><span class="hint" style="margin:0">${tlc.sets.map((x, i) => `<b>${tlcLetter(i)}</b> ${esc(x.name)}`).join(' · ')}</span>` : ''}</div>` : ''}
 <details class="det" style="margin-top:10px"><summary>Image settings (this set)</summary><div class="tlcset"><label class="lbl">Frame width the lane coordinates refer to (px)</label><input type="number" class="f mono" data-tlc="frameW" value="${s.frameW}" style="max-width:140px"><div class="hint" style="margin-top:4px">3280 for the aligned images from the lane tool. Smaller copies of the same images work automatically.</div></div></details>
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
        overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="pvTitle"><div class="modal-head"><div class="mt" id="pvTitle">Well <b>${C.wellLabel(i)}</b> · TLC lane ${t}</div><button class="ib" data-act="closepreview" aria-label="Close" title="Close">✕</button></div><div class="modal-body"><p class="hint" style="margin:0 0 10px">${lines}${row ? ` · reaction ${row.global_index + 1}, vial ${i}` : ''}</p>${panels.length ? `<div class="tlcbig"><canvas id="tlcbig"></canvas></div><div class="hint" style="margin-top:8px">${cap}${panels.some(p => p.lane.zeroRf != null) ? ' · yellow ticks mark the spot origin' : ''}</div>` : '<p>No lane picture for this well yet. Load a lane CSV and images first.</p>'}</div></div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) closePreview(); });
        prevFocus = document.activeElement; document.body.appendChild(overlay); document.addEventListener('keydown', escPreview, true);
        const big = overlay.querySelector('#tlcbig'); if (big) tlcDraw(big, panels, 1);
        const box = overlay.querySelector('.tlcbig'); if (box) box.scrollTop = box.scrollHeight;   // start at the spot origin
      }
      document.addEventListener('click', e => {
        const b = e.target.closest('[data-tact]'); if (!b) return;
        const a = b.dataset.tact;
        if (a === 'pickcsv') { const f = $('#tlcCsv'); if (f) f.click(); }
        else if (a === 'pickimg') { const f = $('#tlcImg'); if (f) f.click(); }
        else if (a === 'open') tlcOpen(+b.dataset.i);
        else if (a === 'setsel') { tlc.cur = +b.dataset.i; render(); }
        else if (a === 'setadd') { tlc.sets.push(tlcNewSet(tlc.sets.length + 1)); tlc.cur = tlc.sets.length - 1; render(); }
        else if (a === 'setdel') { const s = tlcCur(); Object.values(s.imgs).forEach(im => im.bmp.close && im.bmp.close()); tlc.sets.splice(tlc.cur, 1); tlc.cur = Math.max(0, tlc.cur - 1); if (tlc.sets.length < 2) tlc.compare = false; toast(`Removed "${s.name}".`); render(); }
      });
      document.addEventListener('change', e => {
        const t = e.target; if (!t) return;
        if (t.id === 'tlcCsv' && t.files[0]) { const f = t.files[0]; t.value = ''; tlcLoadCsv(f); }
        else if (t.id === 'tlcImg' && t.files.length) { const fs = [...t.files]; t.value = ''; toast('Reading images…'); tlcLoadImages(fs); }
        else if (t.dataset && t.dataset.tlc === 'show') { tlc.show[t.dataset.k2] = t.checked; render(); }
        else if (t.dataset && t.dataset.tlc === 'plate') { tlc.plate = +t.value; render(); }
        else if (t.dataset && t.dataset.tlc === 'frameW') { const v = +t.value; if (v >= 100) { tlcCur().frameW = v; render(); } }
        else if (t.dataset && t.dataset.tlc === 'setname') { tlcCur().name = t.value.trim() || 'Set ' + (tlc.cur + 1); render(); }
        else if (t.dataset && t.dataset.tlc === 'compare') { tlc.compare = t.checked; render(); }
        else if (t.dataset && t.dataset.tlc === 'cmpkey') { tlc.cmpKey = t.value; render(); }
      });
      document.addEventListener('input', e => {
        const t = e.target; if (t && t.dataset && t.dataset.tlc === 'zoom') { tlc.zoom = +t.value; const g = document.getElementById('tlcgrid'); if (g) { g.innerHTML = tlcCells(); tlcPaint(); } }
      });
