/* Robowski Studio v1 - UI. Generates files only; never talks to the robot. */

import * as C from '../engine/robowskiCore';
import '../styles/robowski.css';

export function mountRobowski(root: HTMLElement) {
const C = globalThis.RobowskiCore;
const PAL = ['#0E6F63', '#A94A12', '#5B3FA8', '#1F6AA5', '#8A2D5B', '#4A6B1F', '#B07D12', '#286C8B', '#A13B6B', '#6B6B6B', '#2F7D32', '#B3261E'];
const SOLV = ['ethanol', 'water', 'DMF', 'Dioxane', 'DCE', 'MeCN', 'glycerin', 'serum', 'DMSO', 'CHCl3'];
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 2) => Number.isFinite(+v) ? (+v).toLocaleString('en-US', { maximumFractionDigits: d }) : '-';
const ls = { get(k) { try { return localStorage.getItem(k) } catch (e) { return null } }, set(k, v) { try { localStorage.setItem(k, v) } catch (e) { } } };

/* ---------- state ---------- */
function exampleState() {
  return {
    id: null, name: 'amine-iodine-screen-01', mode: 'equivalence', hood: 'left', vialVolume: 500, threshold: 50, dilutionFactor: 5, reactionSolvent: 'ethanol', leftoverMl: 2, randomize: true, randomSeed: 20261018, solventAfter: 0, deckPlates: null, stockVolumeCheck: true, newTipEveryTransfer: false,
    reagents: [
      { code: 'AA', name: 'amine', molarMass: 211.26, density: 0, stock: 600, solvent: 'ethanol', min: 20, step: 10, max: 60, pipettingMode: 'empty' },
      { code: 'BB', name: 'ethyl acetoacetate', molarMass: 130.14, density: 1.03, stock: 200, solvent: 'ethanol', min: .1, step: .475, max: 1.525, pipettingMode: 'empty' },
      { code: 'CC', name: 'iodine', molarMass: 253.81, density: 0, stock: 100, solvent: 'ethanol', min: .05, step: .08, max: .21, pipettingMode: 'empty' }]
  };
}
function normalize(st) {
  if (!st.sets || !st.sets.length) st.sets = [{ name: 'Set 1', items: st.reagents.map(r => ({ on: true, min: r.min ?? 1, step: r.step ?? 1, max: r.max ?? 1 })) }];
  st.sets.forEach(set => { while (set.items.length < st.reagents.length) set.items.push({ on: false, min: 1, step: 1, max: 2 }); set.items.length = st.reagents.length; });
  st.reagents.forEach(r => { delete r.min; delete r.step; delete r.max; });
  return st;
}
let rowsCache = [], setOf = [];
function buildRows() {
  if (S.imported) return { rows: S.imported.rows, setOf: S.imported.rows.map(() => 0) };
  const n = S.reagents.length, rows = [], so = [], eq = S.mode === 'equivalence';
  S.sets.forEach((set, si) => {
    const nm = set.name || ('Set ' + (si + 1));
    const on = set.items.map((it, i) => it.on ? i : -1).filter(i => i >= 0);
    if (!on.length) throw new Error(nm + ': tick at least one reagent.');
    if (eq && !on.includes(0)) throw new Error(nm + ': in Equivalence mode every set needs ' + S.reagents[0].code + ' (equivalents are relative to it). Tick it, or switch to Concentration mode.');
    const axes = on.map(i => C.axisValues(set.items[i].min, set.items[i].step, set.items[i].max, nm + ' · ' + S.reagents[i].code));
    const total = axes.reduce((a, x) => a * x.length, 1);
    if (total > 20000) throw new Error(nm + ' would have ' + total.toLocaleString() + ' vials. Narrow a range.');
    let combos = [[]]; for (const ax of axes) { const nx = []; for (const p of combos) for (const v of ax) nx.push([...p, v]); combos = nx; }
    combos.forEach(vals => {
      const row = new Array(n).fill(0); on.forEach((i, k) => { row[i] = vals[k]; });
      if (eq) { const aa = row[0]; for (let i = 1; i < n; i++)row[i] = Math.round(row[i] * aa * 1e9) / 1e9; }
      rows.push(row); so.push(si);
    });
  });
  if (rows.length > 60000) throw new Error('More than 60,000 vials. Narrow the sets.');
  return { rows, setOf: so };
}
let S = normalize(exampleState()), run = null, err = null, fixes = [], view = 'setup', lib = [], runsList = [], page = 0, filterBad = false, status = 'draft';
let dbRuns = null, dbLib = null, storeMode = 'this browser';

/* ---------- storage: shared db when available, else localStorage ---------- */
async function initStore() {
  try {
    const db = globalThis.claude && await globalThis.claude.use('db');
    if (db) {
      dbRuns = db.collection('runs'); dbLib = db.collection('reagents'); storeMode = 'shared store';
      dbRuns.onSnapshot(s => { runsList = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updated || 0) - (a.updated || 0)); if (view === 'runs') render(); }, () => { });
      dbLib.onSnapshot(s => { lib = s.docs.map(d => ({ id: d.id, ...d.data() })); if (view === 'runs' || view === 'setup') render(); }, () => { });
      return;
    }
  } catch (e) { }
  try { runsList = JSON.parse(ls.get('rs.runs') || '[]'); lib = JSON.parse(ls.get('rs.lib') || '[]'); } catch (e) { }
  if (!lib.length) lib = [{ id: 'l1', name: 'amine', molarMass: 211.26, density: 0 }, { id: 'l2', name: 'ethyl acetoacetate', molarMass: 130.14, density: 1.03 }, { id: 'l3', name: 'iodine', molarMass: 253.81, density: 0 }, { id: 'l4', name: 'indene oxide', molarMass: 132.162, density: 0 }, { id: 'l5', name: 'p-toluic acid', molarMass: 136.15, density: 0 }];
}
async function putRun(r) { if (dbRuns) { await dbRuns.doc(r.id).set(r); return; } const i = runsList.findIndex(x => x.id === r.id); if (i < 0) runsList.unshift(r); else runsList[i] = r; runsList.sort((a, b) => (b.updated || 0) - (a.updated || 0)); ls.set('rs.runs', JSON.stringify(runsList)); }
async function delRun(id) { if (dbRuns) { await dbRuns.doc(id).delete(); return; } runsList = runsList.filter(x => x.id !== id); ls.set('rs.runs', JSON.stringify(runsList)); }
async function putLib(x) { if (dbLib) { await dbLib.doc(x.id).set(x); return; } const i = lib.findIndex(y => y.id === x.id); if (i < 0) lib.push(x); else lib[i] = x; ls.set('rs.lib', JSON.stringify(lib)); }
async function delLib(id) { if (dbLib) { await dbLib.doc(id).delete(); return; } lib = lib.filter(x => x.id !== id); ls.set('rs.lib', JSON.stringify(lib)); }
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ---------- compute ---------- */
let fixTimer = null;
function data() { const d = JSON.parse(JSON.stringify(S)); d.customRows = rowsCache; d.mode = 'concentration'; delete d.sets; if (!d.deckPlates) delete d.deckPlates; d.reagents.forEach((r, i) => { r.color = PAL[i % PAL.length]; r.prepareVolumeMl = 0; r.min = 0; r.step = 1; r.max = 0; }); return d; }
function compute() {
  try { const b = buildRows(); rowsCache = b.rows; setOf = b.setOf; run = C.buildRun(data()); err = null; } catch (e) { run = null; err = e.message; }
  fixes = []; clearTimeout(fixTimer);
  if (run && run.blockingIssues > 0 && run.reactions <= 1500) { fixTimer = setTimeout(() => { try { fixes = C.suggestFixes(data()); } catch (e) { fixes = []; } paintLive(); }, 250); }
  ls.set('rs.draft', JSON.stringify(S));
}
const rcol = i => PAL[i % PAL.length];
function codeColor(code) { const i = S.reagents.findIndex(r => r.code === code); return rcol(i < 0 ? 0 : i); }

/* ---------- helpers ---------- */
function tipsText() { if (!run) return '-'; const t = run.tipCounts; return `${t[50]} / ${t[300]} / ${t[1000]}`; }
function checks() {
  if (!run) return [];
  const out = [];
  S.reagents.forEach((r, i) => {
    let min = 1e9, max = 0; const keys = Object.keys(run.stocks).filter(k => run.stocks[k].source_reagent === r.code);
    run.rows.forEach(row => keys.forEach(k => { const v = +row['vol#' + k] || 0; if (v > 0) { min = Math.min(min, v); max = Math.max(max, v); } }));
    out.push({ code: r.code, i, min: min === 1e9 ? 0 : min, max, okMin: min >= S.threshold - 1e-9 || min === 1e9, okMax: max < 1000 });
  });
  let smin = 1e9, neg = 0; run.rows.forEach(row => { const v = +row['vol#solvent']; if (v < 0) neg++; if (v > 0) smin = Math.min(smin, v); });
  out.push({ code: 'solvent', i: -1, min: smin === 1e9 ? 0 : smin, max: 0, okMin: smin >= S.threshold - 1e-9 || smin === 1e9, okMax: true, neg });
  return out;
}
function recipeText(row, idx) {
  if (!row) return '';
  const lines = [`<b>Reaction ${row.global_index + 1}</b> · plate ${row.plate_number} · vial ${row.container_id}`];
  row.recipe.forEach(rc => { if (rc.target_concentration > 0) lines.push(`${esc(rc.code)} ${nf(rc.target_concentration, 3)} mM &larr; ${nf(rc.transfer_volume, 1)} µL of ${esc(rc.stock_key)}${rc.dilution_level ? ` (${S.dilutionFactor ** rc.dilution_level}×)` : ''}`); });
  lines.push(`solvent ${nf(row['vol#solvent'], 1)} µL` + (row['vol#solvent'] < 0 ? ' &#9888; negative' : ''));
  return lines.join('<br>');
}
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }

/* ---------- views ---------- */
function strip() {
  const bad = run ? run.blockingIssues : 0, warn = run ? run.warningCount : 0;
  const chip = err ? '<span class="chip bad">Input error</span>' : bad ? `<span class="chip bad">${bad} check${bad > 1 ? 's' : ''} failing</span>` : warn ? `<span class="chip warn">${warn} warning${warn > 1 ? 's' : ''}</span>` : '<span class="chip ok">All checks pass</span>';
  return `<div class="sband" id="strip"><div class="sbin">
 <span>Mode <b>${S.mode === 'equivalence' ? 'Equivalence' : 'Concentration'}</b></span>
 <span>Vial <b class="mono">${nf(S.vialVolume, 0)} µL</b></span>
 <span>Combinations <b class="mono">${run ? run.reactions : '-'}</b></span>
 <span>Vial plates <b class="mono">${run ? run.plates : '-'}</b></span>
 <span>Tips 50/300/1000 <b class="mono">${tipsText()}</b></span>
 <span>Est. time <b>${run ? esc(run.runtime.label) : '-'}</b></span>
 <span style="display:inline-flex;gap:6px;align-items:center">${S.reagents.map((r, i) => `<span class="rdot" style="background:${rcol(i)}">${esc(r.code)}</span>`).join('')}</span>
 ${chip}</div></div>`;
}
function reagentRow(r, i) {
  const c = rcol(i);
  const libOpts = '<option value="">Library…</option>' + lib.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  return `<div class="rrow" data-i="${i}"><div class="rw">
  <div class="code" style="background:${c}" title="Added #${i + 1}">${esc(r.code)}</div>
  <input type="text" class="f" data-k="reagents.${i}.name" value="${esc(r.name)}" aria-label="${esc(r.code)} name" placeholder="name">
  <input type="number" class="f mono" step="any" data-k="reagents.${i}.molarMass" value="${r.molarMass}" aria-label="${esc(r.code)} molar mass">
  <input type="number" class="f mono" step="any" data-k="reagents.${i}.density" value="${r.density || ''}" placeholder="solid" aria-label="${esc(r.code)} density">
  <input type="number" class="f mono" step="any" data-k="reagents.${i}.stock" value="${r.stock}" aria-label="${esc(r.code)} stock">
  <select class="f" data-k="reagents.${i}.solvent" aria-label="${esc(r.code)} stock solvent">${SOLV.map(s => `<option ${s === r.solvent ? 'selected' : ''}>${s}</option>`).join('')}</select>
  <div class="racts"><button class="ib" data-act="mv" data-v="-1" data-i="${i}" aria-label="Add earlier" title="Add earlier" ${i === 0 ? 'disabled' : ''}>↑</button><button class="ib" data-act="mv" data-v="1" data-i="${i}" aria-label="Add later" title="Add later" ${i === S.reagents.length - 1 ? 'disabled' : ''}>↓</button>
  <select class="f sm" data-act="pick" data-i="${i}" aria-label="Pick ${esc(r.code)} from library">${libOpts}</select>
  <button class="ib" data-act="tolib" data-i="${i}" title="Save to library" aria-label="Save to library">★</button>
  ${S.reagents.length > 2 ? `<button class="ib" data-act="rmr" data-i="${i}" aria-label="Remove reagent ${esc(r.code)}" title="Remove">✕</button>` : '<span class="ib ph"></span>'}</div></div>
  <div id="dots${i}"></div></div>`;
}
function dotsFor(i) {
  const r = S.reagents[i]; if (!run) return '';
  const used = Object.keys(run.stocks).some(k => run.stocks[k].source_reagent === r.code && run.stocks[k].dilution_level > 0);
  if (!used) return '';
  let minT = 1e18, maxT = 0; rowsCache.forEach(row => { const v = row[i]; if (v > 0) { minT = Math.min(minT, v); maxT = Math.max(maxT, v); } });
  if (minT === 1e18) return '';
  const ideal = minT * S.vialVolume / Math.max(S.threshold, 1e-9), mv = maxT * S.vialVolume / ideal;
  return `<div class="hint">Needs hand dilutions at ${nf(r.stock, 1)} mM. A stock of ≤ <b class="mono">${nf(ideal, 1)} mM</b> would pipette the smallest amount directly, but then the largest is about <b class="mono">${nf(mv, 0)} µL</b>${mv >= 1000 ? ' (too big for one dispense)' : ''}.</div>`;
}
function issuesHTML() {
  if (err) return `<div class="issue bad"><span>${esc(err)}</span></div>`;
  if (!run) return '';
  const groups = {}; run.issues.forEach(x => { (groups[x.type] = groups[x.type] || []).push(x); });
  const names = { 'negative-solvent': 'Negative solvent', 'subminimum': 'Below 0.5 µL', 'low-solvent': 'Solvent below threshold', 'large-transfer': 'Transfer over 1000 µL', 'n3-needed': 'Needs N³ dilution', 'underprepared-stock': 'Stock under-prepared', 'oversize-stock': 'Stock larger than a 20 mL bottle', 'deck-capacity': 'Deck full', 'requires-reload': 'More than 3 plates' };
  let h = '';
  const bad = run.issues.filter(x => x.severity === 'block').length;
  if (!run.issues.length) h = '<div class="issue ok"><span>All volumes are within limits: every transfer ≥ threshold, under 1000 µL, solvent never negative.</span></div>';
  for (const [t, list] of Object.entries(groups)) {
    const sev = list.some(x => x.severity === 'block') ? 'bad' : 'warn';
    const ids = [...new Set(list.map(x => x.globalIndex).filter(x => x != null))].map(x => x + 1);
    h += `<div class="issue ${sev}"><span><b>${names[t] || t}</b> (${list.length}) · ${esc(list[0].message)}${list.length > 1 ? ` <i>+${list.length - 1} more</i>` : ''}${ids.length ? `<br><span class="mono" style="font-size:12px">reactions ${ids.slice(0, 12).join(', ')}${ids.length > 12 ? '…' : ''}</span>` : ''}</span></div>`;
  }
  if (bad && fixes.length) h += `<div class="issue warn"><span><b>Verified fixes</b> (each one was recalculated and clears every blocking check)</span>${fixes.map((f, i) => `<button class="btn sm" data-act="fix" data-i="${i}">${esc(f.label)}</button>`).join('')}</div>`;
  else if (bad && run.reactions <= 1500) h += `<div class="hint">Looking for a verified fix…</div>`;
  return h;
}
function checkTable() {
  const cs = checks(); if (!cs.length) return '';
  return `<div class="tbl"><table><thead><tr><th>Check</th>${S.reagents.map((r, i) => `<th><span class="rdot" style="background:${rcol(i)}">${esc(r.code)}</span></th>`).join('')}<th>solvent</th></tr></thead><tbody>
 <tr><td>All volumes ≥ ${S.threshold} µL</td>${cs.map(c => `<td>${c.okMin ? '✓' : '<b style="color:var(--bad)">✗ ' + nf(c.min, 1) + '</b>'}</td>`).join('')}</tr>
 <tr><td>All volumes &lt; 1000 µL</td>${cs.map(c => `<td>${c.okMax ? '✓' : '<b style="color:var(--bad)">✗ ' + nf(c.max, 0) + '</b>'}</td>`).join('')}</tr>
 <tr><td>Solvent never negative</td>${cs.map(c => c.code === 'solvent' ? (c.neg ? `<td><b style="color:var(--bad)">✗ ${c.neg}</b></td>` : '<td>✓</td>') : '<td class="mono" style="color:var(--mut)">-</td>').join('')}</tr></tbody></table></div>`;
}
function setCount(set) { let t = 1, ok = true; for (const it of set.items) { if (!it.on) continue; const st = +it.step, mn = +it.min, mx = +it.max; if (!(st > 0) || mx < mn) { ok = false; break; } const k = (mx - mn) / st; if (Math.abs(k - Math.round(k)) > 1e-7) { ok = false; break; } t *= Math.round(k) + 1; } return ok && set.items.some(i => i.on) ? t : -1; }
function setsCard() {
  const eq = S.mode === 'equivalence';
  return `<div class="card" style="margin-top:20px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px"><div><h2>Vial sets</h2><p class="sub" style="margin:0">Each set picks which reagents go in and their ranges. The vials of all sets are added together.</p></div><button class="btn" data-act="addset">Add set</button></div>
 ${S.sets.map((set, si) => `<div class="rcard" style="border-left-color:${rcol(si)}"><div class="rhead"><input type="text" data-k="sets.${si}.name" value="${esc(set.name)}" style="width:170px;height:32px;font-weight:600"><span class="chip mut" id="sc${si}"></span><span style="flex:1"></span><button class="btn sm" data-act="dupset" data-i="${si}">Duplicate</button>${S.sets.length > 1 ? `<button class="btn sm" data-act="rmset" data-i="${si}">Remove</button>` : ''}</div>
  <div class="tbl"><table><thead><tr><th>Reagent</th><th>Min</th><th>Step</th><th>Max</th><th></th></tr></thead><tbody>${S.reagents.map((r, i) => { const it = set.items[i], unit = (eq && i > 0) ? 'equiv.' : 'mM'; return `<tr><td><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" data-k="sets.${si}.items.${i}.on" ${it.on ? 'checked' : ''} style="width:18px;height:18px;accent-color:${rcol(i)}"><span class="rdot" style="background:${rcol(i)}">${esc(r.code)}</span></label></td>${['min', 'step', 'max'].map(f => `<td><input type="number" step="any" data-k="sets.${si}.items.${i}.${f}" value="${it[f]}" ${it.on ? '' : 'disabled'} style="width:84px;height:30px"></td>`).join('')}<td class="hint" style="text-align:left">${it.on ? unit : 'not in this set'}</td></tr>`; }).join('')}</tbody></table></div></div>`).join('')}
 <div class="hint">${eq ? 'Equivalence mode: the first reagent is a concentration in mM, the others are multiples of it.' : 'Concentration mode: every ticked reagent has its own range in mM.'} For a single amount, set min and max equal.</div></div>`;
}
function importedCard() {
  const im = S.imported; return `<div class="card" style="margin-top:20px"><h2>Imported vials</h2><p class="sub">${im.rows.length} vials rebuilt from <b>${esc(im.name)}</b>. Their concentrations are fixed; change reagents, stocks or run settings above and everything recalculates.</p>
 ${im.note ? `<div class="issue ${im.differ ? 'warn' : 'ok'}"><span>${esc(im.note)}</span></div>` : ''}
 <button class="btn" data-act="unimport">Discard imported vials and use vial sets</button></div>`;
}
function setupView() {
  const pre = [500, 800];
  return `<div class="bodyw"><div class="lcol">
 <div class="card pad"><div class="chead"><div class="ct">Run parameters</div>
  <div class="seg" role="group" aria-label="Generator mode"><button data-act="mode" data-v="concentration" class="${S.mode === 'concentration' ? 'on' : ''}">Concentration</button><button data-act="mode" data-v="equivalence" class="${S.mode === 'equivalence' ? 'on' : ''}">Equivalence</button></div></div>
 <div class="pgrid">
 <div class="fld" style="grid-column:span 2"><label class="lbl">Run name</label><input type="text" class="f" data-k="name" value="${esc(S.name)}"></div>
 <div class="fld"><label class="lbl">Total vol. per vial (µL)</label><div class="seg full" role="group" aria-label="Vial volume presets">${pre.map(p => `<button data-act="vv" data-v="${p}" class="${+S.vialVolume === p ? 'on' : ''}">${p}</button>`).join('')}<button data-act="vv" data-v="custom" class="${pre.includes(+S.vialVolume) ? '' : 'on'}">Custom</button></div>
  ${pre.includes(+S.vialVolume) ? '' : `<input type="number" class="f mono" data-k="vialVolume" value="${S.vialVolume}" aria-label="Vial volume" style="margin-top:6px">`}</div>
 <div class="fld"><label class="lbl">Pipetting threshold (µL)</label><input type="number" class="f mono" data-k="threshold" value="${S.threshold}"></div>
 <div class="fld"><label class="lbl">Dilution factor (N)</label><input type="number" class="f mono" data-k="dilutionFactor" value="${S.dilutionFactor}"></div>
 <div class="fld"><label class="lbl">Solvent</label><select class="f" data-k="reactionSolvent">${SOLV.map(s => `<option ${s === S.reactionSolvent ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
 <div class="fld"><label class="lbl">Leftover per stock (mL)</label><input type="number" class="f mono" step="any" data-k="leftoverMl" value="${S.leftoverMl}"></div>
 <div class="fld"><label class="lbl">Solvent is added</label><select class="f" data-k="solventAfter">${S.reagents.map((r, i) => `<option value="${i}" ${+S.solventAfter === i ? 'selected' : ''}>${i === 0 ? 'first' : 'after ' + esc(S.reagents[i - 1].code)}</option>`).join('')}<option value="${S.reagents.length}" ${+S.solventAfter >= S.reagents.length ? 'selected' : ''}>last</option></select></div>
 <div class="fld"><label class="lbl">Shuffle vial order</label><select class="f" data-k="randomize"><option value="true" ${S.randomize ? 'selected' : ''}>On (random)</option><option value="false" ${S.randomize ? '' : 'selected'}>Off (generator order)</option></select></div>
 ${S.randomize ? `<div class="fld"><label class="lbl">Shuffle seed</label><input type="number" class="f mono" data-k="randomSeed" value="${S.randomSeed}"></div>` : ''}
 </div>
 <div class="note">${S.mode === 'equivalence' ? 'Equivalence mode: the first reagent is a concentration in mM; every other reagent is set as equivalents of it.' : 'Concentration mode: every reagent has its own range in mM.'}</div></div>

 <div class="card pad" style="overflow-x:auto"><div style="min-width:860px"><div class="chead"><div class="ct">Reagents <span class="cnt">${S.reagents.length} of 12 · in order of addition</span></div>${S.reagents.length < 12 ? '<button class="btn" data-act="addr"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7 2v10M2 7h10"/></svg>&nbsp;Add reagent</button>' : ''}</div>
 <div class="rw th"><div>Code</div><div>Name</div><div>Molar mass</div><div>Density</div><div>Stock (mM)</div><div>Stock solvent</div><div>Order · library</div></div>
 ${S.reagents.map(reagentRow).join('')}
 <div class="note" style="margin-top:14px">Define each reagent once; the vial sets below say where it is used and in what range.</div></div></div>
 ${S.imported ? importedCard() : setsCard()}</div>
 <div class="rcol" id="live"></div></div>`;
}
function stockPrep() {
  if (!run) return '';
  const base = Object.entries(run.stocks).filter(([k, s]) => s.dilution_level === 0);
  const rows = [...base.map(([k, s]) => {
    const r = S.reagents.find(x => x.code === s.source_reagent) || {}; const i = S.reagents.findIndex(x => x.code === s.source_reagent);
    const sub = s.chemical_volume_ml ? `${nf(s.chemical_volume_ml, 3)} mL liquid` : 'weigh solid';
    const need = Object.values(run.stocks).filter(t => t.source_reagent === s.source_reagent && t.dilution_level > 0).map(t => `${S.dilutionFactor ** t.dilution_level}× stock`);
    return `<div class="prow"><div class="code sm" style="background:${rcol(i < 0 ? 0 : i)}">${esc(s.source_reagent)}</div><div style="flex:1;min-width:0"><div style="font-weight:500">${nf(s.prep_volume_ml, 1)} mL at ${nf(s.concentration_mM, 1)} mM</div><div class="hint" style="margin:0">${sub}${need.length ? ' · also hand-diluted to ' + need.join(', ') : ''} · ${esc(s.solvent)}</div></div><div class="mono pv">${s.mass_g != null ? nf(s.mass_g, 3) + ' g' : nf(s.prep_volume_ml, 1) + ' mL'}</div></div>`;
  }),
  ...(run.sourceOnlyStocks || []).map(s => { const i = S.reagents.findIndex(x => x.code === s.source_reagent); return `<div class="prow"><div class="code sm" style="background:${rcol(i < 0 ? 0 : i)}">${esc(s.source_reagent)}</div><div style="flex:1"><div style="font-weight:500">${nf(s.recommended_volume_ml, 2)} mL source stock</div><div class="hint" style="margin:0">not on deck · for hand dilutions only</div></div></div>`; })];
  return rows.join('');
}
function livePanel() {
  if (err) return `<div class="card pad"><div class="issue bad"><span>${esc(err)}</span></div></div>`;
  if (!run) return '';
  const cs = checks(), minOk = cs.every(c => c.okMin), maxOk = cs.every(c => c.okMax), neg = (cs.find(c => c.code === 'solvent') || {}).neg || 0;
  const yes = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6.5l2.6 2.6L10 3.5"/></svg>', no = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>';
  const crow = (t, ok, bad) => `<div class="crow"><span>${t}</span><span class="chip ${ok ? 'ok' : 'bad'}">${ok ? yes + 'Yes' : no + bad}</span></div>`;
  return `<div class="card pad"><div class="lbl">THIS RUN</div>
 <div class="big"><b>${run.reactions}</b><span>vials · ${run.plates} plate${run.plates === 1 ? '' : 's'}</span></div><div class="hr"></div>
 <div class="crows">${crow(`All volumes ≥ ${S.threshold} µL`, minOk, 'No')}${crow('All volumes under 1000 µL', maxOk, 'No')}${crow('Solvent never negative', !neg, 'No · ' + neg + ' vials')}</div>
 <div style="margin-top:14px">${issuesHTML()}</div>
 <details class="det"><summary>Check table by reagent</summary>${checkTable()}</details>
 <div class="hint" style="margin-top:12px">Stock volume = total pipetted + ${S.leftoverMl} mL leftover. Total solvent ${nf(run.solventRecommendedMl, 1)} mL.</div></div>
 <div class="card pad"><div class="ct" style="margin-bottom:10px">Stock preparation</div><div class="plist">${stockPrep()}</div></div>
 <div class="btns"><button class="btn lg" data-act="save" ${err ? 'disabled' : ''}>Save draft</button><button class="btn lg pri" data-act="tab" data-v="combos">Review combinations<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg></button></div>`;
}
function paintLive() {
  const l = $('#live'); if (l) l.innerHTML = livePanel();
  S.reagents.forEach((r, i) => { const d = $('#dots' + i); if (d) d.innerHTML = dotsFor(i); });
  S.sets.forEach((set, si) => { const c = $('#sc' + si); if (c) { const n = setCount(set); c.textContent = n < 0 ? 'check ranges' : n + ' vial' + (n === 1 ? '' : 's'); } });
  const st = $('#strip'); if (st) st.outerHTML = strip();
}
function comboView() {
  if (!run) return `<div class="card">${issuesHTML()}</div>`;
  const rows = run.rows.map((r, i) => ({ r, i, bad: r['vol#solvent'] < -1e-8 }));
  const list = filterBad ? rows.filter(x => x.bad) : rows; const PS = 50, pages = Math.max(1, Math.ceil(list.length / PS)); page = Math.min(page, pages - 1);
  const slice = list.slice(page * PS, page * PS + PS); const badN = rows.filter(x => x.bad).length;
  const multi = S.sets.length > 1;
  const head = `<tr><th>#</th><th>Vial</th>${multi ? '<th>Set</th>' : ''}${S.reagents.map((r, i) => `<th><span class="rdot" style="background:${rcol(i)}">${esc(r.code)}</span> mM</th>`).join('')}<th>solvent µL</th></tr>`;
  const body = slice.map(({ r, i, bad }) => `<tr class="hov ${bad ? 'badrow' : ''}" data-row="${i}"><td>${r.global_index + 1}</td><td>p${r.plate_number}·${r.container_id}</td>${multi ? `<td><span class="chip mut" style="border-left:4px solid ${rcol(setOf[r.combo_index] || 0)}">${esc((S.sets[setOf[r.combo_index]] || {}).name || '')}</span></td>` : ''}${r.recipe.map(rc => `<td>${nf(rc.target_concentration, 3)}${rc.dilution_level ? `<span class="tag">${S.dilutionFactor ** rc.dilution_level}×</span>` : ''}</td>`).join('')}<td>${nf(r['vol#solvent'], 1)}</td></tr>`).join('');
  const bars = S.reagents.map((r, i) => {
    const keys = Object.keys(run.stocks).filter(k => run.stocks[k].source_reagent === r.code); const tot = keys.reduce((a, k) => a + run.stocks[k].consumption_uL, 0) || 1;
    return `<div><span class="rdot" style="background:${rcol(i)}">${esc(r.code)}</span><div class="b">${keys.map(k => { const s = run.stocks[k]; return `<i title="${esc(k)}" style="width:${100 * s.consumption_uL / tot}%;background:${rcol(i)};opacity:${1 - 0.28 * s.dilution_level}"></i>` }).join('')}</div><span class="mono">${keys.map(k => esc(run.stocks[k].dilution_label === 'Direct' ? 'direct' : run.stocks[k].dilution_label)).join(' · ')}</span></div>`;
  }).join('');
  return `<div class="grid two"><div class="card" style="min-width:0"><h2>Combinations</h2><p class="sub">${list.length} shown of ${rows.length}. Hover a row for its recipe. Tags show which diluted stock is used.</p>
 <div class="tbl" style="max-height:620px"><table><thead>${head}</thead><tbody>${body || '<tr><td colspan="9" class="empty-note">Nothing to show.</td></tr>'}</tbody></table></div>
 <div class="pager"><button class="btn sm" data-act="pg" data-v="-1" ${page <= 0 ? 'disabled' : ''}>Prev</button><span class="mono">${page + 1} / ${pages}</span><button class="btn sm" data-act="pg" data-v="1" ${page >= pages - 1 ? 'disabled' : ''}>Next</button></div></div>
 <div style="min-width:0"><div class="card" style="margin-bottom:20px"><h2>Which stock each reagent uses</h2><p class="sub">Share of total volume pipetted. Lighter = more diluted.</p><div class="bars">${bars}</div></div>
 <div class="card"><h2>Needs attention</h2><p class="sub">${badN ? badN + ' vials have negative solvent.' : 'Nothing to fix.'}</p>${issuesHTML()}${badN ? `<button class="btn sm" data-act="fbad">${filterBad ? 'Show all rows' : 'Show only failing rows'}</button>` : ''}</div></div></div>`;
}
function wellHTML(stock, color) {
  if (!stock) return '<div class="well e"></div>';
  const pct = Math.min(100, 100 * stock.ml / 20);
  return `<div class="well" data-stock="${esc(stock.key)}" style="background:var(--fill);border:3px solid ${color}"><div class="bar" style="height:${pct}%"></div><span>${esc(stock.key.replace('_N2', '×25').replace('_N', '×5'))}</span></div>`;
}
function deckView() {
  function deckPlatesHTML() { const d = run.deck; const ids = [...new Set([...d.plates, d.solvent_plate])].sort(); return ids.map(p => d.solvent_kind === 'jar' && p === d.solvent_plate ? jar : bottle(p, p === d.solvent_plate)).join(''); }
  if (!run) return `<div class="card">${issuesHTML()}</div>`;
  const left = S.hood === 'left', pl = run.deck.plates;
  const byPos = {}; Object.entries(run.stocks).forEach(([k, s]) => { byPos[s.breadboard_plate_id + ':' + s.container_id] = { key: k, ml: s.recommended_volume_ml, color: codeColor(s.source_reagent) }; });
  const bottle = (pn, solv) => {
    let w = ''; for (let c = 0; c < 8; c++) { if (solv && c === 0) w += `<div class="well" data-stock="solvent" style="background:var(--fill);border:3px solid var(--fg2)"><div class="bar" style="height:${Math.min(100, 100 * run.solventRecommendedMl / 20)}%"></div><span>solv</span></div>`; else w += wellHTML(byPos[pn + ':' + c], byPos[pn + ':' + c] && byPos[pn + ':' + c].color); }
    return `<div class="plate"><div class="pt">plate${pn} · Bottle 20 mL (2×4)</div><div class="wells8">${w}</div></div>`;
  };
  const jar = `<div class="plate"><div class="pt">plate${run.deck.solvent_plate} · Jar 100 mL (1×2)</div><div class="wells8" style="grid-template-columns:repeat(2,1fr)"><div class="well" data-stock="solvent" style="background:var(--fill);border:3px solid var(--fg2)"><div class="bar" style="height:${Math.min(100, 100 * run.solventRecommendedMl / 100)}%"></div><span>solvent</span></div><div class="well e"></div></div></div>`;
  const vplates = [0, 1, 2].map(p => {
    const used = p < run.plates;
    if (!used) return `<div class="plate off"><div class="pt">plate${p} · 54-vial plate (not needed)</div><div class="wells54">${'<div class="v54 x"></div>'.repeat(54)}</div></div>`;
    const n = Math.min(54, run.reactions - p * 54); let w = '';
    for (let k = 0; k < 54; k++) { const ri = p * 54 + k; const bad = k < n && run.rows[ri]['vol#solvent'] < -1e-8; w += `<div class="v54 ${k < n ? (bad ? 'b' : 'u') : 'x'}" ${k < n ? `data-row="${ri}"` : ''} ${k < n && !bad && S.sets.length > 1 ? `style="border-color:${rcol(setOf[run.rows[ri].combo_index] || 0)};border-width:3px"` : ''}></div>`; }
    return `<div class="plate"><div class="pt">plate${p} · ${n} of 54 vials used (filled by the robot)</div><div class="wells54">${w}</div></div>`;
  }).join('');
  const loads = Object.entries(run.stocks).map(([k, s]) => {
    const c = codeColor(s.source_reagent); let prep = '';
    if (s.dilution_level === 0) prep = s.mass_g != null ? `Prepare ${nf(s.prep_volume_ml, 1)} mL: weigh ${nf(s.mass_g * 1000, 1)} mg${s.chemical_volume_ml ? ` (or ${nf(s.chemical_volume_ml * 1000, 0)} µL liquid)` : ''} in ${esc(s.solvent)}` : `Prepare ${nf(s.prep_volume_ml, 1)} mL at ${nf(s.concentration_mM, 1)} mM in ${esc(s.solvent)}`;
    else prep = `Dilute by hand: ${nf(s.base_stock_volume_ml, 2)} mL of ${esc(s.source_reagent)} stock + ${nf(s.diluent_volume_ml, 2)} mL ${esc(s.solvent)} → ${nf(s.concentration_mM, 1)} mM`;
    return `<div><span class="rdot" style="background:${c};min-width:46px">${esc(k)}</span><span class="mono" style="min-width:110px">plate${s.breadboard_plate_id} · pos ${s.container_id}</span><b class="mono" style="min-width:80px">${nf(s.recommended_volume_ml, 2)} mL</b><span style="flex:1 1 260px;color:var(--fg2);min-width:0">${prep}</span></div>`;
  }).join('');
  const src = (run.sourceOnlyStocks || []).map(s => `<div><span class="rdot" style="background:${codeColor(s.source_reagent)};min-width:46px">${esc(s.substance)}</span><span class="mono" style="min-width:110px">not on deck</span><b class="mono" style="min-width:80px">${nf(s.recommended_volume_ml, 2)} mL</b><span style="flex:1 1 260px;color:var(--fg2)">Source stock for hand dilutions only</span></div>`).join('');
  return `<div class="card" style="margin-bottom:20px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><h2>Deck · ${left ? 'Left' : 'Right'} hood</h2><p class="sub" style="margin:0">Positions are assigned automatically. Bars show how full each bottle will be (of 20 mL).</p></div>
 <div class="seg" role="group" aria-label="Hood"><button data-act="hood" data-v="left" class="${left ? 'on' : ''}">Left hood</button><button data-act="hood" data-v="right" class="${left ? '' : 'on'}">Right hood</button></div></div>
 ${run.deck.positions_fit ? '' : `<div class="issue bad" style="margin-top:12px"><span>${esc(run.deck.positions_message)}</span></div>`}
 <div class="hood" style="margin-top:16px"><div class="plates">${deckPlatesHTML()}</div></div>
 <div class="plates">${vplates}</div>
 ${run.plates > 3 ? `<div class="hint">This run needs ${run.plates} plates; the deck holds 3 at once, so load the next plates after the first batch finishes.</div>` : ''}</div>
 <div class="card" style="margin-bottom:20px"><h2>Plate numbers</h2><p class="sub">Which deck plates hold the stocks and the solvent. Change these if your deck differs; the Excel follows.</p>
 <div class="row"><div class="fld"><label class="lbl">Solvent container</label><select data-dp="solventKind"><option value="jar" ${run.deck.solvent_kind === 'jar' ? 'selected' : ''}>Jar 100 mL</option><option value="bottle" ${run.deck.solvent_kind === 'bottle' ? 'selected' : ''}>Bottle 20 mL</option></select></div>
 <div class="fld"><label class="lbl">Solvent plate</label><select data-dp="solventPlate">${[3, 4, 5, 6, 7].map(p => `<option ${p === run.deck.solvent_plate ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
 <div class="fld"><label class="lbl">Solvent position</label><select data-dp="solventPos">${[0, 1, 2, 3, 4, 5, 6, 7].map(p => `<option ${p === run.deck.solvent_container ? 'selected' : ''}>${p}</option>`).join('')}</select></div></div>
 <div style="margin-top:12px"><span class="lbl">Bottle plates for stocks (filled in this order)</span><div class="seg" role="group" aria-label="Stock plates">${[3, 4, 5, 6].map(p => `<button data-act="sp" data-v="${p}" class="${run.deck.plates.includes(p) ? 'on' : ''}">plate${p}</button>`).join('')}</div></div></div>
 <div class="grid eq"><div class="card" style="min-width:0"><h2>Load list</h2><p class="sub">What goes where, and how to prepare it. Volume includes ${S.leftoverMl} mL leftover.</p><div class="list">
 <div><span class="rdot" style="background:var(--fg2);min-width:46px">solv</span><span class="mono" style="min-width:110px">${esc(run.deck.solvent_location)}</span><b class="mono" style="min-width:80px">${nf(run.solventRecommendedMl, 1)} mL</b><span style="flex:1 1 260px;color:var(--fg2)">${esc(S.reactionSolvent)}</span></div>${loads}${src}</div></div>
 <div class="card" style="min-width:0">${tipsCard()}</div></div>`;
}
function tipsCard() {
  if (!run) return ''; const t = run.tipCounts;
  const rows = [50, 300, 1000].map(s => `<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;padding:8px 0;border-top:1px solid var(--line2)"><span>${s} µL tips</span><span><b class="mono" style="font-size:18px">${t[s]}</b> <span class="hint">${t.racks[s]} rack${t.racks[s] === 1 ? '' : 's'} of 96</span></span></div>`).join('');
  return `<h2>Tips to load</h2><p class="sub">Count how many you need, then refill racks before you start.</p>${rows}
 <label class="chk"><input type="checkbox" data-k="stockVolumeCheck" ${S.stockVolumeCheck ? 'checked' : ''}> Check stock volumes (one 300 µL tip per stock${t.stockCheck ? `, ${t.stockCheckTips} here` : ''})</label>
 <label class="chk"><input type="checkbox" data-k="newTipEveryTransfer" ${S.newTipEveryTransfer ? 'checked' : ''}> New tip after every pipetting</label>
 <div class="hint">A new tip is taken only when the tip size or the substance changes, unless the box above is ticked.</div>`;
}
function exportView() {
  const blocked = !run || run.blockingIssues > 0;
  const files = [['xlsx', 'robowski_run.xlsx', 'The input workbook for the robot: reactions_with_run_info and stock_solutions sheets, plus reference sheets.'], ['stock', 'stock_preparation.csv', 'How to prepare every stock, with masses and hand-dilution volumes.'], ['load', 'deck_load_checklist.csv', 'Where each bottle and plate goes on the deck.'], ['png', 'run_card.png', 'A picture of the run: deck, plates and tips. Good for the lab notebook or a message.'], ['zip', 'robowski_package.zip', 'Everything above in one zip.']];
  return `<div class="grid two"><div class="card" style="min-width:0"><h2>Export</h2><p class="sub">Files are generated here. Nothing is sent to the robot. Use Preview to inspect a file before downloading.</p>
 ${blocked ? `<div class="issue bad"><span>${err ? esc(err) : `${run.blockingIssues} blocking issue${run.blockingIssues > 1 ? 's' : ''} to fix before export.`}</span><button class="btn sm" data-act="tab" data-v="setup">Open setup</button></div>` : ''}
 <div class="list">${files.map(f => `<div><b class="mono" style="min-width:190px">${f[1]}</b><span style="flex:1 1 240px;color:var(--fg2)">${f[2]}</span><div style="display:flex;gap:6px"><button class="btn sm" data-act="preview" data-v="${f[0]}" ${blocked ? 'disabled' : ''}>Preview</button><button class="btn sm pri" data-act="dl" data-v="${f[0]}" ${blocked ? 'disabled' : ''}>Save</button></div></div>`).join('')}</div></div>
 <div style="min-width:0"><div class="card" style="margin-bottom:20px">${tipsCard()}</div><div class="card"><h2>Save this run</h2><p class="sub">Keeps the settings, deck and tips as a card in the run library (${storeMode}).</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" data-act="save" ${err ? 'disabled' : ''}>Save run</button><button class="btn" data-act="saveas" ${err ? 'disabled' : ''}>Save as new</button></div></div></div></div>`;
}
function thumb(sm) {
  const bots = Array.from({ length: 16 }, (_, i) => { const col = sm.colors && sm.colors[i % (sm.colors.length || 1)] || '#999'; return i < (sm.stocks || 0) ? `<div style="width:14px;height:14px;border-radius:50%;background:var(--fill);border:2.5px solid ${col}"></div>` : `<div style="width:14px;height:14px;border-radius:50%;border:1.5px solid var(--emptybd)"></div>`; }).join('');
  const used = Math.min(54, sm.reactions || 0);
  const v = Array.from({ length: 54 }, (_, k) => `<div style="width:8px;height:8px;border-radius:50%;background:${k < used ? 'var(--acc)' : 'var(--offbd)'}"></div>`).join('');
  return `<div class="thumb"><div style="display:grid;grid-template-columns:repeat(8,14px);gap:5px">${bots}</div><div style="display:grid;grid-template-columns:repeat(9,8px);gap:3px">${v}</div></div>`;
}
function runsView() {
  const cards = runsList.map(r => `<div class="card" style="display:flex;flex-direction:column;gap:12px">${thumb(r)}
  <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><b style="font-size:15px;min-width:0;overflow-wrap:anywhere">${esc(r.name)}</b><span class="chip ${r.status === 'exported' ? 'ok' : 'mut'}">${esc(r.status || 'draft')}</span></div>
  <div class="hint" style="margin:0">${esc(r.mode)} · ${esc(r.hood)} hood · ${new Date(r.updated || 0).toLocaleDateString()}</div>
  <div style="display:flex;gap:6px;flex-wrap:wrap">${(r.codes || []).map((c, i) => `<span class="rdot" style="background:${(r.colors || [])[i] || '#777'}">${esc(c)}</span>`).join('')}</div>
  <div style="font-size:13px"><b class="mono">${r.reactions}</b> combinations · <b class="mono">${r.plates}</b> plate${r.plates === 1 ? '' : 's'}<br><span class="hint">Tips 50/300/1000: <span class="mono">${esc(r.tips)}</span></span></div>
  <div style="display:flex;gap:6px;margin-top:auto;flex-wrap:wrap"><button class="btn sm" style="flex:1" data-act="open" data-id="${esc(r.id)}">Open</button><button class="btn sm" style="flex:1" data-act="dup" data-id="${esc(r.id)}">Duplicate</button><button class="btn sm" style="flex:1" data-act="card" data-id="${esc(r.id)}">Share card</button><button class="btn sm" data-act="del" data-id="${esc(r.id)}" aria-label="Delete run">✕</button></div></div>`).join('');
  const libH = lib.map(x => `<div><div style="flex:1;min-width:0"><b>${esc(x.name)}</b><div class="hint mono" style="margin:0">${nf(x.molarMass, 3)} g/mol · ${x.density ? x.density + ' g/mL' : 'solid'}</div></div><button class="btn sm" data-act="dellib" data-id="${esc(x.id)}" aria-label="Delete ${esc(x.name)}">✕</button></div>`).join('');
  return `<div class="grid two"><div style="min-width:0"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:16px"><div><div style="font-size:24px;font-weight:600;letter-spacing:-.02em">Runs</div><div class="sub" style="margin:4px 0 0">Saved in ${storeMode}. Open one to edit, or duplicate it as a starting point.</div></div>
 <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="importrobot">Open robot .xlsx</button><button class="btn" data-act="import">Import generator .xlsx</button><button class="btn pri" data-act="new">New run</button></div></div>
 ${runsList.length ? `<div class="runs">${cards}</div>` : '<div class="card empty-note">No saved runs yet. Set one up and press Save run on the Export tab.</div>'}</div>
 <div style="min-width:0"><div class="card"><h2>Reagent library</h2><p class="sub">Saved once, picked in any run.</p><div class="list">${libH || '<div class="empty-note">Empty.</div>'}</div>
 <h3>Add</h3><div class="row"><div class="fld" style="grid-column:span 2"><label class="lbl">Name</label><input type="text" id="ln"></div><div class="fld"><label class="lbl">g/mol</label><input type="number" step="any" id="lm"></div><div class="fld"><label class="lbl">g/mL (liquid)</label><input type="number" step="any" id="ld"></div></div><button class="btn sm" style="margin-top:10px" data-act="addlib">Add to library</button></div></div></div>
 <input type="file" id="file" accept=".xlsx" hidden><input type="file" id="file2" accept=".xlsx" hidden>`;
}

/* ---------- render ---------- */
const TABS = [['setup', 'Setup'], ['combos', 'Combinations'], ['deck', 'Deck'], ['export', 'Export'], ['runs', 'Runs']];
function render() {
  const steps = TABS.filter(t => t[0] !== 'runs');
  const top = `<div class="top"><div class="topin"><div class="logo" data-act="tab" data-v="setup" style="cursor:pointer" title="Back to the run"><svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="9" fill="#15211E"/><g fill="#7FD1C2"><circle cx="10" cy="10" r="2.6"/><circle cx="17" cy="10" r="2.6"/><circle cx="24" cy="10" r="2.6"/><circle cx="10" cy="17" r="2.6"/><circle cx="24" cy="17" r="2.6"/><circle cx="10" cy="24" r="2.6"/><circle cx="17" cy="24" r="2.6"/><circle cx="24" cy="24" r="2.6"/></g><circle cx="17" cy="17" r="3.4" fill="#FFC857"/></svg>Robowski Studio</div>
 <div class="seg" role="group" aria-label="Active hood">${['left', 'right'].map(h => `<button data-act="hood" data-v="${h}" class="${S.hood === h ? 'on' : ''}"><span class="hdot" style="background:${S.hood === h ? '#1F9D6B' : '#AEB5AC'}"></span>${h === 'left' ? 'Left' : 'Right'} hood</button>`).join('')}</div>
 <div class="topr"><button class="runsl ${view === 'runs' ? 'on' : ''}" data-act="tab" data-v="runs">Runs &amp; library</button><div class="rname"><div>${esc(S.name)}</div><div class="hint" style="margin:0">${S.id ? 'Saved run' : 'Draft'} · ${storeMode}</div></div><button class="avatar" data-act="theme" aria-label="Toggle dark mode" title="Light / dark"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 2a7 7 0 0 1 0 14z" fill="currentColor"/></svg></button></div></div>
 ${view === 'runs' ? '' : `<div class="stepsbar"><nav class="steps" role="tablist">${steps.map((t, i) => `<button class="step ${view === t[0] ? 'on' : ''}" role="tab" data-act="tab" data-v="${t[0]}"><b>${i + 1}</b>${t[1]}</button>`).join('')}</nav></div>`}</div>`;
  let body;
  if (view === 'runs') body = `<div class="wrap">${runsView()}</div>`;
  else body = strip() + `<div class="${view === 'setup' ? '' : 'wrap'}">${({ setup: setupView, combos: comboView, deck: deckView, export: exportView }[view])()}</div>`;
  root.innerHTML = top + body + '<div class="tip" id="tip"></div>';
  if (view === 'setup') paintLive();
}

/* ---------- events ---------- */
function setPath(path, val) { const p = path.split('.'); let o = S; for (let i = 0; i < p.length - 1; i++)o = o[p[i]]; o[p[p.length - 1]] = val; }
document.addEventListener('input', e => {
  const t = e.target; if (!t.dataset || !t.dataset.k || t.type === 'checkbox') return;
  const k = t.dataset.k; let v = t.value;
  const textual = /(^randomize$|^name$|\.code$|\.name$|\.solvent$|reactionSolvent)/.test(k);
  if (!textual) { v = parseFloat(v); if (Number.isNaN(v)) { if (k.endsWith('density')) v = 0; else return; } }
  if (k === 'randomize') v = (v === 'true');
  setPath(k, v); compute();
  if (k === 'randomize') { render(); return; }
  if (view === 'setup') paintLive();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.type === 'checkbox' && t.dataset.k) { setPath(t.dataset.k, t.checked); compute(); render(); return; }
  if (t.dataset && t.dataset.act === 'pick' && t.value) { const x = lib.find(l => l.id === t.value); if (x) { const r = S.reagents[+t.dataset.i]; r.name = x.name; r.molarMass = x.molarMass; r.density = x.density || 0; compute(); render(); } }
  if (t.dataset && t.dataset.dp) { const dp = S.deckPlates || (S.deckPlates = C.defaultPlates(S.hood)); dp[t.dataset.dp] = t.dataset.dp === 'solventKind' ? t.value : +t.value; compute(); render(); return; }
  if (t.id === 'file' && t.files[0]) importFile(t.files[0]);
  if (t.id === 'file2' && t.files[0]) importRobot(t.files[0]);
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
  const a = b.dataset.act, v = b.dataset.v, i = +b.dataset.i, id = b.dataset.id;
  if (a === 'tab') { view = v; page = 0; render(); window.scrollTo(0, 0); }
  else if (a === 'theme') { const cur = document.documentElement.dataset.theme; const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches; document.documentElement.dataset.theme = dark ? 'light' : 'dark'; ls.set('rs.theme', dark ? 'light' : 'dark'); }
  else if (a === 'mode') { S.mode = v; compute(); render(); }
  else if (a === 'vv') { if (v === 'custom') { if ([500, 800].includes(+S.vialVolume)) S.vialVolume = +S.vialVolume + 100; } else S.vialVolume = +v; compute(); render(); }
  else if (a === 'hood') { S.hood = v; S.deckPlates = null; compute(); render(); }
  else if (a === 'unimport') { delete S.imported; S.randomize = true; compute(); render(); }
  else if (a === 'addset') { const last = S.sets[S.sets.length - 1]; S.sets.push({ name: 'Set ' + (S.sets.length + 1), items: JSON.parse(JSON.stringify(last.items)) }); compute(); render(); }
  else if (a === 'dupset') { const src = S.sets[i]; S.sets.splice(i + 1, 0, { name: src.name + ' copy', items: JSON.parse(JSON.stringify(src.items)) }); compute(); render(); }
  else if (a === 'rmset') { S.sets.splice(i, 1); compute(); render(); }
  else if (a === 'addr') { const n = S.reagents.length; const code = n < 26 ? String.fromCharCode(65 + n) + String.fromCharCode(65 + n) : 'R' + (n + 1); S.reagents.push({ code, name: '', molarMass: 100, density: 0, stock: 100, solvent: S.reactionSolvent, pipettingMode: 'empty' }); S.sets.forEach((set, si) => set.items.push({ on: si === 0, min: S.mode === 'equivalence' ? .1 : 1, step: S.mode === 'equivalence' ? .1 : 1, max: S.mode === 'equivalence' ? .2 : 2 })); compute(); render(); }
  else if (a === 'mv') { const j = i + +v; if (j >= 0 && j < S.reagents.length) { [S.reagents[i], S.reagents[j]] = [S.reagents[j], S.reagents[i]]; S.sets.forEach(set => { [set.items[i], set.items[j]] = [set.items[j], set.items[i]]; }); compute(); render(); } }
  else if (a === 'sp') { const dp = S.deckPlates || (S.deckPlates = C.defaultPlates(S.hood)); const p = +v; const k = dp.stockPlates.indexOf(p); if (k >= 0) { if (dp.stockPlates.length > 1) dp.stockPlates.splice(k, 1); } else { dp.stockPlates.push(p); dp.stockPlates.sort(); } compute(); render(); }
  else if (a === 'rmr') { S.reagents.splice(i, 1); S.sets.forEach(set => set.items.splice(i, 1)); compute(); render(); }
  else if (a === 'tolib') { const r = S.reagents[i]; if (!r.name) { toast('Give the reagent a name first.'); return; } await putLib({ id: uid(), name: r.name, molarMass: +r.molarMass || 0, density: +r.density || 0 }); toast(r.name + ' saved to the library.'); render(); }
  else if (a === 'fix') { const f = fixes[i]; if (f) { Object.assign(S, f.patch); compute(); render(); toast('Applied: ' + f.label); } }
  else if (a === 'pg') { page += +v; render(); }
  else if (a === 'fbad') { filterBad = !filterBad; page = 0; render(); }
  else if (a === 'dl') await doDownload(v);
  else if (a === 'preview') openPreview(v);
  else if (a === 'closepreview') closePreview();
  else if (a === 'previewdl') { closePreview(); await doDownload(v); }
  else if (a === 'sheet') { const m = document.getElementById('previewModal'); if (m) { m.querySelectorAll('.sheettab').forEach(t => { const on = t === b; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.classList.toggle('on', on); }); m.querySelectorAll('.sheetpane').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.v; }); } }
  else if (a === 'save') await saveRun(false);
  else if (a === 'saveas') await saveRun(true);
  else if (a === 'new') { S = normalize(exampleState()); S.name = 'new-run'; compute(); view = 'setup'; render(); }
  else if (a === 'open') { const r = runsList.find(x => x.id === id); if (r) { S = normalize(JSON.parse(JSON.stringify(r.state))); S.id = r.id; compute(); view = 'setup'; render(); } }
  else if (a === 'dup') { const r = runsList.find(x => x.id === id); if (r) { S = normalize(JSON.parse(JSON.stringify(r.state))); S.id = null; S.name = r.name + '-copy'; compute(); view = 'setup'; render(); toast('Duplicated. Save it to keep the copy.'); } }
  else if (a === 'del') { await delRun(id); render(); }
  else if (a === 'card') { const r = runsList.find(x => x.id === id); if (r) { try { const rr = C.buildRun(withColors(r.state)); await saveFile('run_card_' + safe(r.name) + '.png', await C.runCardPngBytes(rr)); } catch (er) { toast('Could not draw the card: ' + er.message); } } }
  else if (a === 'import') { const f = $('#file'); if (f) f.click(); }
  else if (a === 'importrobot') { const f = $('#file2'); if (f) f.click(); }
  else if (a === 'addlib') { const n = $('#ln').value.trim(); if (!n) return; await putLib({ id: uid(), name: n, molarMass: parseFloat($('#lm').value) || 0, density: parseFloat($('#ld').value) || 0 }); render(); }
  else if (a === 'dellib') { await delLib(id); render(); }
});
function withColors(st) { const d = JSON.parse(JSON.stringify(st)); d.reagents.forEach((r, i) => { r.color = PAL[i % 6]; }); return d; }
const safe = s => String(s || 'run').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40);
async function importFile(f) {
  try { const d = await C.importGenerator(f); delete S.sets; Object.assign(S, exampleState(), { name: f.name.replace(/\.xlsx$/i, '') }, { mode: d.mode, vialVolume: d.vialVolume, threshold: d.threshold, dilutionFactor: d.dilutionFactor, reactionSolvent: d.reactionSolvent, reagents: d.reagents.map(r => ({ code: r.code, name: r.name, molarMass: r.molarMass, density: r.density, stock: r.stock, solvent: r.solvent, min: r.min, step: r.step, max: r.max, pipettingMode: 'empty' })) }); delete S.sets; normalize(S); S.id = null; compute(); view = 'setup'; render(); toast('Imported ' + f.name); }
  catch (e) { toast('Could not read that workbook: ' + e.message); }
}
async function importRobot(f) {
  try {
    const d = await C.importRobotWorkbook(f);
    const st = exampleState();
    Object.assign(st, { name: d.name, mode: 'concentration', vialVolume: d.vialVolume, threshold: d.threshold, dilutionFactor: d.dilutionFactor, reactionSolvent: d.reactionSolvent, randomize: false, solventAfter: d.solventAfter, reagents: d.reagents, imported: { name: d.name, rows: d.rows, skipped: d.skipped } });
    delete st.sets; if (d.deckPlates) st.deckPlates = d.deckPlates;
    S = normalize(st); S.id = null; compute();
    let differ = 0;
    if (run) { run.rows.forEach((row, k) => { const fr = d.fileRows[k]; if (!fr) return; let bad = false; for (const key of d.volCols) { const a = +row['vol#' + key] || 0, b = fr[key] || 0; if (Math.abs(a - b) > 1e-4) { bad = true; break; } } if (bad) differ++; }); }
    const notes = [`Rebuilt ${d.rows.length} vials` + (d.skipped ? ` (${d.skipped} empty rows skipped)` : '') + `; vial volume ${nf(d.vialVolume, 1)} µL, dilution factor ${nf(d.dilutionFactor, 2)}, threshold set to ${nf(d.threshold, 1)} µL.`];
    notes.push(differ ? `${differ} vials come out with different volumes than the file, because the app recalculates volumes from the concentrations.` : 'Every vial reproduces the file\'s volumes exactly.');
    notes.push('Molar masses are not stored in a robot file, so stock-preparation masses are left out. Fill them in under Reagents if you need them.');
    S.imported.note = notes.join(' '); S.imported.differ = differ > 0;
    view = 'setup'; render(); toast('Opened ' + f.name);
  } catch (e) { toast('Could not read that workbook: ' + e.message); }
}
async function saveFile(name, data) {
  let dl = null; try { dl = globalThis.claude && await globalThis.claude.use('downloads'); } catch (e) { }
  if (!dl) { try { const blob = data instanceof Blob ? data : new Blob([data]); const url = URL.createObjectURL(blob); const el = document.createElement('a'); el.href = url; el.download = name; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); toast('Downloaded ' + name); } catch (e) { toast('Could not download ' + name + ': ' + (e && e.message || e)); } return; }
  try { await dl.save({ filename: name, data }); toast('Saved ' + name); } catch (e) { if (e && e.code === 'declined') return; toast('Could not save ' + name + ': ' + (e && e.message || e)); }
}
async function doDownload(kind) {
  if (!run || run.blockingIssues > 0) return;
  try {
    if (kind === 'xlsx') await saveFile('robowski_run.xlsx', C.workbookBytes(data(), run));
    else if (kind === 'stock') await saveFile('stock_preparation.csv', C.stockCsv(run));
    else if (kind === 'load') await saveFile('deck_load_checklist.csv', C.loadCsv(run));
    else if (kind === 'png') await saveFile('run_card.png', await C.runCardPngBytes(run));
    else if (kind === 'zip') { let png = null; try { png = await C.runCardPngBytes(run); } catch (e) { } await saveFile('robowski_package.zip', C.packageBytes(run, png)); }
    status = 'exported';
  } catch (e) { toast('Export failed: ' + e.message); }
}
async function openPreview(kind) {
  if (!run || run.blockingIssues > 0) return;
  const meta = { xlsx: ['robowski_run.xlsx', 'Excel workbook', 'Binary · 5 sheets'], stock: ['stock_preparation.csv', 'Stock preparation', 'CSV · comma-separated'], load: ['deck_load_checklist.csv', 'Deck load checklist', 'CSV · comma-separated'], png: ['run_card.png', 'Run card image', 'PNG · 1200 × 900'], zip: ['robowski_package.zip', 'Complete package', 'ZIP · all files bundled'] }[kind];
  let body = '', foot = '';
  try {
    if (kind === 'stock' || kind === 'load') {
      const text = kind === 'stock' ? C.stockCsv(run) : C.loadCsv(run);
      const rows = text.replace(/^\ufeff/, '').split('\r\n').filter(r => r.length).map(r => r.split(','));
      const head = rows[0] || [];
      const previewRows = rows.slice(0, 200);
      body = `<div class="preview-meta"><span><b>${meta[1]}</b></span><span>${meta[2]}</span><span><b>${rows.length - 1}</b> rows</span></div>
 <div class="tbl" style="max-height:58vh"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${previewRows.slice(1).map(r => `<tr>${head.map((_, ci) => `<td>${esc(r[ci] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
 ${rows.length > 201 ? `<div class="hint" style="margin-top:10px">Showing 200 of ${rows.length - 1} rows. Download to see all.</div>` : ''}`;
      foot = `<button class="btn" data-act="closepreview">Close</button><button class="btn pri" data-act="previewdl" data-v="${kind}">Download</button>`;
    } else if (kind === 'png') {
      const png = await C.runCardPngBytes(run);
      const url = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
      body = `<div class="preview-meta"><span><b>${meta[1]}</b></span><span>${meta[2]}</span><span><b>${(png.length / 1024).toFixed(0)}</b> KB</span></div><div class="preview-svg" style="text-align:center"><img src="${url}" alt="Run card preview" style="max-width:100%;border-radius:10px;box-shadow:var(--shadow-md)" id="previewImg"></div>`;
      foot = `<button class="btn" data-act="closepreview">Close</button><button class="btn pri" data-act="previewdl" data-v="${kind}">Download</button>`;
    } else if (kind === 'xlsx') {
      const wb = C.workbookBytes(data(), run);
      const sheets = C.workbookSheets(run);
      const tabs = sheets.map((s, i) => `<button class="sheettab" data-act="sheet" data-v="${i}" data-i="${i}" role="tab"${i === 0 ? ' aria-selected="true"' : ''}>${esc(s.name)}</button>`).join('');
      const panes = sheets.map((s, i) => {
        const head = (s.rows[0] || []).map(h => `<th>${esc(h == null ? '' : h)}</th>`).join('');
        const dataRows = s.rows.slice(1, 201);
        const total = s.rows.length - 1;
        const rowsHtml = dataRows.map(r => `<tr>${(s.rows[0] || []).map((_, ci) => `<td>${esc(r[ci] == null ? '' : r[ci])}</td>`).join('')}</tr>`).join('');
        return `<div class="sheetpane" data-pane="${i}"${i === 0 ? '' : ' hidden'}><div class="tbl" style="max-height:52vh"><table><thead><tr>${head}</tr></thead><tbody>${rowsHtml || '<tr><td colspan="99" class="empty-note">Empty sheet.</td></tr>'}</tbody></table></div>${total > 200 ? `<div class="hint" style="margin-top:8px">Showing 200 of ${total} rows. Download to see all.</div>` : `<div class="hint" style="margin-top:8px">${total} row${total === 1 ? '' : 's'}.</div>`}</div>`;
      }).join('');
      body = `<div class="preview-meta"><span><b>${meta[1]}</b></span><span>${meta[2]}</span><span><b>${(wb.length / 1024).toFixed(0)}</b> KB</span><span><b>${sheets.length}</b> sheets</span></div>
 <div class="sheettabs" role="tablist">${tabs}</div>${panes}`;
      foot = `<button class="btn" data-act="closepreview">Close</button><button class="btn pri" data-act="previewdl" data-v="${kind}">Download</button>`;
    } else if (kind === 'zip') {
      const wb = C.workbookBytes(data(), run);
      let pngSize = 0; try { pngSize = (await C.runCardPngBytes(run)).length; } catch (e) { }
      const items = [['robowski_run.xlsx', wb.length], ['stock_preparation.csv', C.stockCsv(run).length], ['deck_load_checklist.csv', C.loadCsv(run).length], ['run_card.svg', C.runCardSvg(run).length], ['run_card.png', pngSize]];
      body = `<div class="preview-meta"><span><b>${meta[1]}</b></span><span>${meta[2]}</span><span><b>${items.length}</b> files</span></div>
 <div class="list">${items.map(it => `<div><b class="mono" style="min-width:220px">${esc(it[0])}</b><span class="mono" style="color:var(--fg2)">${(it[1] / 1024).toFixed(1)} KB</span></div>`).join('')}</div>
 <div class="hint" style="margin-top:12px">All four exports plus the SVG run card in one zip.</div>`;
      foot = `<button class="btn" data-act="closepreview">Close</button><button class="btn pri" data-act="previewdl" data-v="${kind}">Download</button>`;
    }
  } catch (e) {
    body = `<div class="issue bad"><span>Could not build the preview: ${esc(e.message)}</span></div>`;
    foot = `<button class="btn" data-act="closepreview">Close</button>`;
  }
  const overlay = document.createElement('div');
  overlay.id = 'previewModal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div class="mt">Preview <b>${esc(meta[0])}</b></div><button class="ib" data-act="closepreview" aria-label="Close preview" title="Close">✕</button></div><div class="modal-body">${body}</div><div class="modal-foot">${foot}</div></div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closePreview(); });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', escPreview, true);
}
function escPreview(e) { if (e.key === 'Escape') closePreview(); }
function closePreview() {
  const m = document.getElementById('previewModal'); if (m) {
    const img = m.querySelector('#previewImg'); if (img && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    m.remove();
  }
  document.removeEventListener('keydown', escPreview, true);
}

async function saveRun(asNew) {
  if (!run) { toast('Fix the input error first.'); return; }
  if (asNew || !S.id) S.id = uid();
  const stocks = Object.keys(run.stocks).length;
  const sm = { id: S.id, name: S.name, mode: S.mode, hood: S.hood, reactions: run.reactions, plates: run.plates, tips: tipsText(), stocks, codes: S.reagents.map(r => r.code), colors: S.reagents.map((r, i) => rcol(i)), status, updated: Date.now(), state: JSON.parse(JSON.stringify(S)) };
  try { await putRun(sm); toast('Saved "' + S.name + '".'); } catch (e) { toast('Could not save: ' + (e && e.message || e)); }
}

/* tooltip for recipes */
document.addEventListener('mouseover', e => {
  const el = e.target.closest('[data-row],[data-stock]'); const tip = $('#tip'); if (!tip) return;
  if (!el || !run) { tip.style.display = 'none'; return; }
  let html = '';
  if (el.dataset.row != null) html = recipeText(run.rows[+el.dataset.row]);
  else { const k = el.dataset.stock; if (k === 'solvent') html = `<b>${esc(S.reactionSolvent)}</b><br>${nf(run.solventConsumptionMl, 2)} mL used + ${S.leftoverMl} mL leftover`; else { const s = run.stocks[k]; if (s) html = `<b>${esc(k)}</b> · ${nf(s.concentration_mM, 1)} mM in ${esc(s.solvent)}<br>${nf(s.consumption_uL / 1000, 2)} mL used + ${S.leftoverMl} mL leftover<br>${esc(s.dilution_label)}`; } }
  tip.innerHTML = html; tip.style.display = 'block';
  const r = el.getBoundingClientRect(); tip.style.left = Math.max(8, Math.min(innerWidth - 300, r.left)) + 'px'; tip.style.top = (r.bottom + 8 > innerHeight - 120 ? r.top - tip.offsetHeight - 8 : r.bottom + 8) + 'px';
});
document.addEventListener('mouseout', e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-row],[data-stock]')) { const t = $('#tip'); if (t) t.style.display = 'none'; } });

/* ---------- boot ---------- */
  const th = ls.get('rs.theme'); if (th) document.documentElement.dataset.theme = th;
  try { const d = JSON.parse(ls.get('rs.draft') || 'null'); if (d && d.reagents && d.reagents.length >= 2) S = normalize(d); } catch (e) { }
  compute(); render();
  void initStore().then(() => render());
}
