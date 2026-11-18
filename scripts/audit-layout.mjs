// Layout audit: visits every screen/modal at two window sizes and reports text overflow, children escaping
// their parent, overlapping siblings and input values too long for their field. Usage: node scripts/audit-layout.mjs <dataDir> [outDir]
import { _electron as electron } from 'playwright'
const [dataDir, outDir] = process.argv.slice(2)
const app = await electron.launch({ args: ['.'], env: { ...process.env, SHOPBOARD_DATA_DIR: dataDir, SHOPBOARD_SEED: '1', SHOPBOARD_HIDDEN: '1' } })
const page = await app.firstWindow()
await page.waitForSelector('.kpi', { timeout: 20000 })

const audit = () => page.evaluate(() => {
  const out = []
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
  const name = (el) => {
    const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50)
    return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} "${t}"`
  }
  const scrollable = (el) => /(auto|scroll|hidden)/.test(getComputedStyle(el).overflowX)
  const ctx = document.querySelector('.modal') ?? document.querySelector('.palette') ?? document.querySelector('.content')
  for (const el of ctx.querySelectorAll('*')) {
    if (!vis(el) || el.closest('svg') || el.tagName === 'IFRAME' || el.tagName === 'OPTION') continue
    const cs = getComputedStyle(el)
    // 1. Text spilling out of a box that doesn't clip it on purpose.
    if (!['INPUT', 'TEXTAREA', 'SELECT', 'TABLE', 'TBODY', 'THEAD', 'TR'].includes(el.tagName) && el.scrollWidth > el.clientWidth + 2 && !scrollable(el) && el.clientWidth > 0 && el.children.length === 0)
      out.push(['overflow', name(el), `${el.scrollWidth}>${el.clientWidth}`])
    // 2. Input / select whose value doesn't fit (measured text width vs inner width).
    if ((el.tagName === 'INPUT' && !['checkbox', 'radio', 'file', 'date', 'datetime-local', 'hidden'].includes(el.type)) || el.tagName === 'SELECT') {
      const text = el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text ?? '' : el.value
      if (!text) continue
      const c = document.createElement('canvas').getContext('2d')
      c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (el.tagName === 'SELECT' ? 18 : 0)
      const w = c.measureText(text).width
      if (w > inner + 1) out.push(['field-too-small', name(el), `${Math.round(w)}>${Math.round(inner)}`])
    }
    // 2b. Auto-growing text fields must show all their text.
    if (el.tagName === 'TEXTAREA' && el.classList.contains('autogrow') && el.scrollHeight > el.clientHeight + 3) out.push(['textarea-clipped', name(el), `${el.scrollHeight}>${el.clientHeight}`])
    // 3. Child escaping its parent's box horizontally (parent not scrolling).
    const p = el.parentElement
    if (p && vis(p) && !scrollable(p) && !['TD', 'TH', 'TR', 'TBODY', 'TABLE'].includes(el.tagName) && cs.position !== 'absolute' && cs.position !== 'fixed' && cs.position !== 'sticky') {
      const r = el.getBoundingClientRect(), pr = p.getBoundingClientRect()
      if (r.right > pr.right + 2 || r.left < pr.left - 2) out.push(['escapes-parent', name(el), `in ${name(p).slice(0, 40)} by ${Math.round(Math.max(r.right - pr.right, pr.left - r.left))}px`])
    }
  }
  // 00. Nothing in the sidebar may stick out past it.
  const sb = document.querySelector('.sidebar')
  if (sb) for (const el of sb.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (vis(el) && r.right > sb.getBoundingClientRect().right + 1) out.push(['escapes-sidebar', name(el), `by ${Math.round(r.right - sb.getBoundingClientRect().right)}px`]) }
  // 0. The page itself must never scroll sideways (tables that scroll inside their own card are fine).
  const content = document.querySelector('.content')
  if (content && content.scrollWidth > content.clientWidth + 2) out.push(['page-scrolls-sideways', 'content', `${content.scrollWidth}>${content.clientWidth}`])
  const modal = document.querySelector('.modal-body')
  if (modal && modal.scrollWidth > modal.clientWidth + 2) out.push(['modal-scrolls-sideways', 'modal-body', `${modal.scrollWidth}>${modal.clientWidth}`])
  // 4. Overlapping siblings in flex rows / grids (text-bearing).
  for (const row of ctx.querySelectorAll('.row, .ro-cells, .grid2, .grid3, .grid4, .kpis, .job-head, .chips, .page-head, .totals')) {
    const kids = [...row.children].filter((k) => vis(k) && getComputedStyle(k).position !== 'absolute')
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect()
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (ox > 2 && oy > 2) out.push(['overlap', name(kids[i]), `with ${name(kids[j])}`])
    }
  }
  return [...new Map(out.map((o) => [o.join('|'), o])).values()]
})

const results = {}
const check = async (label) => {
  await page.waitForTimeout(250)
  const r = await audit()
  if (r.length) results[label] = r
  if (outDir) await page.screenshot({ path: `${outDir}/${label.replace(/[^\w-]+/g, '_')}.png` })
}
const nav = async (label) => { await page.click(`.sb-item[aria-label="${label}"]`); await page.waitForTimeout(150) }
const esc = () => page.keyboard.press('Escape')

for (const [w, h] of [[1360, 860], [1100, 700]]) {
  await page.setViewportSize({ width: w, height: h })
  const sz = `${w}`
  await nav('Dashboard'); await check(`${sz} dashboard`)
  await nav('Job board'); await check(`${sz} board`)
  await page.click('.col:nth-child(2) .rcard >> nth=0'); await check(`${sz} ro jobs`)
  for (const t of ['Inspection', 'Payments', 'Notes', 'Content']) { await page.click(`[role=tab]:has-text("${t}")`); await check(`${sz} ro ${t}`) }
  await page.click('[role=tab]:has-text("Inspection")'); await page.click('.dvi-row button[aria-expanded] >> nth=0'); await check(`${sz} ro inspection open`)
  await page.click('[role=tab]:has-text("Jobs")')
  await page.click('.rail button:has-text("Print")'); await check(`${sz} print modal`); await esc()
  await page.click('button:has-text("Add canned job")'); await check(`${sz} canned picker`); await esc()
  await nav('Job board'); await page.click('.col:nth-child(1) .rcard >> nth=0'); await check(`${sz} ro estimate`)
  await page.click('button:has-text("Get signature")'); await check(`${sz} signature`); await esc()
  await nav('Job board'); await page.click('.col:nth-child(3) .rcard >> nth=0'); await check(`${sz} ro completed`)
  if (await page.locator('.rail button:has-text("Take payment")').count()) { await page.click('.rail button:has-text("Take payment")'); await check(`${sz} payment modal`); await esc() }
  await nav('Appointments'); await check(`${sz} appts day`)
  await page.click('button[role=radio]:has-text("Week")'); await check(`${sz} appts week`)
  await page.click('button[role=radio]:has-text("Month")'); await check(`${sz} appts month`)
  await page.click('button:has-text("+ Appointment")'); await check(`${sz} appt modal`); await esc()
  await nav('Time clock'); await check(`${sz} timeclock`)
  await page.click('button[role=radio]:has-text("Week")'); await check(`${sz} timesheet week`)
  await nav('Customers'); await check(`${sz} customers`)
  await page.click('tbody tr.click >> nth=0'); await check(`${sz} customer`)
  await page.click('button:has-text("Edit")'); await check(`${sz} customer edit`); await esc()
  await page.click('tbody tr.click >> nth=0'); await check(`${sz} vehicle`)
  await page.click('button:has-text("Edit")'); await check(`${sz} vehicle edit`); await esc()
  await nav('Reminders'); await page.selectOption('select[aria-label=Window]', 'all'); await check(`${sz} reminders`)
  await nav('Inventory'); await check(`${sz} inventory`)
  await page.click('[role=tab]:has-text("Tires")'); await check(`${sz} tires`)
  await nav('Purchase orders'); await check(`${sz} pos`)
  await page.selectOption('.page-head select', 'all'); await page.click('tbody tr.click >> nth=0'); await check(`${sz} po`)
  await nav('Vendors'); await page.click('tbody tr.click >> nth=0'); await check(`${sz} vendors`)
  await nav('Payments & A/R'); await check(`${sz} ar`)
  await page.click('[role=tab]:has-text("Payments received")'); await check(`${sz} payments`)
  await nav('Reports')
  for (const r of ['Overview', 'End of day', 'Sales', 'Gross profit', 'Close ratio', 'Declined jobs', 'Tech productivity', 'Content performance']) { await page.click(`.sec-link:has-text("${r}")`); await check(`${sz} report ${r}`) }
  await nav('Canned jobs'); await check(`${sz} canned`)
  await nav('Settings')
  for (const s of ['Shop info', 'Labor rates', 'Pricing matrix', 'Supplies', 'Taxes', 'Users', 'Inspection templates', 'Verdict', 'Content keywords', 'Google', 'Backup']) { await page.click(`.sec-link:has-text("${s}")`); await check(`${sz} settings ${s}`) }
  await page.keyboard.press('Meta+k'); await page.keyboard.type('bmw'); await check(`${sz} search`); await esc()
  await page.click('.user-chip'); await check(`${sz} switch user`); await esc()
}
console.log(JSON.stringify(results, null, 1))
console.log('SCREENS WITH ISSUES:', Object.keys(results).length)
await app.close()
