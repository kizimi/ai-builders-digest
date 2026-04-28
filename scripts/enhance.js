#!/usr/bin/env node

// Reads raw feed JSON from prepare-digest.js via stdin.
// Calls Claude to produce structured enrichment:
//   - Per-builder summaries in EN + ZH
//   - Podcast / blog summaries in EN + ZH
//   - 5-8 vocabulary words (IPA, POS, definition, synonyms)
//   - Slang / jargon annotations
//   - Daily quote
// Writes data/YYYY-MM-DD.json and prints the path to stdout.

import Anthropic from '@anthropic-ai/sdk';
import { config as loadEnv } from 'dotenv';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const ENV_PATH = join(homedir(), '.follow-builders', '.env');

loadEnv({ path: ENV_PATH });

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) {
    process.stderr.write('enhance: empty stdin\n');
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stderr.write('enhance: invalid JSON from prepare-digest\n');
    process.exit(1);
  }

  const { x = [], podcasts = [], blogs = [], stats = {} } = payload;

  // Filter out builders with no tweets
  const activeBuilders = x.filter(b => b.tweets && b.tweets.length > 0);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Trim input to keep output within token limits.
  // Tweets are capped at 240 chars; each builder gets at most 2 tweets.
  function trimBuilders(builders) {
    return builders.map(b => ({
      name: b.name,
      handle: b.handle,
      tweets: (b.tweets || []).slice(0, 2).map(t => ({
        id: t.id,
        text: t.text.slice(0, 240),
        url: t.url,
      })),
    }));
  }

  function stripFences(text) {
    return text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  }

  async function callClaude(systemText, userText) {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 8192,
      system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userText }],
    });
    const text = msg.content[0]?.text;
    if (!text) throw new Error('empty response from API');
    return text;
  }

  // ── Pass 1: builder + media summaries ──────────────────────────────────

  const pass1System = `You are an AI/tech content curator. Return ONLY a valid JSON object — no fences, no prose.

Schema:
{
  "builders": [{ "name":"string","handle":"string","summary_en":"1-2 sentences","summary_zh":"1-2句中文","tweets":[{"id":"string","text":"string","url":"string"}],"slang":[{"term":"string","definition_en":"string","definition_zh":"string"}] }],
  "podcasts": [{ "name":"string","title":"string","url":"string","summary_en":"1-2 sentences","summary_zh":"1-2句中文" }],
  "blogs":    [{ "name":"string","title":"string","url":"string","summary_en":"1-2 sentences","summary_zh":"1-2句中文" }]
}

Rules:
- Include ALL builders listed. Keep tweet arrays to the 2 most interesting (id, text, url only).
- slang: flag any AI/startup jargon in the tweets (e.g. "vibe coding", "dogfooding", "ship it").
- Return ONLY valid JSON.`;

  const pass1User = `Today: ${todayISO()}

BUILDERS (${activeBuilders.length}):
${JSON.stringify(trimBuilders(activeBuilders), null, 2)}

PODCASTS (${podcasts.length}):
${JSON.stringify(podcasts.map(p => ({ name: p.name, title: p.title, url: p.url, transcript: (p.transcript || '').slice(0, 400) })), null, 2)}

BLOGS (${blogs.length}):
${JSON.stringify(blogs.map(b => ({ name: b.name, title: b.title, url: b.url })), null, 2)}`;

  process.stderr.write(`enhance: pass 1 — summaries (${activeBuilders.length} builders)...\n`);
  const pass1Text = stripFences(await callClaude(pass1System, pass1User));

  let pass1;
  try {
    pass1 = JSON.parse(pass1Text);
  } catch (err) {
    process.stderr.write(`enhance: pass 1 invalid JSON: ${err.message}\nRaw (500): ${pass1Text.slice(0, 500)}\n`);
    process.exit(1);
  }

  // ── Pass 2: vocab, quote, slang glossary ───────────────────────────────

  // Collect all tweet text for vocab analysis
  const allTweetText = activeBuilders.flatMap(b => b.tweets.map(t => t.text)).join(' ');

  const pass2System = `You are a vocabulary curator for Chinese learners of English. Return ONLY a valid JSON object — no fences, no prose.

Schema:
{
  "vocab": [{ "word":"string","ipa":"/phonetic/","pos":"noun|verb|adj|etc","definition_en":"string","definition_zh":"string","synonyms":["string"],"example_en":"string","example_zh":"string" }],
  "quote": { "text_en":"string","text_zh":"string","author":"string" },
  "slang_glossary": [{ "term":"string","definition_en":"string","definition_zh":"string" }]
}

Rules:
- vocab: 5-8 words from the content that are interesting/technical/nuanced. Prioritise words a Chinese English-learner would value.
- quote: one inspiring quote thematically relevant to today's content.
- slang_glossary: collect ALL slang/jargon terms from all builders (deduplicated).
- Return ONLY valid JSON.`;

  const pass2User = `Today: ${todayISO()}

TWEET TEXT SAMPLE:
${allTweetText.slice(0, 2000)}

SLANG TERMS FOUND IN PASS 1 (for deduplication):
${JSON.stringify((pass1.builders || []).flatMap(b => (b.slang || []).map(s => s.term)))}`;

  process.stderr.write('enhance: pass 2 — vocab + quote + slang...\n');
  const pass2Text = stripFences(await callClaude(pass2System, pass2User));

  let pass2;
  try {
    pass2 = JSON.parse(pass2Text);
  } catch (err) {
    process.stderr.write(`enhance: pass 2 invalid JSON: ${err.message}\nRaw (500): ${pass2Text.slice(0, 500)}\n`);
    process.exit(1);
  }

  // ── Merge ──────────────────────────────────────────────────────────────

  const enriched = {
    date: todayISO(),
    builders: pass1.builders || [],
    podcasts: pass1.podcasts || [],
    blogs: pass1.blogs || [],
    vocab: pass2.vocab || [],
    quote: pass2.quote || null,
    slang_glossary: pass2.slang_glossary || [],
  };

  enriched.stats = {
    builders: activeBuilders.length,
    podcasts: podcasts.length,
    blogs: blogs.length,
    totalTweets: stats.totalTweets ?? 0,
    feedGeneratedAt: stats.feedGeneratedAt ?? null,
  };

  await mkdir(DATA_DIR, { recursive: true });
  const outPath = join(DATA_DIR, `${enriched.date}.json`);
  await writeFile(outPath, JSON.stringify(enriched, null, 2), 'utf-8');

  process.stderr.write(`enhance: wrote ${outPath}\n`);
  process.stdout.write(outPath + '\n');
}

main().catch(err => {
  process.stderr.write(`enhance error: ${err.message}\n`);
  process.exit(1);
});
