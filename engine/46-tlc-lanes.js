      // ENGINE 46 - TLC lane images: read the lane config CSV and work out where each lane sits in the aligned plate image.
      // The lane config (lane_config.csv / microadjusted_lane_config.csv) comes from the TLC analysis. One row per lane:
      //   id, x0, y0, length, width, direction_angle [, spot_radius_px, px_location_of_zero_rf]
      // (x0, y0) is the middle of the lane at the starting line, the lane runs `length` px from there in the direction
      // `direction_angle` (0 = straight up the image, 180 = straight down), and `width` is the strip width, all in the pixel
      // frame of the aligned image (3280 x 2464 for the plates so far). px_location_of_zero_rf is the distance from the
      // start of the lane to the spot origin.
      const LANE_FRAME_WIDTH = 3280;
      function parseLaneConfig(text) {
        const rows = parseDelimited(text).filter(r => r.some(c => String(c).trim() !== ''));
        if (rows.length < 2) throw new Error('The lane file has no rows.');
        const head = rows[0].map(h => String(h).trim().toLowerCase()), col = n => head.indexOf(n);
        for (const n of ['id', 'x0', 'y0', 'length', 'width', 'direction_angle']) if (col(n) < 0) throw new Error(`The lane file needs a "${n}" column (found: ${head.filter(Boolean).join(', ') || 'none'}).`);
        const num = (r, n, i) => { const k = col(n); if (k < 0) return null; const v = r[k] === '' || r[k] == null ? NaN : +r[k]; if (!isFinite(v)) { if (n === 'spot_radius_px' || n === 'px_location_of_zero_rf') return null; throw new Error(`Row ${i + 2}: "${n}" is not a number.`); } return v; };
        const lanes = rows.slice(1).map((r, i) => ({ id: num(r, 'id', i), x0: num(r, 'x0', i), y0: num(r, 'y0', i), length: num(r, 'length', i), width: num(r, 'width', i), angle: num(r, 'direction_angle', i), spotRadius: num(r, 'spot_radius_px', i), zeroRf: num(r, 'px_location_of_zero_rf', i) }));
        if (lanes.some(l => l.length <= 0 || l.width <= 0)) throw new Error('Every lane needs a length and width above zero.');
        return { lanes, hasZeroRf: lanes.every(l => l.zeroRf != null), warnings: lanes.length > 54 ? [`${lanes.length} lanes found; only the first 54 fit a 6 x 9 plate.`] : [] };
      }
      // Which vial (index within the plate, row by row) sits in TLC lane t: the inverse of tlcLane().
      function containerOfLane(t) { const c = Math.floor(t / TLC_ROWS), r = t % TLC_ROWS; return r * TLC_COLS + c; }
      // Canvas transform [a, b, c, d, e, f] that draws the aligned image so this lane appears upright (starting line at the
      // bottom, solvent front at the top), k output px per frame px, imgScale = image width / frame width.
      function laneMatrix(l, imgScale, k) {
        const th = l.angle * Math.PI / 180, dx = Math.sin(th), dy = -Math.cos(th), nx = Math.cos(th), ny = Math.sin(th), kk = k / imgScale, ox = imgScale * l.x0, oy = imgScale * l.y0;
        return [kk * nx, -kk * dx, kk * ny, -kk * dy, k * l.width / 2 - kk * (nx * ox + ny * oy), k * l.length + kk * (dx * ox + dy * oy)];
      }
