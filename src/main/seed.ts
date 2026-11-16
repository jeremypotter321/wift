import * as db from './db'
import { partsChargedFromCost } from '../shared/calc'
import { emptyContent, type ContentScores, type Job } from '../shared/types'

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
const c = (o: Partial<ContentScores>): ContentScores => ({ ...emptyContent(), ...o })

interface SeedJob {
  job: Partial<Job> & { customerName: string; title: string }
  labor?: [number, number, string][] // [daysAgo, hours, note]
  parts?: [string, number, string][] // [description, cost, supplier]
  posts?: [string, number, number, number][] // [platform, daysAgo, views, likes]
}

const JOBS: SeedJob[] = [
  {
    job: { customerName: 'Dale Hendricks', title: 'Front brakes + rotors', vehicleYear: '2014', vehicleMake: 'Ford', vehicleModel: 'F-150',
      status: 'Paid', quoteType: 'flat', quotedPrice: 420, estHours: 2.5, estPartsCost: 180, createdAt: daysAgo(40), salesTax: 9.9,
      paymentMethod: 'Card', content: c({ satisfying: 1 }) },
    labor: [[38, 2.2, 'Pads, rotors, bleed']],
    parts: [['Rotors (pair)', 110, 'NAPA'], ['Ceramic pads', 58, 'NAPA']],
  },
  {
    job: { customerName: 'Marcus Lee', title: '1972 C10 frame-off restoration', vehicleYear: '1972', vehicleMake: 'Chevrolet', vehicleModel: 'C10',
      status: 'In progress', quoteType: 'hourly', estHours: 60, estPartsCost: 4200, createdAt: daysAgo(30),
      riskFlags: ['rust', 'unknownHistory', 'partsAvailability'],
      content: c({ rarity: 2, transformation: 2, story: 2, satisfying: 2, trend: 1 }) },
    labor: [[28, 6, 'Teardown'], [27, 7.5, 'Teardown, bag and tag'], [20, 8, 'Frame blast prep'], [12, 6.5, 'Floor pans cut out'], [5, 7, 'Patch panels']],
    parts: [['Floor pan set', 640, 'LMC Truck'], ['Cab corners', 210, 'LMC Truck'], ['Media blast (sublet)', 900, 'Valley Blasting']],
    posts: [['TikTok', 25, 48200, 3900], ['YouTube', 18, 12100, 860], ['Instagram', 11, 9300, 1120]],
  },
  {
    job: { customerName: 'Priya Shah', title: 'Check engine light, intermittent no-start', vehicleYear: '2011', vehicleMake: 'BMW', vehicleModel: '328i',
      status: 'Done', quoteType: 'hourly', estHours: 3, estPartsCost: 150, createdAt: daysAgo(14),
      riskFlags: ['electrical', 'openDiagnosis'], content: c({ story: 1, trend: 1 }) },
    labor: [[13, 2.5, 'Scan, smoke test'], [12, 3, 'Traced to corroded ground'], [11, 1, 'Repair + verify']],
    parts: [['Ground strap', 24, 'FCP Euro'], ['Connector kit', 38, 'FCP Euro']],
  },
  {
    job: { customerName: 'Tom Becker', title: 'Lifted Jeep: 3.5" lift + 35s', vehicleYear: '2019', vehicleMake: 'Jeep', vehicleModel: 'Wrangler JL',
      status: 'Paid', quoteType: 'flat', quotedPrice: 1400, estHours: 9, estPartsCost: 2100, createdAt: daysAgo(55), salesTax: 168,
      paymentMethod: 'Check', content: c({ transformation: 2, satisfying: 1, trend: 2 }) },
    labor: [[50, 6, 'Lift install'], [49, 4.5, 'Wheels, alignment, re-torque']],
    parts: [['Lift kit', 1650, 'Quadratec'], ['Extended brake lines', 140, 'Quadratec'], ['Alignment (sublet)', 120, 'Tire Pros']],
    posts: [['TikTok', 47, 22100, 1400]],
  },
  {
    job: { customerName: 'Angela Ruiz', title: 'Timing belt + water pump', vehicleYear: '2008', vehicleMake: 'Honda', vehicleModel: 'Odyssey',
      status: 'Done', quoteType: 'flat', quotedPrice: 780, estHours: 5, estPartsCost: 260, createdAt: daysAgo(9) },
    labor: [[8, 4, 'Belt, pump, tensioner'], [7, 2.5, 'Seized crank bolt']],
    parts: [['Timing kit w/ pump', 230, 'RockAuto']],
  },
  {
    job: { customerName: 'Kevin O\'Neil', title: 'Swap LS into 240SX', vehicleYear: '1993', vehicleMake: 'Nissan', vehicleModel: '240SX',
      status: 'Quoted', quoteType: 'flat', quotedPrice: 4800, estHours: 45, estPartsCost: 3800, createdAt: daysAgo(3),
      riskFlags: ['customerParts', 'unknownHistory', 'electrical', 'noDeposit'],
      content: c({ rarity: 2, transformation: 1, story: 2, satisfying: 2, trend: 2 }) },
  },
  {
    job: { customerName: 'Sandra Kim', title: 'Oil change + tire rotation', vehicleYear: '2020', vehicleMake: 'Toyota', vehicleModel: 'RAV4',
      status: 'Lead', quoteType: 'flat', quotedPrice: 90, estHours: 1, estPartsCost: 35, createdAt: daysAgo(1) },
  },
  {
    job: { customerName: 'Rick Dawson', title: 'Rust repair rockers (customer brought panels)', vehicleYear: '2006', vehicleMake: 'GMC', vehicleModel: 'Sierra',
      status: 'Declined', quoteType: 'flat', quotedPrice: 650, estHours: 12, estPartsCost: 0, createdAt: daysAgo(20),
      riskFlags: ['rust', 'customerParts', 'slowPayCustomer'] },
  },
  {
    job: { customerName: 'Dale Hendricks', title: 'Exhaust leak + O2 sensor', vehicleYear: '2014', vehicleMake: 'Ford', vehicleModel: 'F-150',
      status: 'Waiting on parts', quoteType: 'hourly', estHours: 2, estPartsCost: 140, createdAt: daysAgo(4), riskFlags: ['rust'] },
    labor: [[3, 1, 'Diagnosed, ordered gasket + sensor']],
  },
]

export function loadSample() {
  const s = db.getSettings()
  if (s.techs.length < 2) db.saveSettings({ techs: ['Owner', 'Luis'] })
  for (const sj of JOBS) {
    const j = db.saveJob(sj.job)
    // saveJob stamps today on first reaching a status; backdate to look like real history.
    const age = (sj.labor ?? []).map((l) => l[0])
    const start = age.length ? daysAgo(Math.max(...age)) : ''
    const end = age.length ? daysAgo(Math.min(...age)) : ''
    const patch: Partial<Job> = { id: j.id }
    if (['In progress', 'Waiting on parts', 'Done', 'Paid'].includes(j.status)) patch.startedAt = start
    if (['Done', 'Paid'].includes(j.status)) patch.finishedAt = end
    if (j.status === 'Paid') patch.paymentDate = end
    db.saveJob(patch)
    sj.labor?.forEach(([d, hours, note], i) => db.saveLabor({ jobId: j.id, tech: i % 3 === 2 ? 'Luis' : 'Owner', date: daysAgo(d), hours, note }))
    sj.parts?.forEach(([description, cost, supplier]) => db.savePart({ jobId: j.id, description, cost, charged: partsChargedFromCost(cost, s), supplier }))
    sj.posts?.forEach(([platform, d, views, likes]) => db.savePost({ jobId: j.id, platform, date: daysAgo(d), views, likes, url: '' }))
  }
}
