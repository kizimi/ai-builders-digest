// Builder digest: expand/collapse, Got it, progress bar, tooltips, favorites

(function () {
  'use strict';

  // ── Favorites helpers ─────────────────────────────────────────────────────
  var FAV_KEY = 'ai_digest_favorites';
  var FAV_ICON_EMPTY  = '<svg class="fav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  var FAV_ICON_FILLED = '<svg class="fav-icon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

  function getFavs() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; }
  }

  function saveFavs(favs) {
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDateFav(isoDate) {
    var d = new Date(isoDate + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  // ── Favorites page ────────────────────────────────────────────────────────
  var favRoot = document.getElementById('favRoot');

  function updateFavCount() {
    var countEl = document.querySelector('.fav-count');
    if (countEl) countEl.textContent = '(' + getFavs().length + ')';
  }

  function renderFavorites(root) {
    var favs = getFavs().slice().sort(function (a, b) { return b.savedAt - a.savedAt; });

    if (favs.length === 0) {
      root.innerHTML = '<p class="fav-empty">No favorites yet. Star a tweet on today\'s digest to save it here.</p>';
      return;
    }

    var byDate = {};
    favs.forEach(function (f) {
      if (!byDate[f.date]) byDate[f.date] = [];
      byDate[f.date].push(f);
    });

    var dates = Object.keys(byDate).sort(function (a, b) { return b.localeCompare(a); });
    var xIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';

    var html = '<div class="fav-page">';
    html += '<h1 class="fav-title">Favorites <span class="fav-count">(' + favs.length + ')</span></h1>';

    dates.forEach(function (date) {
      html += '<div class="fav-group">';
      html += '<div class="fav-date-label">' + escHtml(formatDateFav(date)) + '</div>';
      byDate[date].forEach(function (f) {
        html += '<div class="fav-item" data-id="' + escHtml(f.id) + '">';
        html += '<div class="fav-item-meta"><span class="fav-handle">@' + escHtml(f.handle) + '</span> <span class="fav-name">' + escHtml(f.name) + '</span></div>';
        html += '<p class="fav-text">' + escHtml(f.text) + '</p>';
        html += '<div class="fav-item-footer">';
        html += '<button class="fav-btn faved" data-id="' + escHtml(f.id) + '" data-handle="' + escHtml(f.handle) + '" data-name="' + escHtml(f.name) + '" data-text="' + escHtml(f.text) + '" data-url="' + escHtml(f.url) + '" data-date="' + escHtml(f.date) + '" aria-label="Remove from favorites">' + FAV_ICON_FILLED + '</button>';
        html += '<a href="' + escHtml(f.url) + '" class="tweet-link-icon" target="_blank" rel="noopener" aria-label="View on X" title="View on X">' + xIcon + '</a>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
    });

    html += '</div>';
    root.innerHTML = html;
  }

  if (favRoot) {
    renderFavorites(favRoot);
  }

  // ── Restore star state on digest pages ────────────────────────────────────
  if (!favRoot) {
    var favIds = getFavs().reduce(function (acc, f) { acc[f.id] = true; return acc; }, {});
    document.querySelectorAll('.fav-btn').forEach(function (btn) {
      if (favIds[btn.dataset.id]) {
        btn.classList.add('faved');
        btn.innerHTML = FAV_ICON_FILLED;
      }
    });
  }

  // ── Fav toggle ────────────────────────────────────────────────────────────
  function handleFav(btn) {
    var id = btn.dataset.id;
    var favs = getFavs();
    var idx = favs.findIndex(function (f) { return f.id === id; });

    if (idx === -1) {
      favs.push({
        id:      btn.dataset.id,
        text:    btn.dataset.text,
        url:     btn.dataset.url,
        handle:  btn.dataset.handle,
        name:    btn.dataset.name,
        date:    btn.dataset.date,
        savedAt: Date.now(),
      });
      btn.classList.add('faved');
      btn.innerHTML = FAV_ICON_FILLED;
    } else {
      favs.splice(idx, 1);
      btn.classList.remove('faved');
      btn.innerHTML = FAV_ICON_EMPTY;
      var favItem = btn.closest('.fav-item');
      if (favItem) {
        favItem.style.transition = 'opacity .25s ease, max-height .3s ease';
        favItem.style.overflow   = 'hidden';
        favItem.style.maxHeight  = favItem.offsetHeight + 'px';
        void favItem.offsetHeight;
        favItem.style.opacity   = '0';
        favItem.style.maxHeight = '0';
        favItem.addEventListener('transitionend', function () {
          favItem.remove();
          updateFavCount();
          if (getFavs().length === 0 && favRoot) {
            favRoot.innerHTML = '<p class="fav-empty">No favorites yet. Star a tweet on today\'s digest to save it here.</p>';
          }
        }, { once: true });
      }
    }
    saveFavs(favs);
  }

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

    const favBtn = e.target.closest('.fav-btn');
    if (favBtn) { handleFav(favBtn); return; }

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
