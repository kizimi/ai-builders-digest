# Favorites Feature Design

**Date:** 2026-05-16  
**Project:** AI Builders Digest  
**Status:** Approved

## Overview

Add a per-tweet favorites (bookmark) feature to the digest. Users can star individual tweets they find valuable. Favorites are persisted in browser localStorage. A new `/favorites.html` page displays all saved tweets grouped by date.

## Data Structure

Stored in localStorage under key `ai_digest_favorites` as a JSON array:

```json
[
  {
    "id": "tweet_id",
    "text": "推文原文",
    "url": "https://x.com/...",
    "handle": "builderhandle",
    "name": "Builder Name",
    "date": "2026-05-16",
    "savedAt": 1747440000000
  }
]
```

- `id` is the unique key; toggling a favorited tweet removes it
- `savedAt` is a Unix timestamp for ordering within a date group

## UI Changes

### Tweet Footer (index + archive pages)

Each tweet item's footer gets a star button to the left of the existing X icon:

```
[tweet text...]
                    ☆  [X icon]   ← unfavorited
                    ⭐  [X icon]   ← favorited
```

- Unfavorited state: ☆ muted gray, low visual weight
- Favorited state: ⭐ gold/amber fill
- Click toggles state and updates localStorage immediately
- On page load, localStorage is read and ⭐ state is restored for all visible tweets

### Top Navigation

`Favorites` link added alongside the existing `Archive` link:

```
AI Builders Digest    Archive · Favorites    May 16, 2026
```

### /favorites.html

Static shell page rendered by `app.js` from localStorage. Content grouped by date descending:

```
My Favorites  (12 saved)

── May 16, 2026 ──────────────
  [@karpathy]  Tweet text...    ⭐  [X]
  [@sama]      Tweet text...    ⭐  [X]

── May 15, 2026 ──────────────
  [@yoheinakajima] Tweet text...  ⭐  [X]
```

- Clicking ⭐ on this page removes the favorite and collapses the entry
- Empty state: "No favorites yet. Star a tweet on today's digest to save it here."

## Files Changed

| File | Change |
|------|--------|
| `scripts/build-site.js` | Add ⭐ button with `data-id`, `data-text`, `data-url`, `data-handle`, `data-name`, `data-date` attrs to tweet footer; add Favorites nav link; add `favorites.html` to the copied assets list |
| `public/app.js` | Favorites logic: toggle save/remove, restore state on load, render favorites page |
| `public/style.css` | Star button styles (default, hover, active/filled); favorites page date-group layout |
| `public/favorites.html` | New static shell; `app.js` populates `#favRoot` |

## Files Not Changed

`prepare-digest.js`, `enhance.js`, `daily.yml`, `build-site.js` data pipeline logic.

## Constraints

- No backend, no API calls — pure client-side localStorage
- Works on all modern browsers
- Favorites survive page refresh; cleared only if user clears browser storage
- Not cross-device (acceptable for a personal reading tool)
