# WIFT

**W**ater pump · **I**njectors · **F**uel pump · **T**urbo: the four usual BMW N54 failures, and the name of a shop
management app for an independent German-car repair shop. It's a desktop app for Mac and Windows, and all data stays on the computer.

Its features use Tekmetric's as a baseline (`docs/research/tekmetric-features.md`). The design is its own, from Mobbin references
(`docs/research/mobbin/`) and the UI brief (`docs/research/ui-brief-v2.md`).

## Download
Get the latest installer from [Releases](https://github.com/jeremypotter321/wift/releases/latest):

| Computer | File |
|---|---|
| Windows 10/11 | `WIFT-<version>-win-x64.exe` |
| Mac with Apple silicon (M1–M4) | `WIFT-<version>-mac-arm64.dmg` |
| Mac with an Intel processor | `WIFT-<version>-mac-x64.dmg` |

The installers aren't signed with a paid Apple or Microsoft certificate, so the first launch needs one extra step:
- **Windows:** if SmartScreen says "Windows protected your PC", click **More info → Run anyway**.
- **Mac:** open the .dmg and drag WIFT to Applications. Open it once. If macOS says it can't verify the developer, go to **System Settings → Privacy & Security** and click **Open Anyway**. If it says the app "is damaged", run `xattr -cr /Applications/WIFT.app` in Terminal, then open it again.

## Modules
- **Dashboard:** today's sales, car count, average repair order (ARO) and gross profit %, each against the same day last week. It also shows today's appointments, the shop by stage, cars waiting on parts, and who's clocked in.
- **Job board:** repair orders by stage (Estimate → Work in progress → Completed) or by tech. Move cards by drag-and-drop or the "Move to" menu. Late and inspection flags show on each card.
- **Repair orders**
  - Jobs hold labor, part, fee, sublet and discount lines. Each job is approved or declined on its own.
  - Canned jobs and the parts pricing matrix fill in prices. A job clock sits on each labor line.
  - Totals include shop supplies (capped), tax by category, and an RO discount.
  - A shop-only block shows cost, gross profit and effective $/hr. It's never printed and is hidden from techs.
  - The customer signs on screen to approve the estimate.
  - Estimates, invoices and inspection reports print, or save as PDF.
  - The "Should I take it?" verdict and the social-media content score live on each repair order.
- **Inspections:** templates, including a BMW N54 (WIFT) one. Each item is rated Good / Soon / Now (keys 1/2/3) and can have notes and photos. "Recommend job" adds the finding to the RO as a pending job.
- **Appointments:** day view (one column per tech), week and month views, a list of unscheduled work, and Start RO from an appointment.
- **Time clock:** techs clock in and out, with a PIN if set. The timesheet shows clocked vs job-clock vs billed hours and efficiency, and exports to CSV.
- **Customers and vehicles**
  - VIN decode uses NHTSA's free API; only the VIN is sent.
  - Each vehicle has its service history, declined work and maintenance due.
  - Customers show balance aging and reminder opt-in.
- **Reminders:** created when a canned job with a service interval is completed, plus "hasn't visited lately" customers. Print the letters as a PDF or export a CSV.
- **Inventory, purchase orders, vendors**
  - Inventory tracks on hand, committed, available and incoming stock, with low and out flags and a tires tab. It imports and exports CSV.
  - A purchase order goes Draft → Ordered → Received, and receiving adds the parts to stock.
  - Completing an RO takes its parts out of stock.
- **Payments & A/R:** split payments and cash change due. Card payments are run on your own terminal and recorded here. A/R shows aging buckets.
- **Reports:** overview, end of day, sales (with chart), gross profit, close ratio, declined jobs, tech productivity and content performance.
- **Accountant export:** push to Google Sheets, or save as .xlsx or CSV. Five tabs: Invoices, Payments, Labor, Parts, Monthly summary.
- **Users & roles:**
  - Owner: everything.
  - Advisor: everything except Settings and profit reports.
  - Tech: no prices or profit.
- **Settings:** labor rates, pricing matrix, supplies and fees, taxes, inspection templates, verdict tuning, and backup and restore.

**Not built in**, because each needs a paid outside account:
- **Texting / email approvals:** print or PDF the estimate and have the customer sign on screen instead.
- **Card processing:** record payments here and run cards on your own terminal.
- **Labor guide data:** use canned jobs, with average clocked vs billed hours.
- **Parts catalog ordering:** enter parts by hand, and use inventory and purchase orders.
- **QuickBooks API:** use the CSV, .xlsx or Sheets export.
- **CARFAX:** use the vehicle's history in WIFT.

## Run it
```
npm install
npm run dev        # dev mode (renderer on :5480)
npm test           # calc, migration, shop operations, export
npm run dist       # dist/WIFT-*-mac-arm64.dmg, -mac-x64.dmg, -win-x64.exe
```
`SHOPBOARD_SEED=1` with an empty database loads a sample shop. Settings ▸ Backup & data ▸ **Load sample shop data** does the same.
`SHOPBOARD_DATA_DIR=<folder>` points the app at a different data folder.

## Data
`wift.db` (SQLite through sql.js, no native modules) lives in the app's data folder; open it from Settings ▸ Backup & data.
- A backup is made on every launch, and the last 15 are kept.
- Inspection photos go in `photos/` and saved PDFs in `documents/`.
- Schema changes are migrations in `src/main/db.ts`. Migration 2 converted the v1 "jobs" into repair orders and kept the v1 tables.

Google Sheets setup: [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md).

## Layout
- `src/shared/`: types, record definitions (`entities.ts`), money math (`calc.ts`), report builder. Used by both the main process and the UI.
- `src/main/`: the database (generic store and migrations), shop operations (`ops.ts`), the IPC API, starter content and sample data (`seed.ts`), the Google push, and exports.
- `src/renderer/`: React UI. The pages are in `pages/`, the repair-order pieces in `ro/`, and print documents in `docs.ts`.
- `scripts/shoot.mjs`: screenshots every screen from the built app, with the window hidden.
