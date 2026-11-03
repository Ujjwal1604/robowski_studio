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
      // ---- Spots and Rf from a lane brightness profile ---------------------------------------------------------
      // A profile is the lane's brightness, one number per pixel from the start of the lane (index 0) to the far end.
      const movingAvg = (a, w) => { const h = w >> 1, out = new Array(a.length); let s = 0, n = 0, lo = 0, hi = -1; for (let i = 0; i < a.length; i++) { while (hi < Math.min(a.length - 1, i + h)) { hi++; s += a[hi]; n++; } while (lo < i - h) { s -= a[lo]; lo++; n--; } out[i] = s / n; } return out; };
      const pctile = (a, p) => { const b = Array.from(a).sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.max(0, Math.round(p * (b.length - 1))))]; };
      // The solvent front shows up as a bright band near the far end of the lane under UV 365 nm: the brightest point in the last 30%.
      function detectFront(profile) { const sm = movingAvg(profile, 9), lo = Math.floor(profile.length * 0.7); let best = lo; for (let i = lo; i < sm.length; i++) if (sm[i] > sm[best]) best = i; return best; }
      // Find spots in a lane profile. sign -1: spots are dark (UV 254 nm, visible), +1: spots are bright (UV 365 nm).
      // origin / front: pixel positions of the spot origin and solvent front. Returns spots between them (up to Rf 0.93) as { pos, rf, strength }, nearest the start first.
      // strength is the spot's size relative to the strongest feature in the lane (usually the origin spot), 0 to 1.
      function findSpots(profile, o) {
        const n = profile.length, sm = movingAvg(profile, 7), step = 5, win = 100, base = new Array(n), q = o.sign < 0 ? 0.9 : 0.1;
        const pts = []; for (let i = 0; i < n; i += step) pts.push([i, pctile(sm.slice(Math.max(0, i - win), Math.min(n, i + win + 1)), q)]); pts.push([n - 1, pts[pts.length - 1][1]]);
        for (let j = 0, i = 0; i < n; i++) { while (j < pts.length - 2 && pts[j + 1][0] < i) j++; const [x0, y0] = pts[j], [x1, y1] = pts[j + 1]; base[i] = x1 === x0 ? y0 : y0 + (y1 - y0) * (i - x0) / (x1 - x0); }
        const d = sm.map((v, i) => o.sign < 0 ? base[i] - v : v - base[i]), r = o.radius || 24, from = Math.round(o.origin - r), start = Math.round(o.origin + r * 1.2), end = Math.round(o.origin + 0.93 * (o.front - o.origin));   // the last 7%: the front itself leaves a band there, not a compound
        const all = d.slice(Math.max(0, from), Math.min(n, end)), dmax = Math.max(...all, 1e-9);
        const med = pctile(d, 0.5), noise = 1.4826 * pctile(d.map(v => Math.abs(v - med)), 0.5), thr = Math.max(4 * noise, 0.06 * dmax), spots = [];
        for (let i = Math.max(start, 1); i < Math.min(end, n - 1); i++) {
          if (d[i] < thr) continue; let top = true; for (let k = Math.max(0, i - 12); k <= Math.min(n - 1, i + 12); k++) if (d[k] > d[i] || (d[k] === d[i] && k < i)) { top = false; break; }
          if (top) spots.push({ pos: i, rf: (i - o.origin) / (o.front - o.origin), strength: Math.min(1, d[i] / dmax) });
        }
        return spots;
      }
