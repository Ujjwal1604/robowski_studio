      // APP 00 - page-side helpers. C is the calculation engine (RobowskiCore).
      // PAL = reagent colours on screen, SOLV = solvent choices in the dropdown, esc() = escape text for HTML (use it for every
      // user string), ls = safe localStorage wrapper.
      // ------------------------------------------------------------
/* Robowski Studio v1 - UI. Engine: window.RobowskiCore (engine.js). Generates files only; never talks to the robot. */
    (function () {
      'use strict';

      /* ---------- shared password gate ---------- */
      const GATE_PASS = 'robowski2024'; // change this to set your shared password
      (function gate() {
        const sessionKey = 'rs.gate';
        try { if (sessionStorage.getItem(sessionKey) === 'ok') { const g = document.getElementById('gate'); if (g) g.hidden = true; const app = document.getElementById('app'); if (app) app.hidden = false; window.__rsGateLocked = false; return; } } catch (e) { }
        const g = document.getElementById('gate'); const app = document.getElementById('app');
        if (!g || !app) return;
        const dark = matchMedia('(prefers-color-scheme:dark)').matches;
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        g.innerHTML = `<div class="gate-card"><div class="gate-logo"><svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="9" fill="#15211E"/><g fill="#7FD1C2"><circle cx="10" cy="10" r="2.6"/><circle cx="17" cy="10" r="2.6"/><circle cx="24" cy="10" r="2.6"/><circle cx="10" cy="17" r="2.6"/><circle cx="24" cy="17" r="2.6"/><circle cx="10" cy="24" r="2.6"/><circle cx="17" cy="24" r="2.6"/><circle cx="24" cy="24" r="2.6"/></g><circle cx="17" cy="17" r="3.4" fill="#FFC857"/></svg></div><div class="gate-title">Robowski Studio</div><div class="gate-sub">Enter the shared password to continue.</div><form id="gateForm"><input type="password" class="gate-input" id="gateInput" placeholder="Password" autocomplete="off" aria-label="Password"><button type="submit" class="gate-btn">Enter</button></form><div class="gate-err" id="gateErr"></div></div>`;
        const form = document.getElementById('gateForm');
        const input = document.getElementById('gateInput');
        const err = document.getElementById('gateErr');
        input.focus();
        form.addEventListener('submit', e => {
          e.preventDefault();
          if (input.value === GATE_PASS) {
            try { sessionStorage.setItem(sessionKey, 'ok'); } catch (ex) { }
            window.__rsGateUnlocked();
          } else {
            err.textContent = 'Incorrect password. Try again.';
            input.value = ''; input.focus();
            input.style.borderColor = 'var(--bad)';
            setTimeout(() => { input.style.borderColor = ''; }, 1500);
          }
        });
        // Signal to the boot code that the gate is still active.
        // When the password is correct, gateUnlocked() reveals the app and calls the boot.
        window.__rsGateLocked = true;
        window.__rsGateUnlocked = function () {
          g.hidden = true; app.hidden = false;
          window.__rsGateLocked = false;
          if (typeof window.__rsBoot === 'function') window.__rsBoot();
        };
      })();


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
    }
    )

