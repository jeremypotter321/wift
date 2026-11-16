# Shopboard

A desktop job tracker for a small mechanic shop. It runs on Mac or Windows, and all data stays on the computer.

- **Jobs:** customer, vehicle, status (Lead → Quoted → Accepted → In progress → Waiting on parts → Done → Paid, or Declined).
- **Labor:** start/stop timer or manual hours per tech, compared with the estimate.
- **Profit and effective $/hr:** estimated and actual profit after parts, tech cost and overhead. Live $/hr is shown against your target.
- **Should I take it?:** a Take / Maybe / Pass verdict with plain reasons. It's based on projected $/hr, risk flags, profit and content potential.
- **Content:** scores how good a job would be for TikTok/YouTube/IG, and tracks posts, views and likes.
- **Accountant export:** push to Google Sheets, or save .xlsx or CSV. Both have four tabs: Jobs, Labor, Parts and Monthly summary.

## Run it
```
npm install
npm run dev        # dev mode (renderer on :5480)
npm test           # calc, report and export tests
npm run dist       # builds dist/*.dmg (Mac) and dist/*.exe (Windows installer)
```
`SHOPBOARD_SEED=1 npm run dev` starts with sample jobs, if the database is empty. Settings → **Load sample jobs** does the same.

## Where data lives
`shopboard.db` (SQLite) is in the app's data folder (Settings → **Open data folder**):
- macOS: `~/Library/Application Support/Shopboard/`
- Windows: `%APPDATA%\Shopboard\`

A backup copy goes in `backups/` each time the app opens, and the last 15 are kept.
Settings also has **Save a backup** and **Restore from backup**.

## Google Sheets
See [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md). This is a one-time setup of a Google OAuth client. The app only has `drive.file` access.

## How the numbers work
All the math is in `src/shared/calc.ts` and is unit-tested.
- **Hourly cost** = tech cost + overhead per hour.
- **Profit** = labor revenue + parts charged − parts cost − hours × hourly cost.
- **Effective $/hr** = (revenue − parts cost) ÷ hours. The default target is $125, about 90% of a $140 posted rate.
- **Verdict:**
  - Each risk flag pads the hours by 10%.
  - Take if projected $/hr meets the target. Maybe if it's within 15% below. Pass if it's lower than that.
  - 3+ risks drop the verdict one level. A content score of 7+/10 raises it one level.
  - A job that loses money is always Pass.
  - Every threshold is editable in Settings.

Default rates come from industry ranges (see `docs/research/`). Set your own in Settings.

## Layout
- `src/main/`: Electron main process, with the database (sql.js), the IPC API, exports and the Google push.
- `src/preload/`: the bridge (`window.shop.call`).
- `src/renderer/`: React UI.
- `src/shared/`: types, calculations and the report builder, used by both sides.
- `scripts/shoot.mjs`: screenshots every screen from the built app (`node scripts/shoot.mjs <outDir> <dataDir>`).
