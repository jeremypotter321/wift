import { lineAmount, type RoBundle, type RoTotals } from '../../shared/calc'
import { RATING_LABEL, type Inspection, type InspectionItem, type Settings, type Vehicle } from '../../shared/types'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const date = (d: string) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

export interface DocOptions {
  kind: 'estimate' | 'invoice'
  partNumbers: boolean
  laborHours: boolean
  includeDeclined: boolean
  message: string
  stripes: boolean
}

const CSS = `
  @page { size: Letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  body { font: 10pt/1.35 -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: #000; margin: 0; }
  .stripes { display: grid; gap: 2px; margin-bottom: 10px; } .stripes i { height: 2px; display: block; background: #000; } .stripes i:nth-child(2) { background: #555; } .stripes i:nth-child(3) { background: #999; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
  .shop b { font-size: 16pt; display: block; } .title { text-align: right; } .title h1 { font-size: 20pt; margin: 0 0 2px; letter-spacing: 0.02em; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 12px; }
  .box { border: 1px solid #000; padding: 6px 8px; } .box h3 { margin: 0 0 4px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; }
  .concern { margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { text-align: left; border-bottom: 1px solid #000; padding: 3px 4px; font-size: 8pt; text-transform: uppercase; }
  td { padding: 3px 4px; border-bottom: 1px solid #ccc; vertical-align: top; }
  .n { text-align: right; white-space: nowrap; }
  .job { margin-bottom: 10px; break-inside: avoid; }
  .job h2 { font-size: 11pt; margin: 0 0 3px; display: flex; justify-content: space-between; gap: 8px; }
  .job .sub { text-align: right; font-weight: 600; padding-top: 3px; }
  .boxes { font-weight: 400; font-size: 9pt; white-space: nowrap; }
  .rec { font-size: 8pt; text-transform: uppercase; border: 1px solid #000; padding: 0 4px; }
  .totals { margin-left: auto; width: 46%; margin-top: 8px; } .totals td { border: 0; padding: 2px 4px; } .totals .grand td { border-top: 2px solid #000; font-weight: 700; font-size: 11pt; }
  .auth { margin-top: 14px; border-top: 1px solid #000; padding-top: 8px; }
  .sig { display: flex; gap: 24px; margin-top: 18px; } .sig div { flex: 1; border-top: 1px solid #000; padding-top: 2px; font-size: 8pt; }
  .sig img { height: 60px; display: block; margin-bottom: -6px; }
  .terms { font-size: 8pt; margin-top: 12px; color: #000; }
  .msg { border-left: 3px solid #000; padding: 4px 8px; margin: 10px 0; }
  .rating { font-weight: 700; white-space: nowrap; }
  .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 4px 0 8px; } .photos img { width: 100%; height: 2.2in; object-fit: cover; border: 1px solid #000; }
  .goods { columns: 3; font-size: 8.5pt; } .goods div { break-inside: avoid; }
  h2.section { font-size: 12pt; border-bottom: 1px solid #000; margin: 14px 0 6px; padding-bottom: 2px; }
`

function head(s: Settings, title: string, number: number, right: string[], stripes: boolean) {
  return `${stripes ? '<div class="stripes"><i></i><i></i><i></i></div>' : ''}<header>
    <div class="shop"><b>${esc(s.shopName)}</b>${[s.shopAddress, s.shopPhone, s.shopEmail].filter(Boolean).map(esc).join('<br>')}</div>
    <div class="title"><h1>${title}</h1><div>RO ${number}</div>${right.map((r) => `<div>${esc(r)}</div>`).join('')}</div></header>`
}
function parties(b: RoBundle, v: Vehicle | null) {
  const c = b.customer
  return `<div class="two">
    <div class="box"><h3>Customer</h3>${c ? `<b>${esc(c.name)}</b>${c.company ? '<br>' + esc(c.company) : ''}<br>${[c.phone, c.email].filter(Boolean).map(esc).join('<br>')}${c.address ? '<br>' + esc(c.address) : ''}` : '—'}</div>
    <div class="box"><h3>Vehicle</h3>${v ? `<b>${esc([v.year, v.make, v.model, v.trim].filter(Boolean).join(' '))}</b>${v.engine ? '<br>' + esc(v.engine) : ''}
      ${v.vin ? '<br>VIN ' + esc(v.vin) : ''}${v.plate ? '<br>Plate ' + esc(v.plate) : ''}` : '—'}
      <br>Mileage in ${b.ro.mileageIn ? b.ro.mileageIn.toLocaleString() : '—'}${b.ro.mileageOut ? ` · out ${b.ro.mileageOut.toLocaleString()}` : ''}</div></div>`
}

/** Estimate or invoice. Never includes cost, GP, matrix, verdict or content score. */
export function roDocument(b: RoBundle, t: RoTotals, s: Settings, v: Vehicle | null, o: DocOptions): string {
  const isEst = o.kind === 'estimate'
  const jobs = b.jobs.filter((j) => (isEst ? j.status !== 'declined' || o.includeDeclined : j.status === 'approved' || o.includeDeclined))
  const right = [`Date ${date(isEst ? b.ro.createdAt : b.ro.completedAt || b.ro.createdAt)}`, b.ro.promisedAt && isEst ? `Promised ${date(b.ro.promisedAt)}` : '', b.ro.poNumber ? `PO ${b.ro.poNumber}` : ''].filter(Boolean)
  const jobHtml = jobs.map((j) => {
    const lines = b.lines.filter((l) => l.jobId === j.id)
    const sub = lines.reduce((a, l) => a + lineAmount(l), 0)
    const recommended = j.status === 'declined' || (!isEst && j.status !== 'approved')
    return `<div class="job"><h2><span>${esc(j.title)} ${recommended ? '<span class="rec">Recommended, not approved</span>' : ''}</span>
      ${isEst && !recommended ? '<span class="boxes">☐ Approve &nbsp; ☐ Decline</span>' : ''}</h2>
      <table><thead><tr><th>Description</th>${o.partNumbers ? '<th>Part #</th>' : ''}<th class="n">${o.laborHours ? 'Qty / Hrs' : 'Qty'}</th><th class="n">Price</th><th class="n">Total</th></tr></thead><tbody>
      ${lines.map((l) => `<tr><td>${esc(l.description || l.kind)}</td>${o.partNumbers ? `<td>${esc(l.partNumber)}</td>` : ''}
        <td class="n">${l.kind === 'labor' && !o.laborHours ? '' : esc(l.qty)}</td><td class="n">${l.kind === 'labor' && !o.laborHours ? '' : money((l.kind === 'discount' ? -1 : 1) * l.price)}</td><td class="n">${money(lineAmount(l))}</td></tr>`).join('')}
      </tbody></table><div class="sub">Job total ${money(sub)}</div></div>`
  }).join('')
  const row = (label: string, n: number, cls = '') => (n ? `<tr class="${cls}"><td>${label}</td><td class="n">${money(n)}</td></tr>` : '')
  const totals = `<table class="totals">${row('Parts', t.parts)}${row('Labor', t.labor)}${row('Fees', t.fees)}${row('Sublet', t.sublet)}${row('Shop supplies', t.supplies)}
    ${t.discount ? `<tr><td>Discount</td><td class="n">-${money(t.discount)}</td></tr>` : ''}${row('Tax', t.tax)}
    <tr class="grand"><td>${isEst ? 'Estimate total' : 'Total'}</td><td class="n">${money(t.total)}</td></tr>
    ${!isEst ? row('Paid', t.paid) + `<tr class="grand"><td>Balance due</td><td class="n">${money(t.balance)}</td></tr>` : ''}</table>`
  const signed = b.ro.signature
    ? `<div class="sig"><div><img src="${b.ro.signature}" alt="">Signed by ${esc(b.ro.authorizedBy)}</div><div>${esc(date(b.ro.authorizedAt))}<br>Date</div></div>`
    : `<div class="sig"><div>Customer signature</div><div>Printed name</div><div>Date</div></div>`
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    ${head(s, isEst ? 'ESTIMATE' : 'INVOICE', b.ro.number, right, o.stripes)}
    ${parties(b, v)}
    ${b.ro.concern ? `<div class="concern"><b>Customer concern:</b> ${esc(b.ro.concern)}</div>` : ''}
    ${o.message ? `<div class="msg">${esc(o.message)}</div>` : ''}
    ${jobHtml || '<p>No jobs.</p>'}
    ${totals}
    <div class="auth">${isEst ? 'I authorize the work marked approved above, and agree to pay for it. The shop may road-test the vehicle. Estimates are valid for 30 days.' : 'Thank you for your business.'}
    ${signed}</div>
    <div class="terms">${esc(s.invoiceTerms)}</div></body></html>`
}

/** Inspection report: urgent items first with photos, then soon, then good in columns. */
export function inspectionDocument(b: RoBundle, insp: Inspection, items: InspectionItem[], s: Settings, v: Vehicle | null, stripes: boolean): string {
  const by = (r: string) => items.filter((i) => i.rating === r)
  const now = by('now'), soon = by('soon'), good = by('good')
  const detail = (list: InspectionItem[], glyph: string, word: string) => list.map((i) => `<div style="break-inside:avoid;margin-bottom:6px">
      <div><span class="rating">${glyph} ${word}</span> · <b>${esc(i.name)}</b> <span style="font-size:8pt">(${esc(i.section)})</span></div>
      ${i.note ? `<div>${esc(i.note)}</div>` : ''}
      ${i.photos.length ? `<div class="photos">${i.photos.slice(0, 2).map((p) => `<img src="shopfile://photo/${esc(p)}">`).join('')}</div>` : ''}</div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    ${head(s, 'INSPECTION', b.ro.number, [date(insp.completedAt || insp.createdAt), insp.name], stripes)}
    ${parties(b, v)}
    <p><b>${now.length} need attention now · ${soon.length} need attention soon · ${good.length} good</b>${items.length - now.length - soon.length - good.length > 0 ? ` · ${items.filter((i) => !i.rating).length} not checked` : ''}</p>
    ${now.length ? `<h2 class="section">✕ ${RATING_LABEL.now}</h2>${detail(now, '✕', 'Now')}` : ''}
    ${soon.length ? `<h2 class="section">! ${RATING_LABEL.soon}</h2>${detail(soon, '!', 'Soon')}` : ''}
    ${good.length ? `<h2 class="section">✓ Good</h2><div class="goods">${good.map((i) => `<div>✓ ${esc(i.name)}</div>`).join('')}</div>` : ''}
    <div class="terms">${esc(s.invoiceTerms)}</div></body></html>`
}
