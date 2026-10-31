// Robowski Studio engine regression suite. Evaluated inside the built page by run.py (needs a real DOMParser/Blob).
(async () => {
  const C = RobowskiCore, out = [];
  const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;
  const mk = (o = {}) => ({ reagents: [{ code: 'A', name: 'a', molarMass: 200, density: 0, stock: 300, solvent: 'ethanol' }, { code: 'B', name: 'b', molarMass: 100, density: 0, stock: 300, solvent: 'ethanol' }], customRows: [[50, 50], [100, 30]], mode: 'concentration', hood: 'left', vialVolume: 500, threshold: 50, dilutionFactor: 5, reactionSolvent: 'ethanol', leftoverMl: 2, flaskSizes: [2, 5, 10, 20, 50, 100], randomize: false, randomSeed: 1, ...o });
  const t = async (name, fn) => { try { const m = await fn(); out.push({ name, ok: m === undefined || m === true, msg: typeof m === 'string' ? m : '' }); } catch (e) { out.push({ name, ok: false, msg: String(e && e.message || e) }); } };
  const need = (c, m) => { if (!c) throw new Error(m); };

  await t('concentration volumes = vial x target / stock', () => { const r = C.buildRun(mk()), w = r.rows[0]; need(near(w['vol#A'], 83.3333) && near(w['vol#B'], 83.3333) && near(w['vol#solvent'], 333.3333), JSON.stringify(w).slice(0, 200)); need(near(r.rows[1]['vol#A'], 166.667), 'row1 A'); });
  await t('threshold boundary: exactly 50 uL stays direct, 49.9 uL is diluted', () => {
    const r = C.buildRun(mk({ customRows: [[30, 30], [29.9, 30]] }));
    const a = r.rows[0].recipe[0], b = r.rows[1].recipe[0];
    need(a.stock_key === 'A' && near(a.transfer_volume, 50, 1e-6), 'at 50 uL should be direct: ' + a.stock_key + ' ' + a.transfer_volume);
    need(/_N/.test(b.stock_key), 'below threshold should dilute: ' + b.stock_key);
  });
  await t('diluted stock gives the requested final concentration', () => {
    const r = C.buildRun(mk({ customRows: [[25, 50]] })), a = r.rows[0].recipe[0];
    need(/_N$/.test(a.stock_key), 'expected one-stage dilution, got ' + a.stock_key);
    need(near(a.transfer_volume * a.stock_concentration / 500, 25, 1e-6), 'final conc ' + (a.transfer_volume * a.stock_concentration / 500));
  });
  await t('two-stage dilution (N^2) is used when one stage is still too small', () => {
    const r = C.buildRun(mk({ customRows: [[1.5, 50]] })), a = r.rows[0].recipe[0];
    need(/_N2$/.test(a.stock_key), 'got ' + a.stock_key); need(near(a.transfer_volume * a.stock_concentration / 500, 1.5, 1e-6), 'final conc');
  });
  await t('transfer over 2000 uL blocks, 1000-2000 uL warns', () => { const r = C.buildRun(mk({ vialVolume: 2000, customRows: [[400, 10]] })); need(r.blockingIssues > 0, 'no block'); const w = C.buildRun(mk({ vialVolume: 2000, customRows: [[200, 10]] })); need(w.blockingIssues === 0 && w.warningCount > 0, '1000-2000 uL should only warn'); });
  await t('negative solvent is a blocking issue', () => { const r = C.buildRun(mk({ customRows: [[300, 300]] })); need(r.blockingIssues > 0, 'no block'); });
  await t('plate boundary: 54 reactions = 1 plate, 55 = 2 plates', () => {
    const rows = n => Array.from({ length: n }, (_, i) => [40 + i % 5, 40]);
    const a = C.buildRun(mk({ customRows: rows(54) })), b = C.buildRun(mk({ customRows: rows(55) }));
    need(a.plates === 1 && b.plates === 2, a.plates + ' / ' + b.plates);
  });
  await t('seeded shuffle: same seed same order, other seed differs, same set of wells', () => {
    const rows = Array.from({ length: 30 }, (_, i) => [40 + i, 40]), key = r => r.rows.map(x => x['vol#A'].toFixed(3)).join(',');
    const a = C.buildRun(mk({ customRows: rows, randomize: true, randomSeed: 7 })), b = C.buildRun(mk({ customRows: rows, randomize: true, randomSeed: 7 })), c = C.buildRun(mk({ customRows: rows, randomize: true, randomSeed: 8 }));
    need(key(a) === key(b), 'not reproducible'); need(key(a) !== key(c), 'seed ignored');
    need([...a.rows.map(x => x['vol#A'].toFixed(3))].sort().join() === [...c.rows.map(x => x['vol#A'].toFixed(3))].sort().join(), 'different wells');
  });
  await t('stock prep volume is rounded up to the smallest volumetric flask', () => {
    const r = C.buildRun(mk({ customRows: [[50, 50]] })); const s = r.stocks.A; need(s.prep_volume_ml === 5, 'prep ' + s.prep_volume_ml);
    const r2 = C.buildRun(mk({ customRows: [[50, 50]], flaskSizes: [3, 8] })); need(r2.stocks.A.prep_volume_ml === 3, 'custom flasks ' + r2.stocks.A.prep_volume_ml);
  });
  await t('surface height calibration (bottle 20 mL = 1800, 10 mL = 1995)', () => { need(Math.abs(C.surfaceHeight('bottle', 20000) - 1800) <= 1 && Math.abs(C.surfaceHeight('bottle', 10000) - 1995) <= 1, C.surfaceHeight('bottle', 20000) + ' ' + C.surfaceHeight('bottle', 10000)); });
  await t('runtime estimate is an ordered range', () => { const r = C.buildRun(mk()).runtime; need(r.lowSeconds <= r.seconds && r.seconds <= r.highSeconds && / to /.test(r.label), r.label); });
  await t('deck: jar takes its whole plate, bottle solvent reserves the chosen position', () => {
    const st = () => ({ A: { dilution_level: 0 }, B: { dilution_level: 0 } });
    const j = C.assignDeckPositions('right', st(), { solventKind: 'jar', solventPlate: 4, solventPos: 0 }); need(j.stock_capacity === 8, 'jar cap ' + j.stock_capacity);
    const s = st(); const b = C.assignDeckPositions('right', s, { solventKind: 'bottle', solventPlate: 4, solventPos: 3 }); need(b.stock_capacity === 15, 'bottle cap ' + b.stock_capacity);
    const many = {}; for (let i = 0; i < 20; i++) many['S' + i] = { dilution_level: 0 }; const o = C.assignDeckPositions('right', many, { solventKind: 'bottle', solventPlate: 4, solventPos: 3 }); need(!o.positions_fit, 'overflow not flagged');
    const used = Object.values(many).filter(x => !x.deck_overflow).map(x => x.breadboard_plate_id + ':' + x.container_id); need(!used.includes('4:3') && new Set(used).size === used.length, 'collision or reserved slot used');
  });
  await t('CSV exports neutralise spreadsheet formulas in reagent names', () => {
    const r = C.buildRun(mk({ reagents: [{ code: 'A', name: '=HYPERLINK("x")', molarMass: 200, stock: 300, solvent: 'ethanol' }, { code: 'B', name: '@cmd', molarMass: 100, stock: 300, solvent: 'ethanol' }] }));
    const csv = C.stockCsv(r) + C.loadCsv(r); need(!/(^|,|\n)"?[=@]/.test(csv.replace(/^﻿/, '')), 'unguarded formula cell in csv');
  });
  await t('package contains a manifest with seed and runtime range', () => { const r = C.buildRun(mk({ randomSeed: 4242 })), txt = new TextDecoder('latin1').decode(C.packageBytes(r)); need(txt.includes('manifest.json') && txt.includes('"random_seed": 4242') && txt.includes('"low"'), 'manifest missing'); });
  await t('workbook export -> import reproduces every reaction volume', async () => {
    const r = C.buildRun(mk({ customRows: Array.from({ length: 20 }, (_, i) => [30 + 3 * i, 25 + i]) })), f = new File([C.workbookBytes(mk(), r)], 'x.xlsx'), x = await C.importRobotWorkbook(f);
    const rows = x.rows || x.reactions || x.run && x.run.rows; need(Array.isArray(rows) && rows.length === r.rows.length, 'rows ' + (rows && rows.length) + ' keys ' + Object.keys(x).join());
  });
  await t('archive that claims to expand past 200 MB is refused', async () => {
    const z = C.zipStore({ 'a.txt': new Uint8Array(10) }), v = new DataView(z.buffer, z.byteOffset, z.byteLength); let ok = false;
    for (let i = 0; i < z.length - 30; i++) if (v.getUint32(i, true) === 0x02014b50) { v.setUint32(i + 24, 300e6, true); ok = true; break; }
    need(ok, 'no central dir'); let msg = ''; try { await C.importRobotWorkbook(new File([z], 'bomb.xlsx')); } catch (e) { msg = e.message; } need(/200 MB/.test(msg), 'got: ' + msg);
  });
  await t('notebook card lists only reagents used in the run and states levels', () => {
    const r = C.buildRun(mk({ reagents: [{ code: 'A', name: 'a', molarMass: 200, stock: 300, solvent: 'ethanol' }, { code: 'B', name: 'b', molarMass: 100, stock: 300, solvent: 'ethanol' }, { code: 'C', name: 'unused', molarMass: 50, stock: 300, solvent: 'ethanol' }], customRows: [[50, 50, 0], [100, 50, 0]] }));
    const n = C.notebookSummary(r, '2026-01-01'); need(n.reagents.map(x => x.code).join() === 'A,B', 'reagents ' + n.reagents.map(x => x.code));
    need(/50.100 mM \(2 levels\)/.test(n.reagents[0].use), n.reagents[0].use);
    need(/^\d/.test(n.reagents[0].need) && /mL$/.test(n.reagents[0].need), 'need ' + n.reagents[0].need); need(C.notebookText(r, '2026-01-01').includes('| A | a |') && C.notebookCardSvg(r).includes('<svg'), 'text/svg');
  });
  await t('stock sheet instructions match the volumes (weigh, dilute) and bench files build', () => {
    const r = C.buildRun(mk({ reagents: [{ code: 'A', name: 'amine', molarMass: 200, stock: 300, solvent: 'ethanol' }, { code: 'B', name: 'liquid b', molarMass: 130.14, density: 1.03, stock: 300, solvent: 'ethanol' }], customRows: [[50, 50], [100, 25]] }));
    const st = C.stockSteps(r), a = st.find(x => x.key === 'A'), d = st.find(x => x.key === 'B_N');
    need(a && a.how.includes('Weigh 0.3 g'), 'A: ' + (a && a.how)); need(d && /Take 1 mL of stock B and add 4 mL ethanol/.test(d.how), 'B_N: ' + (d && d.how));
    need(st.findIndex(x => x.key === 'B_N') > st.findIndex(x => x.key === 'B'), 'dilution must come after its source');
    const csv = C.stockCsv(r), load = C.loadCsv(r); need(/^\ufeffdone,step,stock/.test(csv) && csv.includes('☐'), 'stock csv head'); need(load.includes('plate 3, position 0') && load.includes('tips'), 'load csv');
    const html = C.benchSheetHtml(r, '2026-01-01'); need(html.startsWith('<!doctype html>') && html.includes('B_N') && html.includes('@media print'), 'bench html');
  });
  await t('xlsx preview source: generated workbook reads back with all five sheets and full-width reference sheet', async () => {
    const r = C.buildRun(mk()), sh = await C.readTableFile(new File([C.workbookBytes(mk(), r)], 'x.xlsx'));
    need(sh.length === 5 && sh[2].name === 'stock_solution_concentration' && Math.max(...sh[2].rows.map(x => x.length)) >= 3, sh.map(x => x.name + ':' + Math.max(...x.rows.map(y => y.length))).join());
  });
  return out;
})()
