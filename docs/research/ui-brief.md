## UI Brief: Shopboard

### Target users
- Owner-operator of a small mechanic shop (Mac or Windows, build targets both). Uses it at a desk in a dirty shop, often in 1–3 minute bursts between jobs, sometimes with greasy hands or gloves on a mouse or touchscreen. Wants fast answers: "am I making money, and should I take this job?" No accessibility needs stated; meet WCAG 2.2 AA.

### Tokens (all contrast ratios computed)
- Surfaces: `bg` #FFFFFF (cards, tables), `canvas` #F8FAFC (page), `sidebar` #F1F5F9, `row-hover` #F8FAFC, `selected` #EFF6FF.
- Text: `text` #0F172A (17.9:1), `text-2` #475569 (7.6), `text-3` #64748B (4.76 on white only; it FAILS on the sidebar at 4.34, so use text-2 there).
- Borders: `divider` #E2E8F0 (decorative only). Inputs, checkboxes and other control borders use #64748B. Slate-400 is 2.56:1 and fails 3:1 for non-text.
- Accent: `blue` #1D4ED8 (6.7 on white, 6.1 on sidebar), `blue-hover` #1E40AF, `blue-tint` #EFF6FF. White on blue is 6.7. Blue means primary action, links, focus, the active nav item and "In progress". Nothing else is blue.
- Verdicts (fg/bg/border): Take #15803D/#F0FDF4/#86EFAC (4.8). Maybe #B45309/#FFFBEB/#FCD34D (4.8). Pass #B91C1C/#FEF2F2/#FCA5A5 (5.9).
- Job statuses, as a pill with a 6px dot and a word (never colour alone): Quoted = slate #334155 on #F1F5F9; Scheduled = violet #6D28D9 on #F5F3FF; In progress = blue; Waiting on parts = amber; Done = green; Paid = teal #0F766E on #F0FDFA.
- Money: a negative profit shows as red-700 text with a leading "−". A positive profit stays in text colour, not green.
- Type: `system-ui, -apple-system, "Segoe UI Variable Text", "Segoe UI", Roboto, sans-serif`. Mono for the timer: `ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace`. Every number gets `tabular-nums`. Scale: 12/16 caption, 13/18 table, 14/20 body, 16/24 section title (600), 20/28 page title (600), 28/32 KPI value (600), 40 timer.
- Spacing: a 4px base; use 4, 8, 12, 16, 24 and 32. Radii: 4 for cards, inputs and buttons; 2 for pills and checkboxes. Shadows only on menus and dialogs. No gradients.

### Layout
- Window minimum 1100×700. Fixed sidebar of 220px: app name at the top, then nav items Dashboard, Jobs, New job, Export, Settings, each 40px tall with an 18px icon and a label. The active item gets the blue tint, blue text and a 3px left bar. A "+ New job" primary button is pinned in the sidebar.
- Content area: 24px padding, max width 1440px. Header row of 56px holds the page title on the left and actions on the right.

### Components
- Targets: buttons and inputs are 40px tall, 36px at minimum. Icon buttons are 40×40. Timer and Take/Pass buttons are 48px. Table rows are 40px, the whole row is clickable and opens Job detail, with a 4px gap between adjacent targets. This beats the WCAG 2.5.8 floor of 24px with room for imprecise hands.
- Tables: a sticky 36px header with 12px uppercase text-2 labels, 1px dividers, no zebra striping. Numbers are right-aligned. Columns: Job/customer, Status, Date, Hours, Profit, $/hr, Content. When $/hr is below target, show it in amber with a "▼" glyph. The filter bar above the table holds a Status multi-select, Customer search and a date range. Active filters appear as removable chips with "Clear all".
- KPI tiles: a 4-column grid, 3 at the minimum width. Each tile is white, 1px border, 16px padding, 112px tall, with a 12px text-2 label, a 28px value and a 12px delta line ("vs target $95/hr", "est $4,200 · actual $3,880"). "Open jobs by status" is a stacked count list in status pills. "Top unposted content jobs" is a full-width list card of 5 rows with the score at the right.
- Should I take it?: a two-column layout, form (1fr, max 560px) and a verdict card (360px, sticky top). Single-column labels sit above fields; groups are Customer & vehicle, Work, Estimate. The verdict card has a 4px left border plus a tinted background, a 24px verdict word with an icon (✓ / ? / ✕) and 3–5 reason rows (+/− glyph, 14px, with weight shown, e.g. "$/hr $82 < target $95"). It updates live, debounced 250ms, and shows "Fill hours and price to see a verdict" until there is enough data. Buttons at the bottom: Save as quoted / Discard.
- Job detail: a header with the job, customer and status pill, and a status dropdown at the right. Tabs (40px, blue 2px underline): Overview & estimate · Labor · Parts · Content.
- Labor timer: a card holding the tech select, a 40px mono elapsed time and a 48px Start (blue) / Stop (red-700 outline) toggle. While running, the sidebar shows a "● Timer 0:42:10 · Job #123" chip on every page. Entries table below with an inline-editable row and an "Add manual entry" button.
- Export: Date range presets (This week/month/Custom), then two equal action cards: Google Sheets (shows connected account; disabled with "Connect in Settings" link if not) and File (.xlsx / CSV radio). Toast on result with "Open file".
- Settings: Settings uses one scrolling page with an in-page section list on the left: Rates, Techs, Verdict weights, Google, Backup. Weights are numeric inputs with a short live preview line, not sliders.

### States
- Empty: one sentence plus one action, with no illustrations. For example, "No jobs yet. Add your first job" (with a button), and in the content list, "Nothing to post."
- Loading: skeleton rows or tiles after 300ms.
- Error: an inline red-700 bar with a Retry button.
- Unsaved changes: a dot on the tab.

### Accessibility
- Focus: a 2px #1D4ED8 outline with a 2px offset on every control (`:focus-visible`), and never removed. Full keyboard support: N for a new job, / to search, and arrow keys plus Enter on table rows.
- Every icon-only button has an accessible label. Verdicts and statuses always pair colour with a word and a glyph.
- With reduced motion on, transitions are disabled. Transitions are 120ms or less in any case.
- Layout must survive 125% OS scaling at 1100px.

### Do / Don't
- Do: one blue primary button per view, numbers right-aligned in tabular figures, and every $/hr shown next to its target.
- Don't: zebra striping, charts in place of numbers, green for "positive profit", hover-only actions, or controls under 36px.

### References
- WCAG 2.2: 1.4.3 contrast, 1.4.11 non-text contrast, 2.5.8 target size. Contrast ratios computed locally.
- Apple HIG (pointer targets) and Microsoft Fluent (Segoe UI Variable, 40px control height).
