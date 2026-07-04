# Contributing to FadingUtilities

Thanks for helping improve the **Fading Echo** community resources! This project is a
static website (HTML / CSS / vanilla JS, no build step, no framework) hosted on GitHub
Pages. Anyone can contribute a new glitch, a fix, or an improvement.

> New glitch or route to share but not comfortable with Git? Just drop it in the
> [Discord](https://discord.gg/KnjSeWrRPv) and a maintainer will add it.

---

## Table of contents

- [Running the site locally](#running-the-site-locally)
- [Project structure](#project-structure)
- [Adding or editing a glitch](#adding-or-editing-a-glitch)
- [Updating the search index](#updating-the-search-index)
- [Coding conventions](#coding-conventions)
- [Branch & pull request workflow](#branch--pull-request-workflow)

---

## Running the site locally

The glitches are loaded from `glitches.json` with `fetch()`, which **does not work over
the `file://` protocol**. You must serve the folder over HTTP:

- **VS Code** – install the *Live Server* extension, right-click `index.html` →
  *"Open with Live Server"*.
- **Python** – from the repo root:
  ```bash
  python -m http.server 8000
  ```
  then open <http://localhost:8000>.
- **Node** – `npx serve` (or any static server).

If you open the page and see *"Failed to load glitches"*, you're on `file://` — use one of
the servers above.

---

## Project structure

```
index.html        Home page (game intro, links, community)
speedrun.html     Speedrun page: glitches (dynamic) + external tools (static)
mods.html         Mods page (Teleport Mod, Volume Mod)
voidcancel.html   Detailed Void Cancel guide
404.html          Not-found page

glitches.json     ← Source of truth for all glitches (edit this to add content)
search-data.js    Global Ctrl+K search index (kept in sync with glitches.json by hand)

site.js           Shared: hamburger menu, water particles, smooth scroll
search.js         Search modal logic (shared by all pages)
speedrun.js       Renders glitches.json into cards + section navigation

style.css         All styles
manifest.json     PWA manifest
sitemap.xml       SEO sitemap  (add new pages here)
robots.txt
Images/           Banner, name, favicon
```

---

## Adding or editing a glitch

**All glitch content lives in `glitches.json`.** You never touch HTML to add a glitch —
`speedrun.js` renders it automatically.

The file is an array of **sections**, each containing an array of **glitches**:

```json
{
  "sections": [
    {
      "id": "speedrun_moves",
      "title": "Speedrun Moves",
      "icon": "fa-running",
      "color": "var(--primary-cyan)",
      "glitches": [ ... ]
    }
  ]
}
```

### Glitch fields

Only `title` is required. **The order of the keys matters** — fields are rendered in the
order they appear in the JSON, so put `how_to`, `note`, `variations`, `videos` in the
order you want them shown.

| Field           | Type            | Description |
|-----------------|-----------------|-------------|
| `title`         | string *(req.)* | Glitch name. Plain text (auto-escaped). |
| `alt_names`     | string          | Alternative names, shown after a `|`. |
| `how_to`        | string (HTML)   | "How to do" paragraph. |
| `note`          | string (HTML)   | Note box. Becomes a **warning** box if `note_type` is `"warning"` or the text contains ⚠️. |
| `note_type`     | string          | `"warning"` to force the red warning style. |
| `variations`    | array           | List of `{ "text": "…", "video_id": "…" }` (video optional). |
| `videos`        | array           | YouTube video **IDs** (not full URLs), e.g. `["HwfF5NkcpIU"]`. |
| `videos_extra`  | array           | Additional videos, shown after the note. |
| `discord_link`  | string (URL)    | Adds a Discord icon linking to the source message. |
| `button_text` + `button_link` | string | Adds a call-to-action button (e.g. link to a full guide). |
| `extra_content` | string (HTML)   | Raw HTML appended at the end of the card. |
| `hover_video`   | boolean         | `false` = always show the video instead of only on hover. Default `true`. |
| `title_prefix`  | string (HTML)   | HTML placed before the title (e.g. an icon). |
| `card_style` / `title_style` | string | Inline CSS overrides (use sparingly). |

### Minimal example

```json
{
  "title": "My New Glitch (MNG)",
  "how_to": "Describe the input sequence here.",
  "note": "Only works at 120fps.",
  "videos": ["dQw4w9WgXcQ"],
  "discord_link": "https://discord.com/channels/…"
}
```

> ⚠️ **HTML fields are injected as-is** (`how_to`, `note`, `variations[].text`,
> `extra_content`, `title_prefix`). Only add HTML you trust, and always use
> `target="_blank" rel="noopener noreferrer"` on external links.

After editing, **validate your JSON** (a trailing comma or unescaped quote will break the
whole page). Paste it into <https://jsonlint.com> if unsure.

---

## Updating the search index

The `Ctrl+K` search reads `search-data.js` (`pageSearchIndex`), which is currently
maintained **by hand and separately** from `glitches.json`. If you add a glitch that
should be searchable, add a matching entry:

```js
{
  title: "My New Glitch (MNG)",
  category: "Glitch",
  page: "speedrun.html",
  target: "glitches",
  desc: "Short description shown in results",
  icon: "fa-bug"
}
```

---

## Coding conventions

- **No build step.** Plain HTML/CSS/JS — keep it that way.
- **Strict CSP.** Every page ships a `Content-Security-Policy` meta tag.
  - **No inline event handlers** (`onclick="…"` etc.) — attach listeners in JS.
  - External resources (fonts, Font Awesome) are the only allowed third parties, loaded
    with **SRI** (`integrity=…`). If you bump the Font Awesome version, update the
    `integrity` hash on **every** HTML page.
- **Accessibility.** Keep `aria-*` labels, keyboard handlers on interactive elements, and
  respect `prefers-reduced-motion`.
- **External links** always use `target="_blank" rel="noopener noreferrer"`.
- **New page?** Add it to `sitemap.xml`, the nav menu, and the search index if relevant.
- Comments in the codebase are in French; match the existing style of the file you edit.

---

## Branch & pull request workflow

1. Fork the repo (or create a branch if you have write access).
2. **Base your work on the `dev` branch**, not `main`.
   ```bash
   git switch dev
   git switch -c my-feature
   ```
3. Make your changes and test locally over HTTP (see above).
4. Commit with a clear, descriptive message.
5. Open a pull request **targeting `dev`**. `main` is the deployed branch and is updated
   from `dev` once changes are reviewed.

Not sure about something? Ask on the
[Discord](https://discord.gg/KnjSeWrRPv) — contact **cheapmanga_89714**.

Happy glitch hunting! 🎮
