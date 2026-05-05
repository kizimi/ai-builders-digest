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

  async function callClaude(systemText, userText, { model = 'claude-haiku-4-5', maxTokens = 8192 } = {}) {
    const msg = await client.messages.create({
      model,
      max_tokens: maxTokens,
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
- summary_en / summary_zh: focus on WHAT the tweets are saying — the actual content, takeaway, or insight from today. DO NOT start with the author's role or background (avoid phrasings like "AI thought leader sharing..." or "Tech executive observing..."). The reader already knows who this builder is. Lead with the substance: what was built, claimed, observed, argued, or shipped.
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
  const pass1Text = stripFences(await callClaude(pass1System, pass1User, { model: 'claude-sonnet-4-6', maxTokens: 16000 }));

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

  // ── Pass 3: per-builder keywords (separate pass to stay within token limit) ──

  const pass3System = `You are a vocabulary curator for advanced Chinese learners of English following AI/tech builders. Return ONLY a valid JSON array — no fences, no prose.

Schema: [{ "handle":"string", "keywords":[{"phrase":"string","ipa":"string","definition_zh":"string","example_zh":"string"}] }]

Selection rules — for each builder, pick UP TO 3 keywords (return empty array if none qualify):

WHAT TO PICK (in priority order):
1. AI / startup / tech SLANG worth learning (e.g. "vibe coding", "dogfooding", "ship it", "north star", "agentic", "yak shaving", "moat", "first principles").
2. PROFESSIONAL or domain-specific terms (e.g. "embedding", "prompt injection", "fine-tuning", "RLHF", "MCP server", "evals", "context window").
3. NUANCED phrases with non-obvious meaning where context shifts interpretation (e.g. "last mile", "Gell-Mann amnesia", "indistinguishable from", "leverage on incremental effort").
4. Words/phrases CENTRAL to the builder's main insight today — use summary_en as your relevance guide.

WHAT TO SKIP:
- Basic high-school vocabulary every English learner knows (e.g. "build", "make", "use", "good", "today", "thing", "happen", "important", "really", "just"). Skip them even if frequent.
- Words appearing inside URLs, hashtags, or @mentions.
- Tweets whose text is ENTIRELY URLs/links — for that builder return an empty keywords array.

FIELD RULES:
- phrase: copy VERBATIM from the tweet — exact casing, do not paraphrase.
- ipa: IPA pronunciation for single English words only; empty string for multi-word phrases or non-English.
- definition_zh: one short Chinese sentence — what the word/phrase means.
- example_zh: 1-2 Chinese sentences explaining how it's used in THIS specific tweet's context (not a generic dictionary example).

Return ONLY a valid JSON array.`;

  const pass3User = `BUILDERS:\n${JSON.stringify(
    (pass1.builders || []).map(b => ({
      handle: b.handle,
      summary_en: b.summary_en || '',
      tweets: (b.tweets || []).map(t => t.text.slice(0, 240)),
    }))
  )}`;

  process.stderr.write(`enhance: pass 3 — per-builder keywords (${(pass1.builders || []).length} builders)...\n`);
  const pass3Text = stripFences(await callClaude(pass3System, pass3User));

  let pass3 = [];
  try {
    pass3 = JSON.parse(pass3Text);
  } catch (err) {
    process.stderr.write(`enhance: pass 3 invalid JSON (keywords skipped): ${err.message}\n`);
  }

  const keywordsByHandle = {};
  for (const entry of pass3) {
    if (entry.handle && Array.isArray(entry.keywords)) {
      keywordsByHandle[entry.handle] = entry.keywords;
    }
  }

  // ── Pass 4: long-tweet summaries (only fires when long tweets exist) ────

  const LONG_TWEET_CHARS = 400;
  const longTweets = [];
  for (const b of (pass1.builders || [])) {
    for (const t of (b.tweets || [])) {
      if (t.text && t.text.length >= LONG_TWEET_CHARS) {
        longTweets.push({ tweet_id: t.id, handle: b.handle, text: t.text.slice(0, 1600) });
      }
    }
  }

  const summariesByTweetId = {};
  if (longTweets.length > 0) {
    const pass4System = `You summarize long tweets for an AI/tech digest. Return ONLY a valid JSON array — no fences, no prose.

Schema: [{ "tweet_id":"string", "summary_en":"string" }]

Rules:
- For each input tweet, write a 1-2 sentence English summary capturing the key point or insight — what the author is actually saying.
- Be concise and content-focused. Do not describe the author.
- Return ONLY a valid JSON array, one entry per input.`;

    const pass4User = `LONG TWEETS (${longTweets.length}):\n${JSON.stringify(longTweets)}`;

    process.stderr.write(`enhance: pass 4 — long-tweet summaries (${longTweets.length} tweets)...\n`);
    try {
      const pass4Text = stripFences(await callClaude(pass4System, pass4User));
      const pass4 = JSON.parse(pass4Text);
      for (const entry of pass4) {
        if (entry.tweet_id && entry.summary_en) {
          summariesByTweetId[entry.tweet_id] = entry.summary_en;
        }
      }
    } catch (err) {
      process.stderr.write(`enhance: pass 4 failed (skipping summaries): ${err.message}\n`);
    }
  }

  // ── Merge ──────────────────────────────────────────────────────────────

  // Build lookup of full (untruncated) tweet text from the original feed data
  const fullTweetText = {};
  for (const b of activeBuilders) {
    for (const t of (b.tweets || [])) {
      if (t.id) fullTweetText[t.id] = t.text;
    }
  }

  const enriched = {
    date: todayISO(),
    builders: (pass1.builders || []).map(b => ({
      ...b,
      keywords: keywordsByHandle[b.handle] || [],
      tweets: (b.tweets || []).map(t => ({
        ...t,
        text: fullTweetText[t.id] ?? t.text,
        summary_en: summariesByTweetId[t.id] || null,
      })),
    })),
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
