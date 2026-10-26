# Agent guide

Rules for anyone (person or AI agent) changing this codebase.

## Output rules

- When a task is done, reply with one line: what changed, or "Done."
- No summaries, recaps, or explanations of what you did unless asked.
- No "Next steps," "Notes," or "What I changed" sections.
- No questions or offers at the end.
- If something failed or needs my decision, say that in one line.
- Answer questions in 1-3 sentences.

## UI: shadcn everywhere outside the builder and the section kit

The app has one UI system: the shadcn components in `src/components/ui/`.

**Everything outside the two zones below must be built 100% from those components.**
That covers the account area (`src/app/account/**`), the admin area (`src/app/admin/**`),
sign-in and invitation pages, dialogs, menus, and shared app components.

### The two zones with their own rules

1. **The builder:** `src/app/builder/**`, the editor surfaces that support it, and
   `src/app/section-preview`, `src/app/page-preview` and `src/app/preview`.
2. **The section kit:** `src/components/sections/**`, plus the components that render
   a built site: `built-chrome.tsx`, `built-menu.tsx`, `rendered-site.tsx` and
   `hosted-site.tsx`. These are the customer's website, styled by the site's theme, not
   by the app.

### What "100% shadcn" means outside those zones

Use the component, never the raw element or a hand-rolled look-alike:

| Need | Use | Not |
|---|---|---|
| Button, icon button, text link styled as a button | `Button` (`variant`, `size="icon"`, `asChild` around `Link`) | `<button>`, a styled `<a>` |
| Text field | `Input`, `PasswordInput` | `<input>` |
| Multi-line text | `Textarea` | `<textarea>` |
| Dropdown choice | `Select` | `<select>` |
| Checkbox | `Checkbox` with `Label` | `<input type="checkbox">` |
| On/off setting | `Switch` with `Label` | a custom `role="switch"` button |
| Pick one of a few | `RadioGroup` or `ToggleGroup` (`type="single"`) | rows of buttons with `aria-pressed` |
| Pick several (days of the week, filters) | `ToggleGroup` (`type="multiple"`) | rows of buttons with `aria-pressed` |
| Tabular data | `Table` and its parts | `<table>` |
| A boxed group of settings or content | `Card` and its parts | a `div` with border, background and padding |
| Status label, count, pill | `Badge` | a styled `<span>` |
| Inline message, warning, notice | `Alert` | a styled `<p>` or `div` |
| Confirmations | `Dialog`, `AlertDialog` | `window.confirm` / `alert` |
| Menus | `DropdownMenu`, `Popover`, `Command` | hand-built popups |
| Tabs, side navigation, sheets | `Tabs`, `Sidebar`, `Sheet` | hand-built equivalents |
| Dividers, skeletons, tooltips | `Separator`, `Skeleton`, `Tooltip` | styled divs, `title=` tooltips |

Plain layout elements (`div`, `section`, `ul`, `p`, headings) are fine for arranging
components. A plain inline `Link` inside a sentence is fine.

### Missing a component?

Add it with the CLI. Never hand-write a component that shadcn already provides:

```
pnpm dlx shadcn@latest add <name>
```

Run it from PowerShell on Windows; the Bash `npx` shim is broken on this machine.

If shadcn genuinely has no component for the job, compose one from existing
`src/components/ui` parts in a file next to where it is used. Do not restyle raw
elements.

## Checks to run

- Type check: `node node_modules/typescript/bin/tsc --noEmit -p .`
- Media library: `pnpm prove:media` (needs the database)
- Builder templates: `node scripts/prove-builder-templates.cjs`
- Header menu: `node scripts/prove-builder-menu.cjs`
- Site SEO: `node scripts/prove-site-seo.cjs`
- AI builder (offline, no API calls): `node scripts/prove-builder-design.cjs`,
  `prove-builder-look.cjs`, `prove-builder-catalog.cjs`, `prove-builder-compose.cjs`,
  `prove-builder-kit.cjs`, `prove-builder-plan.cjs`, `prove-builder-chrome.cjs`,
  `prove-builder-writer.cjs`, `prove-builder-ai.cjs`, `prove-builder-history.cjs`,
  `prove-builder-land.cjs` and `node scripts/prove-builder-ui.mjs`
- AI builder infrastructure: `node scripts/prove-builder-ai-infra.mjs` (local Mongo
  only, no `--env-file`)
- Authentication: `pnpm prove:auth` (see below)
- Blog and its API: `pnpm prove:blog` (same local setup as the auth proofs,
  plus `BLOG_API_KEY`)

## Blog

Posts live in MongoDB (`blogPosts`), not in code. `src/lib/blog/seed-posts.ts`
holds the original articles: they are copied into the database automatically
the first time the blog is read, and served from there if the database is
unreachable. Editing that file does not change the live site.

Posts are created, scheduled, edited and deleted through `/api/blog/posts`,
authenticated with `Authorization: Bearer $BLOG_API_KEY`. A post with a future
`publishAt` goes live on its own within about a minute of that time.

### Authentication proofs

`pnpm prove:auth` runs every auth proof (invitations, welcome, magic link,
forgot password, rate limits, account bootstrap, authorization) against the dev
server. They create and delete people, so they refuse anything but a local
database, and they read emailed links from a mail sink instead of a mailbox.
The `.env` in this repo points at the hosted cluster, so override both:

```
# Git Bash
export MONGODB_URI=mongodb://127.0.0.1:27017/reynoldsbuilt_proof MAIL_SINK_DIR=/tmp/rb-mail
pnpm dev            # in one terminal
pnpm prove:auth     # in another, with the same two variables exported

# PowerShell
$env:MONGODB_URI='mongodb://127.0.0.1:27017/reynoldsbuilt_proof'; $env:MAIL_SINK_DIR="$env:TEMP\rb-mail"
pnpm dev
pnpm prove:auth
```

Never run `scripts/clean-test-data.mjs` or the proofs against the hosted
cluster. After deploying, run `node --env-file=.env scripts/ensure-indexes.mjs`
once against production so the unique and TTL indexes the auth flows rely on
exist there (it also creates the `aiBuilds` indexes the AI builder uses).

## AI builder

"Build with AI" (top bar, empty site, pages nav "+", page actions) builds one page
or a whole site from a prompt. The browser runs it in stages, each its own request
under the 300 s limit: `POST /api/sites/:id/ai/builds` plans (streamed NDJSON),
`…/outline` lays out any pages the plan left empty, `…/pages/:key` writes one page,
`…/land` returns the result, which the builder applies as one undo step. Builds live
in `aiBuilds` for 24 hours. Code: `src/lib/builder/ai/**` (pipeline),
`src/lib/builder/catalog/**` (what the AI may compose from the section kit),
`src/lib/builder/design/**` (palettes, fonts, surfaces, contrast).

- The plan is two structured-output calls: the API will not compile the plan and
  the header/menu as one grammar ("compiled grammar is too large").
- `BUILDER_AI_MODEL` (default `claude-opus-5-5`), `BUILDER_AI_PLAN_EFFORT`,
  `BUILDER_AI_WRITE_EFFORT`, `BUILDER_AI_DAILY_LIMIT` (units per account per day,
  default 100; a site costs 1 + its pages), `BUILDER_AI_DAILY_OUTPUT_TOKENS`.
- Live runs spend real API usage. Run them against a throwaway local Mongo, as for
  the auth proofs, and a second dev server with `NEXT_DIST_DIR=.next-e2e` so it does
  not share `.next` with one already running. That server rewrites `tsconfig.json`
  (adds `.next-e2e/types`); revert it afterwards.
