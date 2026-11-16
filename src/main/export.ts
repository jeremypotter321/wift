import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { toCsv, type Report, type Table } from '../shared/report'

const NUMFMT: Record<Table['formats'][number], string | undefined> = {
  text: undefined,
  date: undefined, // kept as YYYY-MM-DD text so it sorts and imports cleanly everywhere
  money: '$#,##0.00;[Red]-$#,##0.00',
  hours: '0.00',
  pct: '0.0%',
  int: '0',
}

export async function writeXlsx(report: Report, file: string, shopName: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'WIFT'
  wb.title = `${shopName} accounting ${report.from || 'start'} to ${report.to || 'today'}`
  for (const t of report.tables) {
    const ws = wb.addWorksheet(t.name, { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.addRow(t.headers)
    for (const r of t.rows) ws.addRow(r)
    const header = ws.getRow(1)
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
    t.formats.forEach((f, i) => {
      const col = ws.getColumn(i + 1)
      if (NUMFMT[f]) col.numFmt = NUMFMT[f]!
      const longest = Math.max(t.headers[i].length, ...t.rows.map((r) => String(r[i] ?? '').length))
      col.width = Math.min(40, Math.max(10, longest + 2))
    })
    if (t.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.headers.length } }
  }
  await wb.xlsx.writeFile(file)
}

/** One CSV per tab, in a folder (Sheets imports one CSV per tab). Returns the file paths. */
export function writeCsvs(report: Report, dir: string): string[] {
  fs.mkdirSync(dir, { recursive: true })
  return report.tables.map((t) => {
    const f = path.join(dir, `${t.name.toLowerCase().replace(/\s+/g, '-')}.csv`)
    fs.writeFileSync(f, toCsv(t))
    return f
  })
}
