// EN / 中文 toggle + vocab popup

(function () {
  'use strict';

  // ── Language toggle ──────────────────────────────────────────────────────

  const STORAGE_KEY = 'aib-lang';
  const html = document.documentElement;
  const toggleBtn = document.getElementById('langToggle');

  function setLang(lang) {
    html.setAttribute('data-lang', lang);
    localStorage.setItem(STORAGE_KEY, lang);

    // Swap every element that carries both data-en and data-zh
    document.querySelectorAll('[data-en][data-zh]').forEach(el => {
      el.textContent = el.dataset[lang] ?? el.textContent;
    });

    // Update toggle button label
    if (toggleBtn) {
      const span = toggleBtn.querySelector('span');
      if (span) span.textContent = lang === 'en' ? '中文' : 'English';
    }
  }

  function initLang() {
    const saved = localStorage.getItem(STORAGE_KEY) || 'en';
    setLang(saved);
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = html.getAttribute('data-lang') || 'en';
      setLang(current === 'en' ? 'zh' : 'en');
    });
  }

  initLang();

  // ── Vocab popup ──────────────────────────────────────────────────────────

  const popup = document.getElementById('vocabPopup');
  if (!popup) return;

  // Build a lookup map: lowercase word → entry, from .vocab-item elements in the DOM
  const vocabMap = {};
  document.querySelectorAll('.vocab-item').forEach(item => {
    const word = item.querySelector('.vocab-word')?.textContent?.trim().toLowerCase();
    if (!word) return;
    vocabMap[word] = {
      word:   item.querySelector('.vocab-word')?.textContent?.trim() ?? '',
      ipa:    item.querySelector('.vocab-ipa')?.textContent?.trim() ?? '',
      pos:    item.querySelector('.vocab-pos')?.textContent?.trim() ?? '',
      def_en: item.querySelector('.vocab-def')?.dataset?.en ?? item.querySelector('.vocab-def')?.textContent?.trim() ?? '',
      def_zh: item.querySelector('.vocab-def')?.dataset?.zh ?? '',
    };
  });

  function showPopup(mark, entry) {
    const lang = html.getAttribute('data-lang') || 'en';
    const def = lang === 'zh' && entry.def_zh ? entry.def_zh : entry.def_en;

    popup.innerHTML =
      `<div class="popup-word">${entry.word}` +
      (entry.ipa ? ` <span style="font-weight:400;color:#9ca3af">${entry.ipa}</span>` : '') +
      (entry.pos ? ` <span style="font-size:.7rem;color:#60a5fa">${entry.pos}</span>` : '') +
      `</div><div class="popup-def">${def}</div>`;

    popup.classList.add('visible');
    popup.setAttribute('aria-hidden', 'false');

    // Position below the mark, clamped to viewport
    const rect = mark.getBoundingClientRect();
    let top  = rect.bottom + 8 + window.scrollY;
    let left = rect.left + window.scrollX;
    const pw = popup.offsetWidth;
    if (left + pw > window.innerWidth - 12) left = window.innerWidth - pw - 12;
    popup.style.top  = `${top}px`;
    popup.style.left = `${Math.max(8, left)}px`;
  }

  function hidePopup() {
    popup.classList.remove('visible');
    popup.setAttribute('aria-hidden', 'true');
  }

  // Delegated click handler for all vocab highlights
  document.addEventListener('click', e => {
    const mark = e.target.closest('mark.vocab-highlight');
    if (mark) {
      e.stopPropagation();
      const key = mark.dataset.word?.toLowerCase();
      const entry = key && vocabMap[key];
      if (entry) { showPopup(mark, entry); return; }
    }
    hidePopup();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hidePopup();
  });
})();
