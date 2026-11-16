import { describe, expect, it } from 'vitest'
import { actuals, contentScore, estimate, hourlyTint, verdict } from './calc'
import { DEFAULT_SETTINGS, emptyContent, type Job, type LaborEntry, type Part } from './types'

const s = DEFAULT_SETTINGS // rate 140, tech 30, overhead 35 => cost 65/hr; target 125; band 15%; markup 50%

const job = (over: Partial<Job> = {}): Job => ({
  id: 1, customerId: null, title: 'Brake job', description: '', vehicleYear: '', vehicleMake: '', vehicleModel: '',
  vin: '', mileage: '', status: 'Lead', quoteType: 'flat', quotedPrice: 700, estHours: 5, estPartsCost: 200,
  riskFlags: [], content: emptyContent(), salesTax: 0, paymentDate: '', paymentMethod: '', createdAt: '',
  startedAt: '', finishedAt: '', ...over,
})
const labor = (hours: number): LaborEntry => ({ id: 0, jobId: 1, tech: 'Owner', date: '', hours, note: '', timerStart: null })
const part = (cost: number, charged: number): Part => ({ id: 0, jobId: 1, description: '', cost, charged, supplier: '' })

describe('estimate', () => {
  it('flat job: quote + marked-up parts, minus parts cost and hourly cost', () => {
    const e = estimate(job(), s)
    expect(e.partsRevenue).toBe(300)
    expect(e.revenue).toBe(1000)
    expect(e.profit).toBe(1000 - 200 - 5 * 65) // 475
    expect(e.effectiveHourly).toBe(160) // (1000-200)/5
  })
  it('hourly job bills rate x hours and ignores quotedPrice', () => {
    const e = estimate(job({ quoteType: 'hourly', quotedPrice: 99999, estPartsCost: 0 }), s)
    expect(e.laborRevenue).toBe(700)
    expect(e.effectiveHourly).toBe(140)
  })
  it('customer-supplied parts earn and cost nothing', () => {
    const e = estimate(job({ riskFlags: ['customerParts'] }), s)
    expect(e.partsRevenue).toBe(0)
    expect(e.partsCost).toBe(0)
    expect(e.revenue).toBe(700)
  })
  it('zero hours gives no effective hourly', () => {
    expect(estimate(job({ estHours: 0 }), s).effectiveHourly).toBeNull()
  })
})

describe('actuals', () => {
  it('sums labor and parts; variance vs estimate', () => {
    const a = actuals(job(), [labor(4), labor(2.5)], [part(200, 300), part(20, 30)], s)
    expect(a.hours).toBe(6.5)
    expect(a.revenue).toBe(700 + 330)
    expect(a.profit).toBe(1030 - 220 - 6.5 * 65)
    expect(a.effectiveHourly).toBe(Math.round(((1030 - 220) / 6.5) * 100) / 100)
    expect(a.variancePct).toBe(30)
  })
  it('hourly job revenue tracks logged hours', () => {
    const a = actuals(job({ quoteType: 'hourly' }), [labor(3)], [], s)
    expect(a.laborRevenue).toBe(420)
  })
  it('no labor logged: no hourly, no variance', () => {
    const a = actuals(job(), [], [], s)
    expect(a.effectiveHourly).toBeNull()
    expect(a.variancePct).toBeNull()
  })
})

describe('hourlyTint', () => {
  it('green / amber / red against target and band', () => {
    expect(hourlyTint(125, s)).toBe('good')
    expect(hourlyTint(107, s)).toBe('warn') // floor 106.25
    expect(hourlyTint(106, s)).toBe('bad')
    expect(hourlyTint(null, s)).toBe('none')
  })
})

describe('verdict', () => {
  it('needs hours', () => {
    expect(verdict(job({ estHours: 0 }), s).level).toBeNull()
  })
  it('needs a quote on flat jobs', () => {
    expect(verdict(job({ quotedPrice: 0 }), s).level).toBeNull()
  })
  it('Take when projected $/hr meets target', () => {
    expect(verdict(job(), s).level).toBe('Take') // 160/hr
  })
  it('Maybe inside the band', () => {
    // 5 hrs, parts 0, quote 575 => 115/hr (floor 106.25)
    expect(verdict(job({ quotedPrice: 575, estPartsCost: 0 }), s).level).toBe('Maybe')
  })
  it('Pass well under target', () => {
    expect(verdict(job({ quotedPrice: 400, estPartsCost: 0 }), s).level).toBe('Pass') // 80/hr
  })
  it('risk flags pad hours and can push Take down', () => {
    // quote 650, 5 hrs, no parts => 130/hr; one flag => 5.5h => 118/hr => Maybe
    const v = verdict(job({ quotedPrice: 650, estPartsCost: 0, riskFlags: ['rust'] }), s)
    expect(v.projectedHours).toBe(5.5)
    expect(v.level).toBe('Maybe')
  })
  it('three or more flags drop a level', () => {
    // 3 flags => 6.5h; quote 1000 => 153/hr Take, dropped to Maybe
    const v = verdict(job({ quotedPrice: 1000, estPartsCost: 0, riskFlags: ['rust', 'electrical', 'noDeposit'] }), s)
    expect(v.level).toBe('Maybe')
  })
  it('strong content lifts Pass to Maybe', () => {
    const content = { rarity: 2, transformation: 2, story: 1, satisfying: 1, trend: 1 }
    expect(contentScore(content)).toBe(7)
    expect(verdict(job({ quotedPrice: 400, estPartsCost: 0, content }), s).level).toBe('Maybe')
  })
  it('a money-losing job is Pass even with great content', () => {
    const content = { rarity: 2, transformation: 2, story: 2, satisfying: 2, trend: 2 }
    const v = verdict(job({ quotedPrice: 200, estPartsCost: 0, content }), s) // 200 - 325 < 0
    expect(v.level).toBe('Pass')
    expect(v.reasons.some((r) => r.text.includes('lose money'))).toBe(true)
  })
  it('every risk flag gets named in the reasons', () => {
    const v = verdict(job({ riskFlags: ['rust', 'specialTools'] }), s)
    const text = v.reasons.map((r) => r.text).join(' ')
    expect(text).toContain('rust')
    expect(text).toContain('special tools')
  })
})
