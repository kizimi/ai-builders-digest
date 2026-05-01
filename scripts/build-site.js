#!/usr/bin/env node

// Reads all data/YYYY-MM-DD.json files and renders static HTML:
//   site/index.html              — today's digest (two-module layout)
//   site/archive/YYYY-MM-DD.html — per-day archive pages
//   site/archive.html            — chronological archive list

import { readFile, writeFile, readdir, mkdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DATA_DIR   = join(PROJECT_ROOT, 'data');
const SITE_DIR   = join(PROJECT_ROOT, 'site');
const PUBLIC_DIR = join(PROJECT_ROOT, 'public');

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(isoDate) {
  const d = new Date(isoDate + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function shortDate(isoDate) {
  const d = new Date(isoDate + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getInitials(name) {
  return name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function getBadge(builder) {
  const text = ((builder.summary_en || '') + ' ' + (builder.tweets || []).map(t => t.text).join(' ')).toLowerCase();
  if (/\b(launch(ed|ing)?|released?|shipped?|introduc(ed|ing)|announc(ed|ing)|new feature)\b/.test(text)) {
    return { emoji: '🚀', cls: 'badge-launch', label: 'launch' };
  }
  if (builder.slang?.length > 0 || /\b(insight|analys(is|ed)|lesson|reali[sz](ed|ing)|reflect(ion|ed)|thinking about)\b/.test(text)) {
    return { emoji: '💡', cls: 'badge-insight', label: 'insight' };
  }
  return { emoji: '🔥', cls: 'badge-trending', label: 'trending' };
}

// Find vocab entries that appear in a builder's tweets
function builderVocab(builder, allVocab) {
  if (!allVocab || allVocab.length === 0) return [];
  const tweetsText = (builder.tweets || []).map(t => t.text).join(' ').toLowerCase();
  return allVocab.filter(v => tweetsText.includes(v.word.toLowerCase()));
}

// URL pattern (works on already-HTML-escaped text — & becomes &amp; which still matches \S+).
// Excludes whitespace and HTML special chars to avoid swallowing closing tags.
const URL_PATTERN = 'https?:\\/\\/[^\\s<>"]+';

function renderInlineUrl(urlMatch) {
  // Strip a single trailing punctuation char (period, comma, etc.) so it stays outside the link
  const trail = urlMatch.match(/[.,;:!?)"'\]]+$/);
  const href  = trail ? urlMatch.slice(0, -trail[0].length) : urlMatch;
  const after = trail ? trail[0] : '';
  return '<a href="' + href + '" class="tweet-inline-link" target="_blank" rel="noopener">' + href + '</a>' + after;
}

// Single-pass tweet renderer: linkifies URLs AND wraps keywords with .kw-wrap/.kw + .kw-tip.
// Accepts entries with either {phrase} (per-builder keywords) or {word} (global vocab).
function highlightKeywords(rawText, entries) {
  const escaped = escapeHtml(rawText);

  const items = (entries || [])
    .map(e => ({ ...e, _text: e.phrase || e.word || '' }))
    .filter(e => e._text);

  // No keywords → just linkify URLs
  if (items.length === 0) {
    return escaped.replace(new RegExp(URL_PATTERN, 'g'), renderInlineUrl);
  }

  const sorted = [...items].sort((a, b) => b._text.length - a._text.length);
  const byText = {};
  for (const v of sorted) byText[v._text.toLowerCase()] = v;

  const kwPattern = sorted
    .map(v => escapeHtml(v._text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  // Combined regex — URLs first so they win when both could match a position
  const regex = new RegExp('(' + URL_PATTERN + ')|(' + kwPattern + ')', 'gi');

  return escaped.replace(regex, (match, urlMatch, kwMatch) => {
    if (urlMatch) return renderInlineUrl(urlMatch);
    if (kwMatch) {
      const v = byText[kwMatch.toLowerCase()];
      if (!v) return kwMatch;
      const tip = [
        '<span class="kw-tip">',
        '<span class="kw-tip-term">' + escapeHtml(v._text) + '</span>',
        v.ipa           ? '<span class="kw-tip-ipa">'  + escapeHtml(v.ipa)           + '</span>' : '',
        v.definition_zh ? '<span class="kw-tip-zh">'   + escapeHtml(v.definition_zh) + '</span>' : '',
        (v.example_zh || v.definition_zh)
          ? '<span class="kw-tip-exp">' + escapeHtml(v.example_zh || v.definition_zh) + '</span>'
          : '',
        '</span>',
      ].join('');
      return '<span class="kw-wrap"><span class="kw">' + escapeHtml(kwMatch) + '</span>' + tip + '</span>';
    }
    return match;
  });
}

// Remove " — Author" attribution sometimes appended to quote text
function stripAttribution(text) {
  return text.replace(/\s*[—–-]\s+\S.*$/, '').trim();
}

// ── HTML Shell ─────────────────────────────────────────────────────────────

function shell(title, bodyHtml, { depth = 0, date = '' } = {}) {
  const root      = depth === 0 ? '.' : '..';
  const dateLabel = date ? escapeHtml(shortDate(date)) : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@300..700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${root}/style.css">
</head>
<body>
  <nav class="top-nav">
    <a class="nav-brand" href="${root}/index.html">AI Builders Digest</a>
    <div class="nav-links">
      <a href="${root}/archive.html" class="nav-link">Archive</a>
    </div>
    <span class="nav-date">${dateLabel}</span>
  </nav>
  ${bodyHtml}
  <footer class="site-footer">
    Daily digest for AI builders · <a href="https://kizimi.space">kizimi.space</a>
  </footer>
  <script src="${root}/app.js"></script>
</body>
</html>`;
}

// ── Module 1: Hero Quote ────────────────────────────────────────────────────

function heroSection(data) {
  const q         = data.quote || {};
  const quoteText = q.text_en ? stripAttribution(q.text_en) : 'Build something that matters.';
  const author    = q.author || '';
  const stats     = data.stats || {};
  const newWords  = (data.vocab || []).length;

  return `
<section class="hero-section">
  <div class="hero-inner">
    <span class="hero-eyebrow">Today's Insight</span>
    <blockquote>
      <p class="hero-quote-text">${escapeHtml(quoteText)}</p>
      ${author ? `<cite class="hero-attribution">— ${escapeHtml(author)}</cite>` : ''}
    </blockquote>
    <div class="hero-stats">
      <span class="hero-stat"><strong>${stats.builders ?? 0}</strong> builders</span>
      <span class="hero-stat-sep">·</span>
      <span class="hero-stat"><strong>${stats.totalTweets ?? 0}</strong> tweets</span>
      <span class="hero-stat-sep">·</span>
      <span class="hero-stat"><strong>${stats.podcasts ?? 0}</strong> podcasts</span>
      <span class="hero-stat-sep">·</span>
      <span class="hero-stat"><strong>${newWords}</strong> new words</span>
    </div>
  </div>
</section>`;
}

// ── Module 2: Builders ──────────────────────────────────────────────────────

function buildersSection(builders, vocab) {
  if (!builders || builders.length === 0) return '';
  const total = builders.length;

  const cards = builders.map((b, i) => {
    const badge      = getBadge(b);
    const initials   = getInitials(b.name);
    // Prefer per-builder keywords (verbatim phrases); fall back to global vocab matching
    const bvocab     = (b.keywords && b.keywords.length > 0) ? b.keywords : builderVocab(b, vocab);
    const tweets     = b.tweets || [];
    const tweetLabel = tweets.length === 1 ? '1 tweet' : tweets.length + ' tweets';

    // X (Twitter) logo SVG — small familiar icon in bottom-right of each tweet item
    const xIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';

    const tweetItems = tweets.map(t => {
      const isSum      = !!t.summary_en;
      const display    = isSum ? t.summary_en : t.text;
      const summaryTag = isSum
        ? '<span class="ai-summary-tag" title="AI-generated summary — click the X icon to view the original">AI summary · click X to view original</span>'
        : '';
      return `
      <div class="tweet-item${isSum ? ' is-summarized' : ''}">
        <p class="tweet-text">${highlightKeywords(display, bvocab)}</p>
        <div class="tweet-footer">
          ${summaryTag}
          <a href="${escapeHtml(t.url)}" class="tweet-link-icon" target="_blank" rel="noopener" aria-label="View on X" title="View on X">${xIcon}</a>
        </div>
      </div>`;
    }).join('');

    return `
<article class="builder-card" data-idx="${i}">
  <header class="builder-header" data-expand="${i}">
    <div class="builder-avatar">${escapeHtml(initials)}</div>
    <div class="builder-meta">
      <span class="builder-name">${escapeHtml(b.name)}</span>
      <span class="builder-handle">@${escapeHtml(b.handle)}</span>
    </div>
    <span class="builder-badge ${badge.cls}">${badge.emoji} ${badge.label}</span>
  </header>

  <div class="summary-block">
    <div class="summary-label">摘要</div>
    <p class="summary-text">${escapeHtml(b.summary_zh || b.summary_en || '')}</p>
  </div>

  <button class="expand-btn" data-expand="${i}">▶ 原文 · ${escapeHtml(tweetLabel)}</button>

  <div class="original-block" id="orig-${i}" hidden>
    ${tweetItems}
    <div class="bottom-row">
      <button class="got-it-btn" data-idx="${i}">✦ Got it</button>
    </div>
  </div>
</article>`;
  }).join('');

  return `
<section class="builders-section">
  <div class="builders-subheader">
    <span class="sub-label">BUILDERS · ${total}</span>
    <div class="progress-area">
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" id="progressFill"></div>
      </div>
      <span class="progress-text" id="progressText">0 / ${total} done</span>
    </div>
  </div>

  <div class="builders-list" id="buildersList">
    ${cards}
  </div>

  <div class="all-done-banner" id="allDoneBanner" hidden>
    <p class="all-done-text">All caught up!</p>
    <button class="restore-btn" id="restoreBtn">重新展示今天所有内容</button>
  </div>
</section>`;
}

// ── Full Digest Page ────────────────────────────────────────────────────────

function digestPage(data, { depth = 0 } = {}) {
  const body = heroSection(data) + buildersSection(data.builders, data.vocab);
  return shell(`AI Builders Digest — ${formatDate(data.date)}`, body, { depth, date: data.date });
}

// ── Archive List Page ───────────────────────────────────────────────────────

function archiveListPage(dates) {
  const rows = [...dates]
    .sort((a, b) => b.localeCompare(a))
    .map(d => `
    <li class="archive-item">
      <a href="archive/${d}.html">${escapeHtml(formatDate(d))}</a>
    </li>`).join('');

  const body = `
<div class="archive-page">
  <h1 class="archive-title">Archive</h1>
  <ul class="archive-list">${rows}
  </ul>
</div>`;

  return shell('Archive — AI Builders Digest', body, { depth: 0 });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(join(SITE_DIR, 'archive'), { recursive: true });

  for (const asset of ['style.css', 'app.js', 'CNAME']) {
    const src = join(PUBLIC_DIR, asset);
    if (existsSync(src)) {
      await copyFile(src, join(SITE_DIR, asset));
    }
  }

  const files = (await readdir(DATA_DIR)).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  if (files.length === 0) {
    process.stderr.write('build-site: no data files found in data/\n');
    process.exit(1);
  }

  const allData = [];
  for (const file of files) {
    const data = JSON.parse(await readFile(join(DATA_DIR, file), 'utf-8'));
    allData.push(data);
  }

  allData.sort((a, b) => b.date.localeCompare(a.date));

  for (const data of allData) {
    const html = digestPage(data, { depth: 1 });
    await writeFile(join(SITE_DIR, 'archive', `${data.date}.html`), html, 'utf-8');
    process.stderr.write(`build-site: wrote site/archive/${data.date}.html\n`);
  }

  await writeFile(join(SITE_DIR, 'index.html'), digestPage(allData[0], { depth: 0 }), 'utf-8');
  process.stderr.write(`build-site: wrote site/index.html (${allData[0].date})\n`);

  await writeFile(join(SITE_DIR, 'archive.html'), archiveListPage(allData.map(d => d.date)), 'utf-8');
  process.stderr.write('build-site: wrote site/archive.html\n');

  process.stdout.write(`Built ${allData.length} page(s) → site/\n`);
}

main().catch(err => {
  process.stderr.write(`build-site error: ${err.message}\n`);
  process.exit(1);
});
