// Builder digest: expand/collapse, Got it, progress bar, tooltips

(function () {
  'use strict';

  const cards = Array.from(document.querySelectorAll('.builder-card'));
  const TOTAL = cards.length;
  let done = 0;
  const archived = []; // { card, parent, nextSibling }

  // ── Elements ──────────────────────────────────────────────────────────────
  const fillEl         = document.getElementById('progressFill');
  const progressTextEl = document.getElementById('progressText');
  const subLabelEl     = document.querySelector('.sub-label');
  const allDoneBanner  = document.getElementById('allDoneBanner');

  // ── Progress ──────────────────────────────────────────────────────────────
  function updateProgress() {
    const pct = TOTAL ? (done / TOTAL) * 100 : 0;
    if (fillEl)         fillEl.style.width = pct + '%';
    if (progressTextEl) progressTextEl.textContent = done + ' / ' + TOTAL + ' done';
    if (subLabelEl)     subLabelEl.textContent = 'BUILDERS · ' + (TOTAL - done);
    if (done === TOTAL && TOTAL > 0 && allDoneBanner) {
      allDoneBanner.hidden = false;
    }
  }

  // ── Expand / Collapse ─────────────────────────────────────────────────────
  function origBlock(idx) { return document.getElementById('orig-' + idx); }
  function expandBtnFor(idx) { return document.querySelector('.expand-btn[data-expand="' + idx + '"]'); }

  function setExpanded(idx, open) {
    const block = origBlock(idx);
    const btn   = expandBtnFor(idx);
    if (!block) return;
    if (open) {
      block.hidden = false;
      if (btn) { btn.textContent = btn.textContent.replace('▶', '▼'); btn.classList.add('expanded'); }
    } else {
      block.hidden = true;
      if (btn) { btn.textContent = btn.textContent.replace('▼', '▶'); btn.classList.remove('expanded'); }
    }
  }

  // ── Delegated click handler ────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    if (e.target.closest('#restoreBtn')) { restoreAll(); return; }

    const gotBtn = e.target.closest('.got-it-btn');
    if (gotBtn) { handleGotIt(gotBtn, e); return; }

    const header   = e.target.closest('.builder-header[data-expand]');
    const expBtn   = e.target.closest('.expand-btn[data-expand]');
    const trigger  = header || expBtn;
    if (trigger) {
      const idx   = trigger.dataset.expand;
      const block = origBlock(idx);
      if (block) setExpanded(idx, block.hidden);
    }
  });

  // ── Got it ────────────────────────────────────────────────────────────────
  function handleGotIt(btn, e) {
    if (btn.classList.contains('done')) return;
    const card = btn.closest('.builder-card');
    if (!card) return;

    // Ripple effect
    const rect   = btn.getBoundingClientRect();
    const size   = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = [
      'width:'  + size + 'px',
      'height:' + size + 'px',
      'left:'   + (e.clientX - rect.left - size / 2) + 'px',
      'top:'    + (e.clientY - rect.top  - size / 2) + 'px',
    ].join(';');
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', function () { ripple.remove(); });

    btn.classList.add('done');
    btn.textContent = '✓ Done';

    setTimeout(function () { dismissCard(card); }, 420);
  }

  function dismissCard(card) {
    archived.push({ card: card, parent: card.parentNode, nextSibling: card.nextSibling });

    const h = card.offsetHeight;
    card.style.height      = h + 'px';
    card.style.overflow    = 'hidden';
    card.style.transition  = [
      'height .35s ease',
      'opacity .35s ease',
      'margin-bottom .35s ease',
      'padding-top .35s ease',
      'padding-bottom .35s ease',
      'border-bottom-width .35s ease',
    ].join(',');

    void card.offsetHeight; // force reflow

    card.style.height            = '0';
    card.style.opacity           = '0';
    card.style.marginBottom      = '0';
    card.style.paddingTop        = '0';
    card.style.paddingBottom     = '0';
    card.style.borderBottomWidth = '0';

    card.addEventListener('transitionend', function () {
      card.remove();
      done++;
      updateProgress();
    }, { once: true });
  }

  // ── Restore all ───────────────────────────────────────────────────────────
  function restoreAll() {
    if (allDoneBanner) allDoneBanner.hidden = true;
    done = 0;

    archived.forEach(function (entry) {
      const card = entry.card;
      card.removeAttribute('style');

      const btn = card.querySelector('.got-it-btn');
      if (btn) { btn.classList.remove('done'); btn.textContent = '✦ Got it'; }

      const idx = card.dataset.idx;
      if (idx !== undefined) setExpanded(idx, false);

      const parent = entry.parent;
      const next   = entry.nextSibling;
      if (next && next.parentNode === parent) {
        parent.insertBefore(card, next);
      } else {
        parent.appendChild(card);
      }
    });

    archived.length = 0;
    updateProgress();
  }

  // ── Tooltip flip (near viewport top) ─────────────────────────────────────
  document.addEventListener('mouseover', function (e) {
    const wrap = e.target.closest('.kw-wrap');
    if (!wrap) return;
    const tip = wrap.querySelector('.kw-tip');
    if (!tip) return;
    requestAnimationFrame(function () {
      const rect = tip.getBoundingClientRect();
      tip.classList.toggle('flip-down', rect.top < 4);
    });
  });

  // ── Staggered entrance animation ──────────────────────────────────────────
  cards.forEach(function (card, i) {
    card.style.animationDelay = (i * 55) + 'ms';
  });

  updateProgress();
})();
