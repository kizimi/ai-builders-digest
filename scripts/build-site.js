#!/usr/bin/env node

// Reads all data/YYYY-MM-DD.json files and renders static HTML:
//   site/index.html          — today's digest
//   site/archive/YYYY-MM-DD.html — per-day archive pages
//   site/archive.html        — chronological archive list

import { readFile, writeFile, readdir, mkdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const SITE_DIR = join(PROJECT_ROOT, 'site');
const PUBLIC_DIR = join(PROJECT_ROOT, 'public');

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(isoDate) {
  const d = new Date(isoDate + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Wraps vocabulary words in the text with highlight spans.
function highlightVocab(text, vocab) {
  if (!vocab || vocab.length === 0) return escapeHtml(text);
  let result = escapeHtml(text);
  for (const v of vocab) {
    const word = escapeHtml(v.word);
    const regex = new RegExp(`\\b(${word})\\b`, 'gi');
    result = result.replace(
      regex,
      `<mark class="vocab-highlight" data-word="${word}">$1</mark>`
    );
  }
  return result;
}

// ── HTML Shell ─────────────────────────────────────────────────────────────

function shell(title, bodyHtml, { depth = 0 } = {}) {
  const root = depth === 0 ? '.' : '..';
  return `<!DOCTYPE html>
<html lang="en" data-lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${root}/style.css">
</head>
<body>
  <nav class="top-nav">
    <a class="nav-brand" href="${root}/index.html">AI Builders Digest</a>
    <div class="nav-actions">
      <a href="${root}/archive.html" class="nav-link" data-en="Archive" data-zh="归档">Archive</a>
      <button class="lang-toggle" id="langToggle" aria-label="Toggle language">
        <span data-en="中文" data-zh="English">中文</span>
      </button>
    </div>
  </nav>
  <main class="container">
    ${bodyHtml}
  </main>
  <footer class="site-footer">
    <span data-en="Daily digest for AI builders" data-zh="为 AI 创造者打造的每日精选">Daily digest for AI builders</span>
    · <a href="https://kizimi.space">kizimi.space</a>
  </footer>
  <div class="vocab-popup" id="vocabPopup" role="tooltip" aria-hidden="true"></div>
  <script src="${root}/app.js"></script>
</body>
</html>`;
}

// ── Page Sections ──────────────────────────────────────────────────────────

function quoteSection(quote) {
  if (!quote) return '';
  return `
<section class="quote-card">
  <blockquote>
    <p class="quote-text" data-en="${escapeHtml(quote.text_en)}" data-zh="${escapeHtml(quote.text_zh)}">${escapeHtml(quote.text_en)}</p>
    <cite class="quote-author">— ${escapeHtml(quote.author)}</cite>
  </blockquote>
</section>`;
}

function vocabSection(vocab) {
  if (!vocab || vocab.length === 0) return '';
  const items = vocab.map(v => `
    <li class="vocab-item">
      <div class="vocab-header">
        <span class="vocab-word">${escapeHtml(v.word)}</span>
        <span class="vocab-ipa">${escapeHtml(v.ipa)}</span>
        <span class="vocab-pos">${escapeHtml(v.pos)}</span>
      </div>
      <p class="vocab-def" data-en="${escapeHtml(v.definition_en)}" data-zh="${escapeHtml(v.definition_zh)}">${escapeHtml(v.definition_en)}</p>
      <p class="vocab-example" data-en="${escapeHtml(v.example_en)}" data-zh="${escapeHtml(v.example_zh)}"><em>${escapeHtml(v.example_en)}</em></p>
      ${v.synonyms && v.synonyms.length ? `<p class="vocab-synonyms"><span data-en="Also: " data-zh="同义：">Also: </span>${v.synonyms.map(s => `<em>${escapeHtml(s)}</em>`).join(', ')}</p>` : ''}
    </li>`).join('');
  return `
<section class="section vocab-section">
  <h2 class="section-title" data-en="Vocabulary" data-zh="词汇">Vocabulary</h2>
  <ul class="vocab-list">${items}
  </ul>
</section>`;
}

function slangSection(glossary) {
  if (!glossary || glossary.length === 0) return '';
  const cards = glossary.map(s => `
    <div class="slang-card">
      <div class="slang-term">${escapeHtml(s.term)}</div>
      <p class="slang-def" data-en="${escapeHtml(s.definition_en)}" data-zh="${escapeHtml(s.definition_zh)}">${escapeHtml(s.definition_en)}</p>
    </div>`).join('');
  return `
<section class="section slang-section">
  <h2 class="section-title" data-en="Slang &amp; Jargon" data-zh="行话词典">Slang &amp; Jargon</h2>
  <div class="slang-grid">${cards}
  </div>
</section>`;
}

function buildersSection(builders, vocab) {
  if (!builders || builders.length === 0) return '';
  const cards = builders.map(b => {
    const tweets = (b.tweets || []).slice(0, 3).map(t => `
      <li class="tweet-item">
        <p class="tweet-text">${highlightVocab(t.text, vocab)}</p>
        <a class="tweet-link" href="${escapeHtml(t.url)}" target="_blank" rel="noopener">View tweet ↗</a>
      </li>`).join('');

    const inlineSlang = (b.slang || []).map(s => `
      <div class="slang-card slang-card--inline">
        <span class="slang-term">${escapeHtml(s.term)}</span>
        <span class="slang-def" data-en="${escapeHtml(s.definition_en)}" data-zh="${escapeHtml(s.definition_zh)}">${escapeHtml(s.definition_en)}</span>
      </div>`).join('');

    return `
<article class="builder-card">
  <header class="builder-header">
    <span class="builder-name">${escapeHtml(b.name)}</span>
    <span class="builder-handle">@${escapeHtml(b.handle)}</span>
  </header>
  <p class="builder-summary" data-en="${escapeHtml(b.summary_en)}" data-zh="${escapeHtml(b.summary_zh)}">${escapeHtml(b.summary_en)}</p>
  ${tweets ? `<ul class="tweet-list">${tweets}</ul>` : ''}
  ${inlineSlang ? `<div class="builder-slang">${inlineSlang}</div>` : ''}
</article>`;
  }).join('');

  return `
<section class="section builders-section">
  <h2 class="section-title" data-en="Builders" data-zh="创造者动态">Builders</h2>
  ${cards}
</section>`;
}

function mediaSection(items, type) {
  if (!items || items.length === 0) return '';
  const label = type === 'podcast' ? 'Podcast' : 'Blog';
  const titleEn = type === 'podcast' ? 'Podcasts' : 'Blogs';
  const titleZh = type === 'podcast' ? '播客' : '博客';
  const cards = items.map(p => `
    <article class="media-card">
      <div class="media-label">${label}</div>
      <div class="media-source">${escapeHtml(p.name)}</div>
      <h3 class="media-title"><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.title)}</a></h3>
      <p class="media-summary" data-en="${escapeHtml(p.summary_en)}" data-zh="${escapeHtml(p.summary_zh)}">${escapeHtml(p.summary_en)}</p>
    </article>`).join('');
  return `
<section class="section media-section">
  <h2 class="section-title" data-en="${titleEn}" data-zh="${titleZh}">${titleEn}</h2>
  ${cards}
</section>`;
}

// ── Full Digest Page ───────────────────────────────────────────────────────

function digestPage(data, { depth = 0 } = {}) {
  const dateLabel = formatDate(data.date);
  const body = `
<header class="page-header">
  <h1 class="page-title" data-en="AI Builders Digest" data-zh="AI 创造者日报">AI Builders Digest</h1>
  <p class="page-date">${escapeHtml(dateLabel)}</p>
  <p class="page-stats">
    <span>${data.stats?.builders ?? 0} builders</span> ·
    <span>${data.stats?.totalTweets ?? 0} tweets</span>${data.stats?.podcasts ? ` · <span>${data.stats.podcasts} podcasts</span>` : ''}${data.stats?.blogs ? ` · <span>${data.stats.blogs} posts</span>` : ''}
  </p>
</header>
${quoteSection(data.quote)}
${vocabSection(data.vocab)}
${buildersSection(data.builders, data.vocab)}
${mediaSection(data.podcasts, 'podcast')}
${mediaSection(data.blogs, 'blog')}
${slangSection(data.slang_glossary)}`;

  return shell(`AI Builders Digest — ${dateLabel}`, body, { depth });
}

// ── Archive List Page ──────────────────────────────────────────────────────

function archiveListPage(dates) {
  const rows = [...dates]
    .sort((a, b) => b.localeCompare(a))
    .map(d => `
    <li class="archive-item">
      <a href="archive/${d}.html">${escapeHtml(formatDate(d))}</a>
    </li>`).join('');

  const body = `
<header class="page-header">
  <h1 class="page-title" data-en="Archive" data-zh="归档">Archive</h1>
</header>
<ul class="archive-list">${rows}
</ul>`;

  return shell('Archive — AI Builders Digest', body, { depth: 0 });
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(join(SITE_DIR, 'archive'), { recursive: true });

  for (const asset of ['style.css', 'app.js']) {
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

  await writeFile(
    join(SITE_DIR, 'archive.html'),
    archiveListPage(allData.map(d => d.date)),
    'utf-8'
  );
  process.stderr.write('build-site: wrote site/archive.html\n');

  process.stdout.write(`Built ${allData.length} page(s) → site/\n`);
}

main().catch(err => {
  process.stderr.write(`build-site error: ${err.message}\n`);
  process.exit(1);
});
