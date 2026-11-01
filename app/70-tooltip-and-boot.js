      // APP 70 - tooltips, keyboard shortcuts for tabs, and the start-up code (loads the draft, first render, then connects the store).
      // ------------------------------------------------------------
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
      function boot() {
        const th = ls.get('rs.theme'); if (th) document.documentElement.dataset.theme = th;
        try { const d = JSON.parse(ls.get('rs.draft2') || 'null'); if (d && d.reagents && d.reagents.length >= 2) S = normalize(d); } catch (e) { }
        document.addEventListener('keydown', e => { const rb = e.target && e.target.matches && e.target.matches('div[role="button"][data-act]'); if (rb && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.target.click(); } });
        document.addEventListener('keydown', e => {
          const t = e.target && e.target.closest && e.target.closest('[role="tab"]'); if (!t || !t.classList.contains('step')) return;
          const k = e.key; if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(k)) return;
          const tabs = [...document.querySelectorAll('#stepsnav .step:not(.lock)')]; if (!tabs.length) return; let i = tabs.indexOf(t); if (i < 0) i = 0;
          i = k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : (i + (k === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          e.preventDefault(); const v = tabs[i].dataset.v; tabs[i].click(); setTimeout(() => { const n = document.querySelector('#stepsnav .step[data-v="' + v + '"]'); if (n) n.focus(); }, 0);
        });
        document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveRun(false); } });
        compute(); render();
        initStore().then(() => render());
      }
      if (!window.__rsGateLocked) boot(); else window.__rsBoot = boot;
    })();
