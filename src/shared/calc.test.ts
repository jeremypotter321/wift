import { describe, expect, it } from 'vitest'
import { contentScore, hourlyTint, keywordContent, matrixPrice, payState, roTotals, verdict, type RoBundle } from './calc'
import { DEFAULT_SETTINGS, emptyContent, type RepairOrder, type RoJob, type RoLine, type Settings } from './types'

// No supplies / tax unless a test turns them on. Cost/hr = 30 + 35 = 65. Target 125, band 15%.
const s: Settings = { ...DEFAULT_SETTINGS, shopSuppliesPct: 0, partsTaxPct: 0, laborTaxPct: 0, feesTaxPct: 0 }

const ro = (over: Partial<RepairOrder> = {}): RepairOrder => ({
  id: 1, number: 1001, customerId: null, vehicleId: null, status: 'estimate', stage: '', advisorId: null, techId: null,
  mileageIn: 0, mileageOut: 0, promisedAt: '', poNumber: '', concern: '', notes: '', riskFlags: [], content: emptyContent(),
  discountPct: 0, suppliesOverride: null, authorizedBy: '', authorizedAt: '', signature: '', createdAt: '2026-11-01',
  startedAt: '', completedAt: '', pickedUpAt: '', stockApplied: false, ...over,
})
const job = (id: number, status: RoJob['status'] = 'pending'): RoJob => ({
  id, roId: 1, title: `Job ${id}`, notes: '', status, techId: null, cannedJobId: null, declinedReason: '', sort: id,
})
let lid = 0
const line = (jobId: number, kind: RoLine['kind'], qty: number, price: number, cost = 0, taxable = true): RoLine => ({
  id: ++lid, jobId, kind, description: kind, partNumber: '', qty, cost, price, laborRateId: 'std', inventoryPartId: null, vendorId: null, taxable, sort: lid,
})
const bundle = (over: Partial<RoBundle> = {}): RoBundle => ({
  ro: ro(), jobs: [job(1)], lines: [line(1, 'labor', 2, 140), line(1, 'part', 1, 150, 100)], labor: [], payments: [], ...over,
})

describe('matrixPrice', () => {
  it('uses the tier the cost falls in', () => {
    expect(matrixPrice(8, s)).toBe(20) // 150%
    expect(matrixPrice(50, s)).toBe(100) // 100%, boundary inclusive
    expect(matrixPrice(100, s)).toBe(170) // 70%
    expect(matrixPrice(1000, s)).toBe(1350) // 35% open-ended tier
    expect(matrixPrice(0, s)).toBe(0)
  })
})

describe('roTotals', () => {
  it('estimate counts all jobs not declined', () => {
    const t = roTotals(bundle({ jobs: [job(1), job(2, 'declined')], lines: [line(1, 'labor', 2, 140), line(2, 'labor', 5, 140)] }), s)
    expect(t.labor).toBe(280)
    expect(t.declinedTotal).toBe(700)
  })
  it('after authorization only approved jobs count; pending shown separately', () => {
    const b = bundle({ ro: ro({ status: 'wip' }), jobs: [job(1, 'approved'), job(2)], lines: [line(1, 'labor', 2, 140), line(2, 'labor', 1, 140)] })
    const t = roTotals(b, s)
    expect(t.labor).toBe(280)
    expect(t.pendingTotal).toBe(140)
  })
  it('gross profit and effective $/hr from sold hours when nothing is clocked', () => {
    const t = roTotals(bundle(), s)
    expect(t.subtotal).toBe(430)
    expect(t.partsCost).toBe(100)
    expect(t.laborCost).toBe(130)
    expect(t.grossProfit).toBe(200)
    expect(t.effectiveHourly).toBe(165) // (430 - 100) / 2
    expect(t.partsGpPct).toBe(33.33)
  })
  it('clocked hours replace sold hours for cost and $/hr', () => {
    const t = roTotals(bundle({ labor: [{ id: 1, roId: 1, jobId: 1, userId: null, date: '', hours: 3, note: '', timerStart: null }] }), s)
    expect(t.clockedHours).toBe(3)
    expect(t.laborCost).toBe(195)
    expect(t.effectiveHourly).toBe(110)
  })
  it('shop supplies respect the cap and the override', () => {
    const big = bundle({ lines: [line(1, 'labor', 10, 140)] })
    expect(roTotals(big, { ...s, shopSuppliesPct: 5, shopSuppliesCap: 40 }).supplies).toBe(40)
    expect(roTotals(big, { ...s, shopSuppliesPct: 5, shopSuppliesCap: 0 }).supplies).toBe(70)
    expect(roTotals({ ...big, ro: ro({ suppliesOverride: 0 }) }, { ...s, shopSuppliesPct: 5 }).supplies).toBe(0)
  })
  it('discount line and RO discount % both reduce the subtotal', () => {
    const t = roTotals(bundle({ ro: ro({ discountPct: 10 }), lines: [line(1, 'labor', 2, 140), line(1, 'part', 1, 150, 100), line(1, 'discount', 1, 20)] }), s)
    expect(t.discount).toBe(20 + 43)
    expect(t.subtotal).toBe(430 - 63)
  })
  it('tax by category; untaxed lines and tax-exempt customers skip it', () => {
    const tx = { ...s, partsTaxPct: 10, laborTaxPct: 5 }
    const b = bundle({ lines: [line(1, 'labor', 2, 140), line(1, 'part', 1, 150, 100), line(1, 'part', 1, 50, 20, false)] })
    expect(roTotals(b, tx).tax).toBe(15 + 14)
    expect(roTotals({ ...b, customer: { taxExempt: true } as never }, tx).tax).toBe(0)
  })
  it('payments reduce the balance; completed RO is Paid or A/R', () => {
    const b = bundle({ ro: ro({ status: 'completed' }), jobs: [job(1, 'approved')] })
    const part = roTotals({ ...b, payments: [{ id: 1, roId: 1, date: '', amount: 100, method: 'Cash', reference: '', note: '' }] }, s)
    expect(part.balance).toBe(330)
    expect(payState(b.ro, part)).toBe('A/R')
    const full = roTotals({ ...b, payments: [{ id: 1, roId: 1, date: '', amount: 430, method: 'Card', reference: '', note: '' }] }, s)
    expect(payState(b.ro, full)).toBe('Paid')
    expect(payState(ro(), full)).toBeNull()
  })
})

describe('hourlyTint', () => {
  it('green / amber / red', () => {
    expect(hourlyTint(125, s)).toBe('good')
    expect(hourlyTint(107, s)).toBe('warn')
    expect(hourlyTint(106, s)).toBe('bad')
    expect(hourlyTint(null, s)).toBe('none')
  })
})

describe('verdict', () => {
  it('needs labor hours', () => {
    expect(verdict(bundle({ lines: [line(1, 'part', 1, 150, 100)] }), s).level).toBeNull()
  })
  it('Take when projected $/hr meets target', () => {
    expect(verdict(bundle(), s).level).toBe('Take') // 165/hr
  })
  it('Maybe inside the band, Pass below', () => {
    expect(verdict(bundle({ lines: [line(1, 'labor', 1, 115)] }), s).level).toBe('Maybe')
    expect(verdict(bundle({ lines: [line(1, 'labor', 1, 80)] }), s).level).toBe('Pass')
  })
  it('risk flags pad hours; 3+ flags drop a level', () => {
    const one = verdict(bundle({ ro: ro({ riskFlags: ['rust'] }), lines: [line(1, 'labor', 5, 130)] }), s)
    expect(one.projectedHours).toBe(5.5)
    expect(one.level).toBe('Maybe') // 650/5.5 = 118
    const three = verdict(bundle({ ro: ro({ riskFlags: ['rust', 'electrical', 'noDeposit'] }), lines: [line(1, 'labor', 5, 200)] }), s)
    expect(three.level).toBe('Maybe') // 1000/6.5 = 153 Take, dropped
  })
  it('strong content lifts a level, but never a money-loser', () => {
    const content = { rarity: 2, transformation: 2, story: 1, satisfying: 1, trend: 1 }
    expect(contentScore(content)).toBe(7)
    expect(verdict(bundle({ ro: ro({ content }), lines: [line(1, 'labor', 1, 80)] }), s).level).toBe('Maybe')
    const loser = verdict(bundle({ ro: ro({ content: { rarity: 2, transformation: 2, story: 2, satisfying: 2, trend: 2 } }), lines: [line(1, 'labor', 1, 40)] }), s)
    expect(loser.level).toBe('Pass')
  })
  it('judges the estimate even after work starts (ignores clocked time)', () => {
    const b = bundle({ ro: ro({ status: 'wip' }), jobs: [job(1, 'approved')], labor: [{ id: 1, roId: 1, jobId: 1, userId: null, date: '', hours: 20, note: '', timerStart: null }] })
    expect(verdict(b, s).level).toBe('Take')
  })
})

describe('effective $/hr while work is open', () => {
  it('uses sold hours until clocked time passes them, then actual time once completed', () => {
    const entry = (hours: number) => ({ id: 1, roId: 1, jobId: 1, userId: null, date: '', hours, note: '', timerStart: null })
    const wip = roTotals(bundle({ ro: ro({ status: 'wip' }), jobs: [job(1, 'approved')], labor: [entry(0.5)] }), s)
    expect(wip.effectiveHourly).toBe(165) // 330 / 2 sold, not 330 / 0.5
    expect(wip.laborCost).toBe(130)
    const done = roTotals(bundle({ ro: ro({ status: 'completed' }), jobs: [job(1, 'approved')], labor: [entry(1.5)] }), s)
    expect(done.effectiveHourly).toBe(220) // beat book time: 330 / 1.5
    expect(done.laborCost).toBe(97.5)
  })
})

describe('keywordContent', () => {
  const s = { ...DEFAULT_SETTINGS, contentKeywords: { rarity: 'M3, Alpina', transformation: 'single turbo', story: '', satisfying: 'walnut blast', trend: 'E85, N54, tune' } }
  it('scores 1 for one keyword and 2 for two or more, whole words only', () => {
    const { scores, hits } = keywordContent('2008 BMW 335i N54 · E85 flex fuel + tune, walnut blast intake', s)
    expect(scores).toEqual({ rarity: 0, transformation: 0, story: 0, satisfying: 1, trend: 2 })
    expect(hits.trend).toEqual(['E85', 'N54', 'tune'])
  })
  it('does not match inside other words', () => {
    expect(keywordContent('M340i tuner', s).scores.rarity).toBe(0)
    expect(keywordContent('M340i tuner', s).scores.trend).toBe(0)
  })
})
