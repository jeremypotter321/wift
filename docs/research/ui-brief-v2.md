## UI Brief: Shopboard v2 (Tekmetric feature baseline, own look)

Written 2026-11-16 by Jerry. Supersedes `ui-brief.md` (v1) where they differ; anything not restated here (focus ring, reduced motion, 125% scaling, empty-state voice) carries over from v1 unchanged.
Contrast ratios below were computed locally with the WCAG 2.x formula, not eyeballed.

### Target users
- **Owner / service advisor** (one person, often both). Desk at the counter, Mac or Windows, mouse plus sometimes a touchscreen. Works in 1–3 minute bursts, gets interrupted by the phone and customers at the counter. Needs to find a car by plate/VIN/phone in seconds, build an estimate, get it signed, and see "am I making money on this RO?".
- **Techs (1–3)**. Walk up to the same shop computer (or a second one on the bench) with dirty hands or gloves. They clock in/out, start/stop job clocks, fill inspections, add photos. They need big targets, few words, and must not see profit numbers.
- **The customer**, briefly: reads a printed estimate/invoice/inspection report and signs on screen at the counter. Must understand it without shop jargon.
- German-car specialty: engine codes (B58, N20, EA888) and VINs are part of daily vocabulary. Show engine code and VIN prominently.
- Accessibility: none stated. Meet WCAG 2.2 AA. Design for imprecise pointing (gloves), glare, and black-and-white printers.

### Platform & framework conventions to follow
- Electron desktop, React, min window 1100×700. Keyboard-first desktop conventions: `⌘/Ctrl+K` and `/` open search, `Esc` closes overlays, native-style menus, right-click context menus mirror every row's ⋯ menu (never the only way).
- Current app (screenshots `01-dashboard.png`, `09-new-verdict.png`): light slate sidebar, white cards, blue `#1D4ED8` primary, status pills with dot + word, verdict card with tinted fill. v2 keeps the card/pill/verdict language and the v1 tokens; it changes the sidebar to graphite and grows navigation from 5 to 12 modules.
- **Deliberate changes from v1, with reasons**
  1. **Graphite sidebar** (was `#F1F5F9`). It ties the app to the new icon (graphite + chrome + blue stripes), separates 12 modules of chrome from the white work surface, and removes v1's known issue (text-3 failing on the light sidebar).
  2. **Top bar added** (48px) for global search and the running-clock chip, because search across customer/phone/plate/VIN/RO# is now the main way into records.
  3. **Sidebar nav items 36px** (was 40). At 12 items + 5 group labels the sidebar has to fit a 700px window. 36px is still well above the WCAG 2.5.8 24px floor and v1's own 36px minimum.
  4. **Settings becomes a section nav with one panel at a time** (was one scrolling page). There are now 12 sections. One long page would be several thousand pixels.
  5. **Statuses re-mapped** to the Tekmetric lifecycle (Estimate → Work in progress → Completed → Paid / On account). The colours are the same, with new words.
  6. **One chart is allowed** in Reports (sales over time), always paired with the numbers table. v1's "no charts in place of numbers" still holds.

### Tokens (v1 kept; additions marked NEW)
- Surfaces: `bg` #FFFFFF, `canvas` #F8FAFC, `row-hover` #F8FAFC, `selected` #EFF6FF, `shop-only` #F1F5F9 (NEW, the tint behind cost/profit blocks).
- Text: `text` #0F172A, `text-2` #475569 (7.2 on canvas), `text-3` #64748B (4.76 on white, 4.55 on canvas; never on tinted fills).
- Borders: `divider` #E2E8F0 (decorative), `control-border` #64748B.
- Accent: `blue` #1D4ED8, `blue-hover` #1E40AF, `blue-tint` #EFF6FF (blue on tint 6.16).
- **Graphite chrome (NEW)**: `sb` #1B1F24, `sb-hover` #252A31, `sb-active` #2A3038, `sb-text` #E2E8F0 (13.4 on sb, 10.8 on active), `sb-text-2` #9AA3AF (6.5 / 5.2), `sb-accent` #3B82F6 (the 3px active bar; 3.6:1 vs sb-active, so it passes the 3:1 non-text rule), `sb-focus` #60A5FA (6.5:1 on sb; the focus ring colour on dark).
- Stripe motif (NEW, decorative only): three 2px bands, #CBD5E1 / #3B82F6 / #1D4ED8, with 2px gaps. Use it in exactly two places: under the sidebar logo, and optionally as the top rule of printed documents (off by default). Nowhere else.
- Semantic triad, shared by verdicts, DVI ratings and maintenance due (fg / bg / border):
  - Good/Take: #15803D / #F0FDF4 / #86EFAC (4.79).
  - Soon/Maybe: #B45309 / #FFFBEB / #FCD34D (4.84).
  - Now/Pass: #B91C1C / #FEF2F2 / #FCA5A5 (5.91).
  - Solid buttons with white text: green 5.0, amber 5.0, red 6.5.
- RO status pills (6px dot + word, radius 2, 12/16 600, padding 2×8):

  | Stage | Pill word(s) | Colours |
  |---|---|---|
  | Estimate | Estimate · Needs approval · Declined | slate #334155 on #F1F5F9 (9.45) |
  | Work in progress | In progress | blue on blue-tint |
  | Work in progress | Waiting on parts · Waiting on sublet | amber |
  | Completed | Ready for pickup | green |
  | Paid | Paid | teal #0F766E on #F0FDFA (5.25) |
  | On account (A/R) | On account | violet #6D28D9 on #F5F3FF (6.48) |

- PO statuses: Draft = slate, Ordered = blue, Partly received = amber, Received = green.
- Type (v1): system-ui stack, 12/16 caption, 13/18 table, 14/20 body, 16/24 section (600), 20/28 page title (600), 28/32 KPI (600). Mono (v1 stack) for clocks, VIN, part #, RO #. `tabular-nums` on every number.
- Spacing 4/8/12/16/24/32. Radii: 4 (cards, inputs, buttons), 2 (pills), 8 for dialogs only. Shadows on menus, popovers and dialogs only.
- Targets (v1): controls 40px (36 minimum), icon buttons 40×40, table rows 40px. Tech-facing controls are 48px: clock in/out, DVI rating, signature buttons, PIN pad (64px keys).

### Information architecture
- **Shell**: graphite sidebar 224px + content area (top bar 48px, page header 56px, 24px padding, max width 1440).
  - Below a 1280px window width the sidebar auto-collapses to a 64px icon rail. `⌘\` toggles it and the choice is remembered. Rail icons get a tooltip and `aria-label`; group labels become 1px #2A3038 dividers.
- **Sidebar, top to bottom**
  - Logo row 56px: icon 24px + "Shopboard" 14/600 sb-text, shop name 12 sb-text-2. Stripe motif below it.
  - "+ New" split button, full width, 40px, blue. The main part = New repair order (`N`); the chevron opens a menu: Repair order · Appointment · Customer · Purchase order · Payment.
  - Nav (36px items, 18px icon, 14px label; groups have 12px 600 uppercase sb-text-2 labels, 24px tall). Active item = sb-active fill, white text, 3px sb-accent left bar.
    - Dashboard
    - **Shop floor**: Job board · Appointments · Time clock
    - **Customers**: Customers · Reminders
    - **Parts**: Inventory · Purchase orders · Vendors
    - **Money**: Payments & A/R · Reports
    - **Library**: Canned jobs
  - Pinned at the bottom: Settings, then a user chip 48px (initials avatar, name, role). Clicking it opens Switch user (PIN pad).
  - That's 12 modules. Vehicles is not a nav item: you reach a vehicle through search, a customer or an RO, as Tekmetric does. The nav list scrolls on its own if the window is shorter than 700px.
- **Top bar** (white, 1px bottom divider)
  - Search field 400px: placeholder "Search customer, phone, plate, VIN, RO #", `/` hint key.
  - At the right: the job-clock chip, then an icon-button for help.
- **Screen map**
  - Dashboard → home.
  - Job board → RO editor (card click).
  - RO editor tabs: Jobs · Inspection · Payments · Notes & history · Content.
  - Print/preview and Signature are modals from the RO editor.
  - Appointments → "Start RO" creates an RO from an appointment.
  - Customers → Customer detail → Vehicle detail → RO.
  - Inventory / PO / Vendors cross-link. Canned jobs ↔ RO picker.
  - Settings sections: Shop info · Labor rates · Pricing matrix · Supplies & fees · Taxes · Users & roles · Inspection templates · Verdict & content · Google Sheets · Backup.

### Key screens & components

**Global search (command palette).**
- Overlay 640px wide, 80px from the top, input 48px. Results are grouped Customers / Vehicles / Repair orders, with rows 48px (primary line 14/600 + secondary 13 text-2, match highlighted in 600 weight, not colour).
- Detect the input type:
  - 17 chars → VIN: results plus "Decode VIN…".
  - Digits → phone, normalised.
  - `#123` or digits → RO.
  - Plate → exact match first.
- Empty query shows the last 8 opened records.
- No match: "No match for 'X'." plus actions "New customer 'X'" / "New RO".
- ↑/↓ moves, Enter opens, ⌘Enter opens the "+ New RO" for that customer.

**Job-clock chip** (top bar).
- Idle: hidden.
- One clock: 32px tall pill (the chip itself; its Stop button is 36×36): green 8px pulsing dot (static under reduced motion), "RO 1042 · Brakes · 0:42:10" in mono, plus a Stop icon-button.
- Several: "3 clocks running ▾", which opens a popover listing tech / RO / job / elapsed / Stop.
- Clicking the label opens that RO's labor line.

**Dashboard** (`01-dashboard.png` grid kept; layout of fresha-performance.webp KPI row).
- Row 1, 4 KPI tiles (3 at min width), each with a "vs same day last week" delta line: Today's sales · Car count · ARO · GP%.
- Row 2:
  - **Today's appointments** (1fr): time, customer, vehicle, type word (Waiting / Drop-off), RO status or a "Start RO" button.
  - **Shop now** (360px): stage counts as pill + count rows, each a link into the filtered Job board, plus the total $ in WIP.
- Row 3:
  - **Waiting on parts** (1fr): RO, part, vendor, PO status, days waiting. A row turns amber when more than 2 days.
  - **Clocked in** (360px): tech, since, current job, hours today.
- Owner sees GP%; advisor and tech do not (that tile is replaced by "Promised today").
- Empty states:
  - "No appointments today. Add appointment" with a button.
  - "No cars waiting on parts."
  - "Nobody is clocked in." with a "Go to Time clock" link.

**Job board** (plane-board.webp columns/cards/collapsed column; jira-board.webp toolbar).
- Toolbar 48px: Search board · Tech filter (avatar toggles) · Type filter (Waiting / Drop-off) · **View: Stage | Tech** segmented · ⋯ (Show paid today).
- Stage view columns: Estimate · Work in progress · Completed. Each column is min 280px, #F1F5F9 background, radius 4, 8px padding. The 40px header shows name + count + $ total, plus a collapse control (collapses to a 40px vertical strip with the name and count, as plane-board does).
- Card: white, 1px divider border, 12px padding, 8px gap between cards.
  - Line 1: RO # mono 12 text-2, with the promised time at the right.
  - Line 2: customer 14/600.
  - Line 3: vehicle 13 ("2019 BMW 330i · B46").
  - Chip row: sub-status pill · tech initials avatar 24px · Waiting/Drop-off icon + word · DVI counts "2 Now · 3 Soon" (red/amber text with ✕/! glyphs) · approved $.
- Late (now > promised and not Completed): the promised time turns red-700 with a clock glyph and the word "Late".
- Drag moves a card between columns. Moving Estimate → WIP with no approved job opens "Approve jobs first" with a "Get signature" button.
- Every card has a "Move to…" menu (the keyboard and no-drag path). Focus a card + `M`.
- Tech view: columns Unassigned + one per tech, fixed 280px wide, scrolling horizontally. The tech header shows "Assigned 6.5 h · Clocked 4.2 h". Dropping a card assigns all of the RO's unassigned labor lines to that tech.
- Empty: a column says "No estimates" in 13 text-3, centred, with a "+ New RO" text button in Estimate only.

**Repair order editor** (the core).
- Layout: header band, then the tab bar, then two columns: main 1fr (min 600) and a right rail of 320px, sticky, 24px gap.
  - In the 1100px case the sidebar is a 64px rail, so 1100 − 64 − 48 padding = 988 ≥ 600 + 24 + 320.
- **Header band** (white, 1px bottom divider, 16px padding), 2 rows.
  - Row 1: "RO 1042" 20/600 mono digits · status pill · a stage stepper at the right (4 steps, 12px labels; the current one is bold with a blue dot, done steps get ✓) · ⋯ menu (Duplicate, Save for later, Delete).
  - Row 2 is a 5-cell grid, labels 12 text-2 above values 14:
    - **Customer**: name link, phone with copy button.
    - **Vehicle**: year make model, engine code chip, plate, VIN last 8 mono with copy; a link to Vehicle detail.
    - **Mileage in / out**: two 96px numeric inputs. Out < in shows an inline red-700 error.
    - **Promised**: date-time picker, shows "Today 4:00 PM".
    - **Advisor**: select.
- **Tabs** (40px, 2px blue underline): Jobs · Inspection (badge "2 Now") · Payments · Notes & history · Content. A dot appears for unsaved changes.
- **Job card** (one per job).
  - Header 48px: drag handle · job name 16/600 (inline editable) · tech select (assigns all labor lines) · approval segmented control **Pending | Approved | Declined** (36px; Approved = green fill/white text, Declined = red-700 outline) · job total · ⋯.
  - A declined job collapses to its header row at 60% opacity on text-2 with a "Declined — keep for follow-up" note. It stays in the RO (Tekmetric behaviour) and feeds the Declined-jobs report.
  - **Line grid** (hubspot-invoice-line-items.webp density). Rows 40px, columns:
    - type icon 28 (wrench labor / box part / receipt fee / truck sublet, each with `aria-label`).
    - Description 1fr, with part # or tech in 12 text-2 underneath.
    - Qty / Hrs 64.
    - Unit price 96, with "cost $42.10" in 12 text-3 underneath. That cost line is shop-only and hidden for the tech role.
    - Total 96.
    - ⋯ 40.
  - Labor rows: a 36×36 job-clock Start/Stop button left of the hours. While running, it shows elapsed in mono.
  - **Matrix indicator** on part lines: a 20px chip after the price, "Matrix ×2.2" (slate). If the price was typed by hand it becomes "Override" (amber outline) with "Reset to matrix" in the ⋯ menu. Clicking the chip opens a popover showing the matching tier (cost $20–50 → ×2.2 = 54% GP) and a link to the Pricing matrix.
  - Footer row of text buttons, 36px (jobber-quote-editor-empty.webp "Add line / optional / text" row): "+ Labor" · "+ Part" · "+ Fee" · "+ Sublet". Typing in a new Part row searches inventory by part # / description.
- Below the jobs:
  - "+ Add job" (secondary).
  - "Add canned job…" opens a picker popover 480px: search plus a category filter; rows show name, book hours, price, "used 23×". Enter inserts it as a new job (Pending).
  - Empty RO: "No jobs yet. Add a job or pick a canned job." with both buttons.
- **Right rail**, top to bottom:
  1. **Verdict card** (v1 component, unchanged visuals: 4px left border, tinted fill, 24px word + ✓ / ? / ✕, 3–5 reason rows).
     - Shown full only while the RO is in Estimate. After approval it collapses to one 40px line, "Verdict at approval: Take · $141/h", which expands on click.
     - Inputs come from the RO itself: labor hours, prices, parts cost, and the risk checkboxes, which move into the verdict card as a "Risks" disclosure.
     - Not enough data: "Add labor hours and prices to see a verdict."
  2. **Totals** (jobber-quote-editor.webp totals block): Parts · Labor · Fees · Sublet · Discount (with an "Add discount" link, % or $) · Shop supplies (x% of labor, capped) · Tax · **Total** 16/600 above a 2px rule · Paid · **Balance** 16/600 (red-700 if overdue on A/R).
  3. **Shop only** block (#F1F5F9 fill, a lock glyph + "Shop only. Never printed." 12 text-2; jobber-quote-editor.webp "Costs / Estimated margin"):
     - Cost · Gross profit $ and GP% · Parts GP% · Labor GP% · Effective $/hr "vs target $125" (amber ▼ when below).
     - Hidden entirely for the tech role.
  4. **Actions**, one primary per stage:
     - Estimate: **Get signature** (primary), Print estimate.
     - WIP: **Complete work**, Print estimate.
     - Completed: **Take payment**, Print invoice, Post to A/R.
     - Paid: Print invoice, Reopen (in ⋯).
     - All 40px, full rail width, 8px gap.
- **Inspection tab**: see DVI below.
- **Payments tab**: table (date, method, reference, amount, by) plus Take payment.
- **Notes & history tab**: internal notes (jobber-client-billing-notes.webp "Internal notes" box) above an append-only activity log (status changes, approvals with signature thumbnail and timestamp, payments, edits).
- **Content tab**: the v1 content score card, unchanged.

**Print / PDF preview** (mercury-invoice-with-preview.webp).
- Modal at 90% of the window. Left options panel 320px:
  - Document: Estimate | Invoice | Inspection report.
  - Show part numbers.
  - Show labor hours.
  - Include declined jobs as "Recommended, not approved".
  - Include inspection summary.
  - Message to customer (textarea).
- Right: a live preview on #F1F5F9, page shadowed. Footer: Print (primary) · Save PDF.
- **Document** (jobber-quote-customer-view.webp structure). US Letter, 0.5in margins, pure black text on white, readable on a B/W laser printer.
  - Header: shop name 16pt bold, address, phone, a 1px rule (or the stripe motif if enabled).
  - Title "ESTIMATE" / "INVOICE" 20pt, with the RO #, date and promised date at the right.
  - Two-column Customer / Vehicle block (VIN, plate, mileage in/out).
  - One section per job: job name bold, then lines (description, qty/hrs, price, total) and a job subtotal.
  - On an estimate each job also gets ☐ Approve ☐ Decline boxes for paper signing.
  - Totals right-aligned (ending in Balance due on an invoice).
  - Authorization paragraph, a signature line with name/date, and the warranty/disclaimer (from Settings) at 8pt.
  - 10pt body, 9pt tables.
  - Never print cost, GP, matrix, verdict or content score.

**Signature pad** (customer-facing, turned toward the customer).
- Modal 760×560, body type 16.
- Top: one row per job with name + price and **Approve / Decline** toggles at 48px. Live approved total 20/600.
- A signature canvas 680×180: white, 1px control-border, a baseline at 75% height, "Sign here" 14 text-3 that vanishes on the first stroke. "Clear" text button.
- Printed name input 48px.
- Footer: Cancel · **Approve and sign** (48px, disabled until at least one stroke and a name).
- On success, record the timestamp and the per-job decisions, then move the RO to WIP if any job was approved. Toast: "Approved 2 of 3 jobs · $1,240".

**Digital vehicle inspection** (no Mobbin match; shop conventions: traffic-light rating per item, photo evidence, red/yellow findings become recommended work, the report leads with urgent items).
- Inside the RO Inspection tab. Template select at the top (default per canned job or appointment type).
- **Summary bar** 48px:
  - "2 Now · 5 Soon · 21 Good · 4 not checked", each a filter toggle.
  - "Mark unchecked as Good" (secondary; asks for confirmation).
  - Print report.
- Left: a section index 200px (Under hood, Fluids, Brakes, Tires & wheels, Steering & suspension, Lights & wipers, Underbody, Road test). Each shows Now/Soon counts as red/amber text with glyphs.
- Main: item rows 56px.
  - Item name 14.
  - **Rating segmented control**: Good / Soon / Now, 3 × 72px × 48px tall. Each carries glyph + word (✓ Good, ! Soon, ✕ Now) and fills with its triad colour when selected (solid fg, white text). Unrated = all outline. Keys `1/2/3`; `↓` goes to the next item.
  - Measurement field when the template defines one: brake pad "mm", rotor "mm", tread "/32". Tires show a 4-corner LF/RF/LR/RR mini grid of 56px inputs. Values under a template threshold pre-suggest Soon/Now; the tech confirms.
  - Note icon, and a photo count chip.
- Expanding a row shows:
  - Notes textarea, with quick phrases from the template.
  - Photo strip: 96px thumbnails, "Add photo" (file picker / drag-drop; webcam optional). Click opens a lightbox with arrow keys.
  - For Soon/Now items, **"Recommend job"**. It creates a Pending job on the Jobs tab tagged "From inspection", pre-filled from a matching canned job when one is mapped, and the row then shows "Job added ✓ link".
- **Printable report**:
  - Title, then a vehicle block and a summary line.
  - **Needs attention now** first: item, note, up to 2 photos per item in a 2-up grid.
  - **Soon** next.
  - A Good list compressed into 3 columns.
  - Every rating printed as glyph + word, so it survives a B/W printer.
- Empty (no template): "Pick an inspection template to start."
- Loading photos: grey 96px skeleton tiles.

**Appointments** (fresha-day-by-staff.webp day view; jobber-month-calendar.webp month + unscheduled drawer).
- Toolbar: Today · ‹ › · date label · **Day | Week | Month** · columns **Techs | Bays** (Day only) · "+ Appointment".
- **Day**: one column per tech/bay with a sticky header showing name + booked hours. 48px per hour with 15-minute snap. Outside shop hours is hatched #F1F5F9. A 1px blue now-line with a time tag. An appointment block shows time, customer, vehicle and services in 13px.
  - Fill: violet tint with a 3px violet left bar while Scheduled.
  - Once an RO exists, it takes that RO's status colour and pill.
  - Waiting vs Drop-off as icon + word.
  - Drag to move or resize. "Reschedule…" in the menu is the keyboard path.
- **Week**: a 7-column time grid. Overlapping blocks split the width.
- **Month**: cells with the date number, an "N appts" count, up to 3 chips (time + customer), and "+2 more", which opens the day.
- **Unscheduled drawer**: 280px at the right, collapsible to a 40px strip with a count (jobber-month-calendar.webp). It lists approved-but-unscheduled ROs and reminder call-backs. Drag onto the calendar, or "Schedule…".
- Empty day: "Nothing booked." Clicking an empty slot opens a create popover.

**Time clock** (square-timecards.webp).
- **Clock panel** at the top: a tech tile grid (up to 4 across). Each 200×120 tile shows name, state word + time ("In since 7:58 AM" / "On break" / "Out"), and a 48px button: Clock in (blue) / Clock out (red-700 outline), plus a Break text button.
  - If the tech has a PIN, a PIN pad appears first.
- **Timesheet** below, with tabs Day | Week and a date nav:
  - Day: one row per tech on a 7 AM–7 PM horizontal timeline. Clocked time is a slate-200 bar, job-clock segments inside it are blue bars labelled with the RO #, and breaks are hatched. Columns at the right: Clocked h · Billed h · Efficiency % (amber ▼ under target).
  - Week: a tech × day table with totals, plus Export CSV.
- Editing an entry opens a popover with in/out times and a required reason. It goes to the audit log.
- Empty: "No time recorded for this day."

**Customers list + detail** (jobber-client-detail.webp two-column; jobber-client-billing-notes.webp balance + notes).
- List columns: Name · Phone · Vehicles ("2017 Audi A4 +1") · Last visit · Balance (right-aligned; red-700 with "Overdue" when past terms) · Opt-in (icons with words in the tooltip and `aria-label`). Search and filters (Has balance, Fleet, Opted in).
- Detail:
  - Header: name 20/600, tag pills (Fleet, Tax exempt), actions (New RO primary, Edit, ⋯).
  - Main column:
    - **Vehicles** table (year/make/model, engine, plate, VIN mono, last mileage, "New RO").
    - **Work** tabs: Open · History · Estimates · Declined jobs (each declined job has "Add to new RO").
  - Side column, 320px:
    - Contact info: phones with copy, email, preferred contact.
    - **Marketing**: SMS / Email / Mail switches with "consent recorded on <date>".
    - **Balance** card: current, plus aging 0–30 / 31–60 / 61–90 / 90+.
    - Internal notes.
- Empty: "No vehicles yet. Add vehicle" / "No repair orders yet."

**Vehicle detail.**
- Header: "2019 BMW 330i" 20/600, engine code chip, plate, VIN mono + copy, owner link, last mileage.
- **Specs** card: VIN-decoded fields in 2 columns (engine, displacement, drive, trans, body, plant) with "Decoded from NHTSA on 11/16/2026 · Edit". When offline/not decoded: "Not decoded. Decode VIN" (button).
- **Maintenance due**: rows of service · due at miles/date · estimate "≈ in 3 weeks (est.)" · status (Overdue = Now colours, Due soon = Soon colours, OK = Good, each with a word) · "Add to RO".
- **Previously declined** card.
- **Service history** table: date · mileage · RO # · jobs summary · total. Rows open the RO.

**Inventory** (shopify-inventory.webp quantity columns; square-item-library.webp quick-create + stock chips).
- Tabs: Parts | Tires.
- Parts columns: Part # (mono) · Description · Brand · Bin · On hand · Committed (on open ROs) · Available · Incoming (on POs) · Reorder at · Cost · Price.
  - Stock chip: "Low" (amber, Available ≤ Reorder at) / "Out" (red).
- Tires add Size (225/45R17), Load/Speed, Season, DOT.
- A "+ Quick add" row at the top of the table. Import / Export CSV in the header. Row ⋯ → Adjust stock (with a reason) · Create PO.
- Empty: "No parts in stock yet. Add a part or import a CSV."

**Vendors.** Table (name, account #, rep, phone, open POs). Clicking a row opens a 400px right drawer (details + open POs).

**Purchase orders.**
- List with status pills.
- Detail: vendor, expected date, and lines: part, qty ordered, qty received, cost, linked RO #.
- Draft actions: **Mark ordered**. Ordered: **Receive items**, which switches lines to receive mode (qty-received inputs plus "Receive all"). Confirm updates On hand, sets parts linked to ROs to "Received", and clears "Waiting on parts" prompts on those ROs.
- A partial receipt sets "Partly received".

**Canned jobs library.**
- Master-detail: list 320px (search, category groups, with name + price) and an editor that reuses the RO job card component (lines, matrix chips).
- Stats line: "Used 23× · avg clocked 1.4 h vs 1.2 h billed".
- Settings for the default inspection template.
- Empty: "No canned jobs yet. Create one, or save a job from any RO as canned (job ⋯ menu)."

**Pricing matrix editor** (Settings ▸ Pricing matrix).
- Table: Cost from · Cost to · Markup × · GP % (computed, read-only) · Example ("$20 part sells for $44"). Add/remove tier rows.
- Gaps or overlaps show an inline red-700 row message, and Save is blocked.
- A "Test a cost" input shows the resulting price.
- Separate labor-rate table by category (General, Diagnostic, Electrical, …).

**Payments & A/R.**
- Tabs: Payments | Accounts receivable.
- A/R has a 4-tile aging row (0–30 / 31–60 / 61–90 / 90+), then a table: customer · RO # · invoice date · age (bucket pill) · balance · "Take payment".
- **Take payment modal** 520px:
  - Amount (defaults to the balance).
  - Method segmented: Cash · Check · Card (terminal) · Other.
  - Reference (check # / last 4).
  - "Add another payment" for split tenders.
  - Change due shown for cash.
  - Primary "Record $X". Card processing is external, so say so: "Run the card on your terminal, then record it here."

**Reports** (fresha-performance.webp period + compare + KPI deltas; shopify-analytics.webp breakdown card + one chart).
- Left report list 240px: Overview · End of day · Sales · Car count & ARO · Gross profit · Close ratio · Declined jobs · Tech productivity.
- Toolbar: period preset (Today / This week / This month / Custom) · Compare to · Print · Export CSV.
- Body: a KPI row with deltas, then the report table. Specific contents:
  - EOD: payments by method, ROs closed, sales, tax collected.
  - Sales: one sales-over-time chart plus a breakdown card of gross / discounts / supplies / tax / net.
  - GP: parts vs labor GP% and $.
  - Close ratio: estimated $ vs approved $ and %.
  - Declined jobs: customer, vehicle, job, $, date, "Add to RO".
  - Tech productivity: clocked h, billed h, efficiency %, productivity %, sales per tech.
- Profit reports are visible to the owner role only.

**Reminders.**
- Filters: Due within 30 days / Overdue / Service type / Opted in only.
- Table with checkboxes: customer · vehicle · service · due (date or "≈ 64,000 mi est.") · last visit · preferred contact · opt-in.
- A selection bar: **Print letters** · Export CSV · Mark contacted.
- Empty: "No vehicles due in this window."

**Settings.**
- Left section nav 200px, panel at the right (max 720), Save bar sticky at the bottom when the panel has changes.
- Sections as listed in the screen map.
- **Users & roles**: a table (name, role Owner / Advisor / Tech, PIN set ✓, active), plus a read-only permission summary per role:
  - Tech: no prices or profit; board, clocks and DVI only.
  - Advisor: no Settings and no profit reports.
- **Switch user**: a PIN pad with 64px keys, a 4–6 digit dot display, and an "Auto-lock after N min idle" option.
- **Backup**: last backup time, Back up now, Restore (with confirmation), folder.
- **Google Sheets**: v1 card.

### States (all screens)
- Loading: skeletons after 300ms.
- Error: an inline red-700 bar with Retry.
- Empty: one sentence plus one action, no illustrations (v1).
- Unsaved: a tab dot plus a sticky Save bar.
- Destructive actions: a confirm dialog naming the object ("Delete RO 1042?").
- Offline-only features (VIN decode, Google Sheets) show the plain fallback and never block.

### Accessibility
- v1 focus ring: 2px #1D4ED8, offset 2. On the graphite sidebar the ring is #60A5FA.
- Every rating, status, verdict and stock state is glyph + word + colour.
- Every icon-only button has a label. Rails and type icons carry an `aria-label`.
- Drag always has a menu alternative (Move to…, Reschedule…).
- The board, calendar and DVI are fully keyboard-operable.
- Live regions for: the job-clock chip (polite, once a minute, not every second), verdict changes, and toasts.
- Reduced motion: no pulsing dot, no transitions.
- Customer-facing modal (signature) uses 16px body text and 48px controls.
- Survives 125% OS scaling at 1100px, with the sidebar collapsed.

### Do / Don't
- Do: one blue primary per view; the RO editor's primary changes with the stage.
- Do: hide cost/GP/$/hr for the tech role entirely. Don't grey it out.
- Do: right-align money with tabular figures.
- Do: show VIN, part # and RO # in mono, each with a copy button.
- Do: test every print document on a B/W printer setting.
- Don't: use the stripe motif anywhere but the sidebar logo and the optional print rule.
- Don't: use blue for anything but primary, link, focus, active nav, "In progress"/"Ordered" and the now-line.
- Don't: show the verdict or content score on any customer document.
- Don't: use hover-only actions, controls under 36px (48px for tech-facing ones), zebra stripes, or green for "positive profit".

### References
- Mobbin, in `docs/research/mobbin/`:
  - repair-order/jobber-quote-editor.webp: totals, shop-only margin.
  - repair-order/jobber-quote-editor-empty.webp: add-line row.
  - repair-order/hubspot-invoice-line-items.webp: dense line grid, add discount/fee.
  - repair-order/mercury-invoice-with-preview.webp: options + live preview.
  - repair-order/jobber-quote-customer-view.webp: document structure.
  - workflow-board/plane-board.webp: column counts, cards, collapsed column.
  - workflow-board/jira-board.webp: board toolbar, group-by.
  - schedule/fresha-day-by-staff.webp: day by tech, now-line, hatched off-hours.
  - schedule/jobber-month-calendar.webp: month chips, unscheduled drawer.
  - schedule/square-timecards.webp: timesheet timeline.
  - reports/fresha-performance.webp: period/compare, KPI deltas.
  - reports/shopify-analytics.webp: breakdown card, single chart.
  - customers/jobber-client-detail.webp: two-column record.
  - customers/jobber-client-billing-notes.webp: balance, internal notes.
  - inventory/shopify-inventory.webp: committed/available/on hand/incoming.
  - inventory/square-item-library.webp: quick create, stock chips.
- Cam's `tekmetric-features.md`: lifecycle, entities, local fallbacks.
- v1 `ui-brief.md`: tokens and accessibility.
- `build/icon.png`: graphite + chrome + blue stripes.
- WCAG 2.2 SC 1.4.3, 1.4.11, 2.5.8.
