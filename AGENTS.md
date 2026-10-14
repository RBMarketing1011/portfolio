# Agent guide

Rules for anyone (person or AI agent) changing this codebase.

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
