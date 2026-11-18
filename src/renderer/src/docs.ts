import { lineAmount, type RoBundle, type RoTotals } from '../../shared/calc'
import { RATING_LABEL, type Inspection, type InspectionItem, type RoLine, type Settings, type Vehicle } from '../../shared/types'
import logo from './assets/logo-full.png?inline'

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
  /** Estimate form only. */
  notes?: string
  urgency?: '' | 'urgent' | 'regular'
  customerCopy?: boolean
}

const CSS = `
  @page { size: Letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  body { font: 10pt/1.35 -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: #000; margin: 0; }
  .stripes { display: grid; gap: 2px; margin-bottom: 10px; } .stripes i { height: 2px; display: block; background: #000; } .stripes i:nth-child(2) { background: #555; } .stripes i:nth-child(3) { background: #999; }
  header .logo { height: 0.85in; margin-right: 12px; } header .brand { display: flex; align-items: center; }
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
    <div class="brand"><img class="logo" src="${logo}" alt=""><div class="shop"><b>${esc(s.shopName)}</b>${[s.shopAddress, s.shopPhone, s.shopEmail].filter(Boolean).map(esc).join('<br>')}</div></div>
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

// ---------- Copper Calibration estimate form (their Canva template, 11-17) ----------
const EF_CSS = `
  @page { size: Letter; margin: 0.45in 0.5in; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #000; font: 10.5pt/1.3 Montserrat, 'Avenir Next', 'Segoe UI', Helvetica, Arial, sans-serif; }
  .ef { position: relative; }
  .ef + .ef { break-before: page; }
  .ef-head { display: flex; align-items: center; justify-content: space-between; border: 1.5px solid #000; border-radius: 0.6in; padding: 0.08in 0.3in 0.08in 0.45in; height: 1.1in; }
  .ef-head h1 { margin: 0; font-size: 34pt; font-weight: 800; letter-spacing: 0.01em; }
  .ef-head img { height: 0.92in; }
  .ef-meta { margin: 0.16in 0 0 auto; width: 4.5in; display: grid; gap: 8px; }
  .ef-line { display: flex; align-items: flex-end; gap: 8px; font-size: 11pt; }
  .ef-line > span { white-space: nowrap; }
  .ef-line > u { flex: 1; text-decoration: none; border-bottom: 1px solid #000; text-align: center; min-height: 18px; padding: 0 4px 1px; }
  .ef-rule { border: 0; border-top: 2px solid #000; margin: 0.14in 0 0.18in; }
  h3.ef-h { margin: 0 0 8px; font-size: 11.5pt; font-weight: 800; }
  .ef-cust { display: grid; grid-template-columns: 1fr 0.85fr; column-gap: 0.45in; row-gap: 8px; }
  .ef-cust .wide { grid-column: 1 / -1; }
  table.ef-items { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 0.2in; border: 1.5px solid #000; border-radius: 14px; overflow: hidden; }
  .ef-items th, .ef-items td { border-right: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 6px 8px; text-align: center; vertical-align: middle; }
  .ef-items th:last-child, .ef-items td:last-child { border-right: 0; }
  .ef-items tr:last-child td { border-bottom: 0; }
  .ef-items th { font-weight: 800; font-size: 11pt; height: 0.4in; }
  .ef-items td { height: 0.38in; font-size: 10.5pt; padding: 4px 8px; }
  .ef-items tr { break-inside: avoid; }
  .ef-items .no { width: 0.68in; } .ef-items .qty { width: 0.8in; } .ef-items .money { width: 1.5in; }
  .ef-items tr.sub td.desc { font-size: 10pt; }
  .ef-items .pn { display: block; font-size: 8pt; color: #333; }
  .ef-items .muted { font-size: 8.5pt; color: #444; }
  .ef-sums { margin: -1.5px 0 0 auto; width: 3.03in; border: 1.5px solid #000; border-top: 0; border-radius: 0 0 14px 14px; padding: 2px 16px 4px; break-inside: avoid; }
  .ef-sums div { display: grid; grid-template-columns: 1fr 14px 1.2in; align-items: end; padding: 4px 0 2px; border-bottom: 1px solid #000; }
  .ef-sums div:last-child { border-bottom: 0; } .ef-sums div > span:last-child { font-size: 12.5pt; } .ef-sums .grand span:first-child { font-weight: 800; }
  .ef-sums span:last-child { text-align: center; }
  .ef-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5in; margin-top: 0.14in; break-inside: avoid; }
  .ef-notes { border: 1.5px solid #000; min-height: 0.8in; padding: 8px 12px; text-align: center; white-space: pre-wrap; }
  .ef-urg { display: flex; justify-content: space-between; margin: 6px 0 8px; padding-left: 4px; }
  .ef-urg span { display: inline-flex; align-items: center; gap: 10px; font-size: 11pt; }
  .ef-urg i { width: 22px; height: 22px; border: 1.5px solid #000; border-radius: 50%; display: inline-block; position: relative; }
  .ef-urg i.on::after { content: ''; position: absolute; inset: 4px; background: #000; border-radius: 50%; }
  .ef-disc { font-size: 10pt; }
  .ef-sign { text-align: center; margin-top: 0.12in; break-inside: avoid; }
  .ef-sign .u { text-decoration: underline; font-size: 11pt; }
  .ef-sign .sigline { margin: 6px auto 0; width: 3.2in; padding-top: 4px; }
  .ef-sign .dots { margin: 2px auto 0; width: 3.2in; border-bottom: 4px dotted #000; }
  .ef-sign img { height: 0.6in; display: block; margin: 0 auto -4px; }
`
const efMoney = (n: number) => (Math.abs(n % 1) < 0.005 ? `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}` : money(n))
const pad2 = (n: number) => String(n).padStart(2, '0')
const usDate = (d: string) => { if (!d) return ''; const x = new Date(d.length === 10 ? d + 'T12:00:00' : d); return `${x.getMonth() + 1}/${x.getDate()}/${x.getFullYear()}` }

/**
 * The shop's own estimate form: numbered jobs (01, 02…), with lettered sub-rows (01a, 01b…) when a job has several parts.
 * Item rows carry parts, fees and sublet; labor is totalled once in the LABOR box. With customerCopy, page 2 repeats the
 * form marked CUSTOMER COPY instead of the signature line.
 */
export function estimateForm(b: RoBundle, t: RoTotals, s: Settings, v: Vehicle | null, o: DocOptions): string {
  const c = b.customer
  const jobs = b.jobs.filter((j) => j.status !== 'declined' || o.includeDeclined)
  const cell = (no: string, desc: string, qty: string, price: string, total: string, cls = '') =>
    `<tr class="${cls}"><td class="no">${no}</td><td class="desc">${desc}</td><td class="qty">${qty}</td><td class="money">${price}</td><td class="money">${total}</td></tr>`
  const lineDesc = (l: RoLine, fallback: string) => `${esc(l.description || fallback)}${o.partNumbers && l.partNumber ? `<span class="pn">#${esc(l.partNumber)}</span>` : ''}`
  const rows = jobs.map((j, i) => {
    const no = pad2(i + 1)
    const all = b.lines.filter((l) => l.jobId === j.id)
    const items = all.filter((l) => l.kind !== 'labor')
    const laborH = all.filter((l) => l.kind === 'labor').reduce((a, l) => a + l.qty, 0)
    const title = `${esc(j.title)}${j.status === 'declined' ? ' <span class="muted">(recommended, not approved)</span>' : ''}`
    if (items.length === 0) return cell(no, title, o.laborHours && laborH ? `${laborH} h` : '', '', '<span class="muted">in labor</span>')
    if (items.length === 1) { const l = items[0]; return cell(no, title, esc(l.qty), efMoney((l.kind === 'discount' ? -1 : 1) * l.price), efMoney(lineAmount(l))) }
    return cell(no, title, '', '', efMoney(items.reduce((a, l) => a + lineAmount(l), 0))) +
      items.map((l, k) => cell(no + String.fromCharCode(97 + (k % 26)), lineDesc(l, l.kind), esc(l.qty), efMoney((l.kind === 'discount' ? -1 : 1) * l.price), efMoney(lineAmount(l)), 'sub')).join('')
  }).join('')
  const subtotal = t.total - t.labor - t.supplies - t.tax
  const sum = (label: string, n: number, cls = '') => `<div class="${cls}"><span>${label}</span><span>:</span><span>${efMoney(n)}</span></div>`
  const sums = `<div class="ef-sums">${sum('SUBTOTAL', subtotal)}${sum('LABOR', t.labor)}${t.supplies ? sum('SHOP SUPPLIES', t.supplies) : ''}${t.tax ? sum('TAX', t.tax) : ''}${sum('TOTAL', t.total, 'grand')}</div>`
  const car = v ? [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') : ''
  const line = (label: string, value: string, cls = '') => `<div class="ef-line ${cls}"><span>${label}</span><u>${esc(value)}</u></div>`
  const page = (copy: boolean) => `<section class="ef">
    <div class="ef-head"><h1>ESTIMATE FORM</h1><img src="${logo}" alt="${esc(s.shopName)}"></div>
    <div class="ef-meta">${line('WORK NO :', String(b.ro.number).padStart(4, '0'))}${line('DATE :', usDate(b.ro.createdAt))}</div>
    <hr class="ef-rule">
    <h3 class="ef-h">CUSTOMER INFORMATION</h3>
    <div class="ef-cust">${line('NAME :', c?.name ?? '')}${line('PHONE NO :', c?.phone ?? '')}${line('CAR:', car)}${line('EMAIL :', c?.email ?? '')}${line('ADDRESS :', c?.address ?? '', 'wide')}</div>
    <table class="ef-items"><thead><tr><th class="no">NO</th><th>ITEM DESCRIPTION</th><th class="qty">QTY</th><th class="money">PRICE</th><th class="money">TOTAL</th></tr></thead>
      <tbody>${rows || cell('', 'No items yet', '', '', '')}</tbody></table>
    ${sums}
    <div class="ef-bottom">
      <div><h3 class="ef-h">ADDITIONAL NOTES :</h3><div class="ef-notes">${esc(o.notes ?? '')}</div></div>
      <div><h3 class="ef-h">REPAIR URGENCY :</h3>
        <div class="ef-urg"><span><i class="${o.urgency === 'urgent' ? 'on' : ''}"></i>URGENT</span><span><i class="${o.urgency === 'regular' ? 'on' : ''}"></i>REGULAR</span></div>
        <div class="ef-disc">${esc(s.estimateDisclaimer)}</div></div>
    </div>
    <div class="ef-sign">${copy ? '<div class="u" style="margin-top:0.25in">CUSTOMER COPY</div>' : `<div class="u">CUSTOMER SIGNATURE</div>
      <div class="sigline">${b.ro.signature ? `<img src="${b.ro.signature}" alt="">` : ''}SIGNATURE${b.ro.signature ? ` · ${esc(b.ro.authorizedBy)} · ${esc(usDate(b.ro.authorizedAt))}` : ''}</div><div class="dots"></div>`}</div>
  </section>`
  return `<!doctype html><html><head><meta charset="utf-8"><style>${EF_CSS}</style></head><body>${page(false)}${o.customerCopy ? page(true) : ''}</body></html>`
}
