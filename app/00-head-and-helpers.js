      // APP 00 - page-side helpers. C is the calculation engine (RobowskiCore).
      // PAL = reagent colours on screen, SOLV = solvent choices in the dropdown, esc() = escape text for HTML (use it for every
      // user string), ls = safe localStorage wrapper.
      // ------------------------------------------------------------
/* Robowski Studio v1 - UI. Engine: window.RobowskiCore (engine.js). Generates files only; never talks to the robot. */
    (function () {
      'use strict';
      const C = globalThis.RobowskiCore;
      // Reagent colours (change here to recolour badges and deck bottles).
      const PAL = ['#0E6F63', '#A94A12', '#5B3FA8', '#1F6AA5', '#8A2D5B', '#4A6B1F', '#B07D12', '#286C8B', '#A13B6B', '#6B6B6B', '#2F7D32', '#B3261E'];
      // Solvent dropdown options.
      const SOLV = ['ethanol', 'water', 'DMF', 'Dioxane', 'DCE', 'MeCN', 'glycerin', 'serum', 'DMSO', 'CHCl3'];
      const $ = s => document.querySelector(s);
      // HTML-escape. Always wrap user text in esc() before putting it into a template.
      const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      // Number formatting for display.
      const nf = (v, d = 2) => Number.isFinite(+v) ? (+v).toLocaleString('en-US', { maximumFractionDigits: d }) : '-';
      // localStorage with try/catch. keep() throws if the browser blocks storage.
      const ls = { get(k) { try { return localStorage.getItem(k) } catch (e) { return null } }, set(k, v) { try { localStorage.setItem(k, v); return true } catch (e) { return false } }, keep(k, v) { if (!this.set(k, v)) throw new Error('this browser blocked or ran out of storage, so it is kept in memory only until you reload'); } };

