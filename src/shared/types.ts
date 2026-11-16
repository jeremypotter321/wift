export const JOB_STATUSES = ['Lead', 'Quoted', 'Accepted', 'In progress', 'Waiting on parts', 'Done', 'Paid', 'Declined'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const RISK_FLAGS = {
  rust: 'Rust / seized fasteners',
  unknownHistory: 'Unknown history or prior DIY work',
  customerParts: 'Customer-supplied parts',
  electrical: 'Electrical / intermittent problem',
  partsAvailability: 'Parts hard to get or backordered',
  openDiagnosis: 'Open-ended diagnosis, no cap',
  specialTools: 'Needs special tools',
  slowPayCustomer: 'Customer has slow-pay or dispute history',
  noDeposit: 'Big parts order with no deposit',
  comebackRisk: 'High comeback / warranty exposure',
} as const
export type RiskFlag = keyof typeof RISK_FLAGS

export const CONTENT_FACTORS = {
  rarity: 'Rare or interesting car',
  transformation: 'Big before / after',
  story: 'Story or stakes',
  satisfying: 'Satisfying process',
  trend: 'Trend or hook fit',
} as const
export type ContentFactor = keyof typeof CONTENT_FACTORS
/** Each factor is 0 (no), 1 (some), 2 (strong). Total 0–10. */
export type ContentScores = Record<ContentFactor, number>

export type QuoteType = 'flat' | 'hourly'

export interface Settings {
  shopName: string
  laborRate: number // $/hr charged
  techCost: number // $/hr loaded wage cost
  overheadPerHour: number
  targetHourly: number // target effective $/hr on a job
  partsMarkupPct: number
  techs: string[]
  /** Verdict tuning */
  maybeBandPct: number // within this % below target = Maybe
  riskPenaltyPct: number // each risk flag inflates projected hours by this %
  contentBumpScore: number // content score at/above this bumps the verdict one level
  googleClientId: string
  googleClientSecret: string
  googleSpreadsheetId: string
}

export const DEFAULT_SETTINGS: Settings = {
  shopName: 'My Shop',
  laborRate: 140,
  techCost: 30,
  overheadPerHour: 35,
  targetHourly: 125,
  partsMarkupPct: 50,
  techs: ['Owner'],
  maybeBandPct: 15,
  riskPenaltyPct: 10,
  contentBumpScore: 7,
  googleClientId: '',
  googleClientSecret: '',
  googleSpreadsheetId: '',
}

export interface Customer {
  id: number
  name: string
  phone: string
  email: string
  notes: string
}

export interface Job {
  id: number
  customerId: number | null
  customerName?: string
  title: string
  description: string
  vehicleYear: string
  vehicleMake: string
  vehicleModel: string
  vin: string
  mileage: string
  status: JobStatus
  quoteType: QuoteType
  quotedPrice: number // flat: total labor price; hourly: ignored (rate x hours)
  estHours: number
  estPartsCost: number
  riskFlags: RiskFlag[]
  content: ContentScores
  salesTax: number
  paymentDate: string
  paymentMethod: string
  createdAt: string
  startedAt: string
  finishedAt: string
}

export interface LaborEntry {
  id: number
  jobId: number
  tech: string
  date: string
  hours: number
  note: string
  timerStart: string | null // ISO when running
}

export interface Part {
  id: number
  jobId: number
  description: string
  cost: number
  charged: number
  supplier: string
}

export const PLATFORMS = ['TikTok', 'YouTube', 'Instagram', 'Facebook', 'Other'] as const
export interface ContentPost {
  id: number
  jobId: number
  platform: string
  url: string
  date: string
  views: number
  likes: number
}

export interface JobFull {
  job: Job
  labor: LaborEntry[]
  parts: Part[]
  posts: ContentPost[]
}

export const emptyContent = (): ContentScores => ({ rarity: 0, transformation: 0, story: 0, satisfying: 0, trend: 0 })
