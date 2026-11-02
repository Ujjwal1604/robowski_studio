      // APP 45 - TLC map: upload the lane CSV and the aligned plate images, get a 6 x 9 map of the vial plate where every
      // well shows its own TLC lane (cut out of the aligned image) next to its recipe. Nothing is saved or uploaded: the
      // files stay in this browser tab. Lane maths is in engine/46-tlc-lanes.js; styles are in style/04-tlc-map.css.
      // To change what a cell shows, edit tlcCell(); to change how a lane is drawn, edit tlcDraw().
      const TLC_KEYS = ['UV254', 'White', 'UV366'];                                   // panel order, left to right
      const TLC_LABEL = { UV254: 'UV 254 nm', White: 'Visible', UV366: 'UV 365 nm' };
      let tlc = { cfg: null, cfgName: '', frameW: C.LANE_FRAME_WIDTH, imgs: {}, zoom: 0.45, plate: 0, show: { UV254: true, White: true, UV366: true } };

      // Work out which panel an image file belongs to from its name (…UV254…, …UV366…, …White…); otherwise the first free panel.
      function tlcKeyOf(name) {
        if (/254/.test(name)) return 'UV254';
        if (/36[56]|uv.?3/i.test(name)) return 'UV366';
        if (/white|visible|vis\b|day/i.test(name)) return 'White';
        return ['UV254', 'UV366', 'White'].find(k => !tlc.imgs[k]) || null;   // no hint in the name: fill UV254, UV366, White in that order
      }
      async function tlcLoadCsv(f) {
        try { const p = C.parseLaneConfig(await f.text()); tlc.cfg = p; tlc.cfgName = f.name; toast(`Read ${p.lanes.length} lanes from ${f.name}.` + (p.warnings.length ? ' ' + p.warnings[0] : '')); }
        catch (e) { toast('Could not read the lane file: ' + e.message); }
        render();
      }
      async function tlcLoadImages(files) {
        let n = 0;
        for (const f of files) {
          const key = tlcKeyOf(f.name); if (!key) { toast(`${f.name}: could not tell which image this is (UV254, White or UV366). Put that in the file name.`); continue; }
          try { const bmp = await createImageBitmap(f); if (tlc.imgs[key] && tlc.imgs[key].bmp.close) tlc.imgs[key].bmp.close(); tlc.imgs[key] = { name: f.name, bmp }; n++; }
          catch (e) { toast(`Could not open ${f.name}: ${e.message || e}`); }
        }
        if (n) toast(`Loaded ${n} image${n === 1 ? '' : 's'}.`); render();
      }
      const tlcShownKeys = () => TLC_KEYS.filter(k => tlc.imgs[k] && tlc.show[k]);
      const tlcLaneById = t => tlc.cfg && tlc.cfg.lanes.find(l => l.id === t);
      // Draw one lane, upright (starting line at the bottom), once per shown image panel. k = screen px per frame px.
      function tlcDraw(canvas, lane, k) {
        const keys = tlcShownKeys(); if (!keys.length) return;
        const pw = Math.round(k * lane.width), ph = Math.round(k * lane.length), gap = Math.max(3, Math.round(k * 6)), dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssW = keys.length * pw + (keys.length - 1) * gap;
        canvas.width = cssW * dpr; canvas.height = ph * dpr; canvas.style.width = cssW + 'px'; canvas.style.height = ph + 'px';
        const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
        keys.forEach((key, j) => {
          const im = tlc.imgs[key], m = C.laneMatrix(lane, im.bmp.width / tlc.frameW, k), x = j * (pw + gap);
          ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.beginPath(); ctx.rect(x, 0, pw, ph); ctx.clip();
          ctx.setTransform(dpr * m[0], dpr * m[1], dpr * m[2], dpr * m[3], dpr * (m[4] + x), dpr * m[5]); ctx.drawImage(im.bmp, 0, 0); ctx.restore();
          if (lane.zeroRf != null) {   // small ticks at both edges where the spot origin is
            ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.strokeStyle = '#FFC857'; ctx.lineWidth = 1.5; const y = k * (lane.length - lane.zeroRf);
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y); ctx.moveTo(x + pw - 5, y); ctx.lineTo(x + pw, y); ctx.stroke(); ctx.restore();
          }
        });
      }
      const tlcRow = i => run && run.rows.find(r => r.plate_number === tlc.plate && r.container_id === i);
      const tlcRecipe = row => row ? row.recipe.filter(rc => rc.target_concentration > 0).map(rc => { const ci = S.reagents.findIndex(r => r.code === rc.code); return `<span title="${esc(rc.code)}"><i style="background:${rcol(ci < 0 ? 0 : ci)}"></i>${nf(rc.target_concentration, 3)}</span>`; }).join('') : '<span class="mut">no vial</span>';
      // One well of the map: well name, lane number, the lane picture, and the target concentrations (mM) of that vial.
      function tlcCell(i) {
        const t = C.tlcLane(i, 'column'), lane = tlcLaneById(t), row = tlcRow(i);
        return `<button class="tlccell" data-tact="open" data-i="${i}" aria-label="Well ${C.wellLabel(i)}, TLC lane ${t}. Open larger view"><div class="tch"><b>${C.wellLabel(i)}</b><span>lane ${t}</span></div>${lane && tlcShownKeys().length ? `<canvas data-i="${i}"></canvas>` : `<div class="tcempty">${lane ? 'no image' : 'no lane'}</div>`}<div class="tcr">${tlcRecipe(row)}</div></button>`;
      }
      function tlcView() {
        const have = tlcShownKeys().length, plates = run ? run.plates : 1, p = tlc.cfg;
        const imgChips = TLC_KEYS.map(k => tlc.imgs[k] ? `<label class="chip"><input type="checkbox" data-tlc="show" data-k2="${k}" ${tlc.show[k] ? 'checked' : ''}> ${TLC_LABEL[k]} <span class="mut">${esc(tlc.imgs[k].name.length > 26 ? '…' + tlc.imgs[k].name.slice(-24) : tlc.imgs[k].name)}</span></label>` : '').join('');
        return `<div class="card tlcctl"><h2>TLC map</h2><p class="sub">Each well of the vial plate is shown with its TLC lane. Lanes are numbered column by column (A1, B1 … F1, A2 …) while the robot fills row by row, so the lane number differs from the vial number. Files stay in this browser tab.</p>
 <div class="tlcbtns"><button class="btn" data-tact="pickcsv">${p ? 'Replace lane CSV' : 'Choose lane CSV'}</button><button class="btn" data-tact="pickimg">${have ? 'Add or replace images' : 'Choose plate images'}</button>
 <label class="tlcz">Zoom <input type="range" min="0.25" max="0.9" step="0.05" value="${tlc.zoom}" data-tlc="zoom" aria-label="Zoom"></label>
 ${plates > 1 ? `<label class="tlcz">Plate <select class="f" data-tlc="plate">${[...Array(plates).keys()].map(x => `<option value="${x}" ${x === tlc.plate ? 'selected' : ''}>${x}</option>`).join('')}</select></label>` : ''}</div>
 <div class="tlcstat">${p ? `<span class="chip ok">${p.lanes.length} lanes · ${esc(tlc.cfgName)}${p.hasZeroRf ? ' · microadjusted' : ''}</span>` : '<span class="chip warn">No lane CSV yet</span>'}${imgChips || '<span class="chip warn">No images yet</span>'}</div>
 <details class="det" style="margin-top:10px"><summary>Image settings</summary><div class="tlcset"><label class="lbl">Frame width the lane coordinates refer to (px)</label><input type="number" class="f mono" data-tlc="frameW" value="${tlc.frameW}" style="max-width:140px"><div class="hint" style="margin-top:4px">3280 for the aligned images from the lane tool. Smaller copies of the same images work automatically.</div></div></details>
 <input type="file" id="tlcCsv" accept=".csv,.txt" hidden><input type="file" id="tlcImg" accept="image/png,image/jpeg,image/webp" multiple hidden></div>
 <div class="tlcwrap"><div class="tlcgrid" id="tlcgrid">${[...Array(54).keys()].map(tlcCell).join('')}</div></div>`;
      }
      function tlcPaint() {
        const grid = document.getElementById('tlcgrid'); if (!grid) return;
        grid.querySelectorAll('canvas[data-i]').forEach(cv => { const lane = tlcLaneById(C.tlcLane(+cv.dataset.i, 'column')); if (lane) tlcDraw(cv, lane, tlc.zoom * (lane.width ? 1 : 1)); });
      }
      // Larger view of one well: all panels at full size, the recipe, and the lane numbers.
      function tlcOpen(i) {
        const t = C.tlcLane(i, 'column'), lane = tlcLaneById(t), row = tlcRow(i); closePreview();
        const overlay = document.createElement('div'); overlay.id = 'previewModal'; overlay.className = 'modal-overlay';
        const lines = row ? row.recipe.filter(rc => rc.target_concentration > 0).map(rc => `${esc(rc.code)} ${nf(rc.target_concentration, 3)} mM`).concat([`solvent ${nf(row['vol#solvent'], 1)} µL`]).join(' · ') : 'No vial in this well for the current run.';
        overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="pvTitle"><div class="modal-head"><div class="mt" id="pvTitle">Well <b>${C.wellLabel(i)}</b> · TLC lane ${t}</div><button class="ib" data-act="closepreview" aria-label="Close" title="Close">✕</button></div><div class="modal-body"><p class="hint" style="margin:0 0 10px">${lines}${row ? ` · reaction ${row.global_index + 1}, vial ${i}` : ''}</p>${lane ? `<div class="tlcbig"><canvas id="tlcbig"></canvas></div><div class="hint" style="margin-top:8px">${tlcShownKeys().map(k => TLC_LABEL[k]).join(' · ') || 'Load images to see the lane.'}${lane.zeroRf != null ? ' · yellow ticks mark the spot origin' : ''}</div>` : '<p>This lane is not in the lane CSV.</p>'}</div></div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) closePreview(); });
        prevFocus = document.activeElement; document.body.appendChild(overlay); document.addEventListener('keydown', escPreview, true);
        const big = overlay.querySelector('#tlcbig'); if (big && lane) tlcDraw(big, lane, 1); const box = overlay.querySelector('.tlcbig'); if (box) box.scrollTop = box.scrollHeight;   // start at the spot origin
      }
      document.addEventListener('click', e => {
        const b = e.target.closest('[data-tact]'); if (!b) return;
        const a = b.dataset.tact;
        if (a === 'pickcsv') { const f = $('#tlcCsv'); if (f) f.click(); }
        else if (a === 'pickimg') { const f = $('#tlcImg'); if (f) f.click(); }
        else if (a === 'open') tlcOpen(+b.dataset.i);
      });
      document.addEventListener('change', e => {
        const t = e.target; if (!t) return;
        if (t.id === 'tlcCsv' && t.files[0]) { const f = t.files[0]; t.value = ''; tlcLoadCsv(f); }
        else if (t.id === 'tlcImg' && t.files.length) { const fs = [...t.files]; t.value = ''; toast('Reading images…'); tlcLoadImages(fs); }
        else if (t.dataset && t.dataset.tlc === 'show') { tlc.show[t.dataset.k2] = t.checked; render(); }
        else if (t.dataset && t.dataset.tlc === 'plate') { tlc.plate = +t.value; render(); }
        else if (t.dataset && t.dataset.tlc === 'frameW') { const v = +t.value; if (v >= 100) { tlc.frameW = v; render(); } }
      });
      document.addEventListener('input', e => {
        const t = e.target; if (t && t.dataset && t.dataset.tlc === 'zoom') { tlc.zoom = +t.value; const g = document.getElementById('tlcgrid'); if (g) { g.innerHTML = [...Array(54).keys()].map(tlcCell).join(''); tlcPaint(); } }
      });
