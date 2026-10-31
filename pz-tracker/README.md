# PZ Team Library

Standalone static frontend for GitHub Pages, with shared collection state in Convex Cloud. No player accounts, containers, tunnels, or frontend build step.

## Current state

- Target: Build **42.22 Pre-Release**, the latest publicly available Build 42 identified in the [official October 27 announcement](https://projectzomboid.com/blog/news/2026/10/moving-on-up-42-22-pre-release/). Stable is 42.21.
- Community-sourced catalog: **120 skill books, 87 recipe magazines, 62 XP/recipe-bearing VHS tapes**. These are extracted PZwiki table totals, not verified 42.22 game-file totals.
- The book table is marked 42.13.2 and the VHS table 42.20.4. The catalog includes newer Build 42 retail instructional tapes, but has not been reconciled with a 42.22 installation. Do not describe it as a complete verified latest-build export.
- Misc is intentionally empty: no qualifying additional learning items were verified. It is not filled with speculative items.
- “Skill videos” includes any tape documented to grant skill XP or recipes, including films or home recordings with learning effects. Boredom-only entertainment tapes, CDs, and modded items are excluded.
- Development shared state is configured at `https://elegant-seahorse-1.convex.cloud` in the `pz-collection` Convex project. Two live client subscriptions were checked in both directions, including idempotent collection writes and invalid-input rejection. No production deployment has been made.

## Local preview

From the repository root:

```sh
bun install
bun run dev
```

Open `http://localhost:5173/pz-tracker/`. The existing repo dev server serves the app directly.

Checks, without logging in or deploying:

```sh
bun run check:pz
```

## Convex setup (operator action)

The operator completed CLI login and selected the existing `pz-collection` project. The development backend is deployed and its public URL is set in `config.js`. Dashboard: https://dashboard.convex.dev/d/elegant-seahorse-1. The steps below document setup and future production publishing. These commands connect to cloud resources and publish backend functions; run them only when authorized.

1. From the repository root, run `bun run convex:dev` and complete the CLI's browser login and project selection. This provisions/selects a development deployment and syncs the backend. `.env.local` is ignored by Git before setup.
2. Set `CONVEX_URL` in `pz-tracker/config.js` to the development deployment's public `https://....convex.cloud` URL. This is a public URL, not a credential.
3. Keep the Convex development command running during backend development. The static preview uses the normal Bun server in a separate terminal.
4. For production, when deployment is authorized, run `bun run convex:deploy` from the repository root and set `pz-tracker/config.js` to the production deployment's public URL.
5. Publish the static repo through its existing GitHub Pages main/root configuration when committing and pushing are authorized. No Actions workflow is required. The root landing page links to this app.

Never put a deploy key, admin token, or CLI authentication value in `config.js`, HTML, chat, or Git. Local CLI login and the public browser URL serve different purposes. No CI deployment key is needed for this manual workflow.

## Shared links and state

The homepage uses `crypto.getRandomValues` to generate a 192-bit team ID. A team URL looks like:

```text
https://onepage.traefikturkey.com/pz-tracker/#/team/<48-lowercase-hex-characters>
```

Hash routing works on direct navigation and refresh on GitHub Pages without a rewrite. The hash stays out of static-host HTTP requests. The app uses a no-referrer policy. The Convex service necessarily receives the team ID to query and save that team's collection.

The link is the edit credential: anyone holding it can read and change the team's state. Save and share it carefully. There is no team directory, player identity, password recovery, or separate read-only link. Losing the link means losing access unless a teammate retained it.

The backend validates the team ID format on every read and write, and accepts only item IDs in the checked-in catalog. It stores one row per collected item, indexed by team and item. Mutations set an explicit boolean rather than toggle server state; repeating the same write is idempotent. Concurrent conflicting edits use the final committed value. Unchecking deletes the ownership row. No per-player read/watched status, quantities, or notes are stored.

Frontend subscriptions update the collection when teammates edit. Failed mutations are reported instead of being presented as saved. Until the initial subscription succeeds, checkboxes are disabled. Convex handles reconnects and pending mutation retries; the app does not maintain a separate local collection.

## Import skill-book exports

In a team library's Books tab, use **Import books JSON (add checked only)** to select a version-1 `pz-books.com` export, such as `pz-skill-books-2026-10-30.json`.

The file has `version: 1` and a `books` object mapping skill slugs (for example `animal-care` or `carpentry`) to five booleans in volume I–V order. Checked (`true`) entries are added to the team's collection in one transaction. Unchecked (`false`) entries do not clear existing selections. Videos and magazines are untouched. Reimporting the same file does not create duplicates.

Unknown skills, unsupported format versions, and anything other than five booleans per skill are rejected before saving. The file is read locally; only the selected catalog book IDs and team ID are sent to Convex.

## Catalog maintenance

`catalog.json` is shared by the static frontend and backend item validation. Book and magazine keys are PZwiki-documented `Base.*` game item IDs. Video keys are app-owned `vhs:<kind>:<title-slug>` identifiers because `Base.VHS_Retail` and `Base.VHS_Home` identify generic forms, not unique recordings. Keep those keys stable when correcting display names or effects so existing team ownership is preserved.

Each item has `id`, `title`, `category`, `effect`, `kind`, and `source`. Update the target version, coverage note, and source metadata when reconciling the catalog against newer game files. Updating only the version label does not verify the catalog. Backend functions must be deployed after catalog changes so validation matches the frontend.

Sources, retrieved October 30, 2026:

- [The Indie Stone: 42.22 Pre-Release](https://projectzomboid.com/blog/news/2026/10/moving-on-up-42-22-pre-release/)
- [PZwiki contributors: Skill book](https://pzwiki.net/wiki/Skill_book)
- [PZwiki contributors: Recipe magazine](https://pzwiki.net/wiki/Recipe_magazine)
- [PZwiki contributors: VHS](https://pzwiki.net/wiki/VHS)

Book XP multipliers and VHS XP values are source values; actual in-game results depend on character modifiers and sandbox settings. PZwiki's version warnings apply. No game art or entertainment descriptions are copied into this app.
