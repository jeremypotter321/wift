// WIFT (was Shopboard): Tekmetric-baseline shop management. One local shop, SQLite on disk.

// ---------- repair order lifecycle ----------
/** Estimate → Work in progress → Completed. Paid / A-R is derived from the balance once completed. */
export const RO_STATUSES = ['estimate', 'wip', 'completed'] as const
export type RoStatus = (typeof RO_STATUSES)[number]
export const RO_STATUS_LABEL: Record<RoStatus, string> = { estimate: 'Estimate', wip: 'Work in progress', completed: 'Completed' }
/** Optional finer stage shown on the job board card. */
export const RO_STAGES: Record<RoStatus, string[]> = {
  estimate: ['Not started', 'Needs authorization', 'Waiting on customer'],
  wip: ['In progress', 'Waiting on parts', 'Waiting on sublet', 'Quality check'],
  completed: ['Ready for pickup', 'Picked up'],
}
export type JobStatus = 'pending' | 'approved' | 'declined'
export const LINE_KINDS = ['labor', 'part', 'fee', 'sublet', 'discount'] as const
export type LineKind = (typeof LINE_KINDS)[number]

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
/** Each factor 0 (no), 1 (some), 2 (strong). Total 0–10. */
export type ContentScores = Record<ContentFactor, number>
export const emptyContent = (): ContentScores => ({ rarity: 0, transformation: 0, story: 0, satisfying: 0, trend: 0 })

// ---------- settings ----------
export interface LaborRate { id: string; name: string; rate: number }
export interface MatrixTier { upTo: number | null; markupPct: number } // upTo null = and above
export interface FeePreset { id: string; name: string; amount: number; taxable: boolean }

export interface Settings {
  shopName: string
  shopAddress: string
  shopPhone: string
  shopEmail: string
  laborRates: LaborRate[]
  defaultLaborRateId: string
  techCost: number // $/hr loaded wage cost (default for techs without their own)
  overheadPerHour: number
  targetHourly: number
  partsMatrix: MatrixTier[]
  shopSuppliesPct: number // % of labor
  shopSuppliesCap: number // $ cap per RO, 0 = no cap
  partsTaxPct: number
  laborTaxPct: number
  feesTaxPct: number
  feePresets: FeePreset[]
  nextRoNumber: number
  nextPoNumber: number
  invoiceTerms: string // printed footer: warranty, terms
  reminderMonths: number // "due for service" after this many months since last visit
  reviewUrl: string // Google review link for the printed QR card
  maybeBandPct: number
  riskPenaltyPct: number
  contentBumpScore: number
  googleClientId: string
  googleClientSecret: string
  googleSpreadsheetId: string
}

export const DEFAULT_SETTINGS: Settings = {
  shopName: 'My Shop',
  shopAddress: '',
  shopPhone: '',
  shopEmail: '',
  laborRates: [
    { id: 'std', name: 'Standard', rate: 140 },
    { id: 'diag', name: 'Diagnostic', rate: 160 },
  ],
  defaultLaborRateId: 'std',
  techCost: 30,
  overheadPerHour: 35,
  targetHourly: 125,
  partsMatrix: [
    { upTo: 10, markupPct: 150 },
    { upTo: 50, markupPct: 100 },
    { upTo: 200, markupPct: 70 },
    { upTo: 500, markupPct: 50 },
    { upTo: null, markupPct: 35 },
  ],
  shopSuppliesPct: 5,
  shopSuppliesCap: 40,
  partsTaxPct: 0,
  laborTaxPct: 0,
  feesTaxPct: 0,
  feePresets: [
    { id: 'haz', name: 'Hazmat / disposal', amount: 8, taxable: false },
    { id: 'tire', name: 'Tire disposal', amount: 4, taxable: false },
  ],
  nextRoNumber: 1001,
  nextPoNumber: 1,
  invoiceTerms: '12 month / 12,000 mile warranty on parts and labor unless noted. Customer-supplied parts carry no warranty.',
  reminderMonths: 6,
  reviewUrl: '',
  maybeBandPct: 15,
  riskPenaltyPct: 10,
  contentBumpScore: 7,
  googleClientId: '',
  googleClientSecret: '',
  googleSpreadsheetId: '',
}

// ---------- people ----------
export const ROLES = ['owner', 'advisor', 'tech'] as const
export type Role = (typeof ROLES)[number]
export interface User {
  id: number
  name: string
  role: Role
  pin: string // 4 digits, '' = no PIN
  hourlyCost: number // 0 = use settings.techCost
  color: string
  active: boolean
}

export interface Customer {
  id: number
  name: string
  company: string
  phone: string
  phone2: string
  email: string
  address: string
  contactPref: 'call' | 'text' | 'email'
  marketingOptIn: boolean
  taxExempt: boolean
  fleet: boolean
  tags: string[]
  notes: string
  createdAt: string
}

export interface Vehicle {
  id: number
  customerId: number | null
  year: string
  make: string
  model: string
  trim: string
  engine: string
  vin: string
  plate: string
  color: string
  mileage: number
  notes: string
  decoded: Record<string, string>
  createdAt: string
}

// ---------- repair orders ----------
export interface RepairOrder {
  id: number
  number: number
  customerId: number | null
  vehicleId: number | null
  status: RoStatus
  stage: string
  advisorId: number | null
  techId: number | null
  mileageIn: number
  mileageOut: number
  promisedAt: string
  poNumber: string
  concern: string // customer's complaint, printed on the RO
  notes: string // internal
  riskFlags: RiskFlag[]
  content: ContentScores
  discountPct: number // RO-level discount on labor + parts
  suppliesOverride: number | null // null = use settings
  authorizedBy: string
  authorizedAt: string
  signature: string // PNG data URL
  createdAt: string
  startedAt: string
  completedAt: string
  pickedUpAt: string
  stockApplied: boolean // inventory decremented on completion
}

export interface RoJob {
  id: number
  roId: number
  title: string
  notes: string
  status: JobStatus
  techId: number | null
  cannedJobId: number | null
  declinedReason: string
  sort: number
}

export interface RoLine {
  id: number
  jobId: number
  kind: LineKind
  description: string
  partNumber: string
  qty: number // hours for labor
  cost: number // unit cost to the shop
  price: number // unit price to the customer (labor: rate; discount: positive amount)
  laborRateId: string
  inventoryPartId: number | null
  vendorId: number | null
  taxable: boolean
  sort: number
}

/** A job clock entry: time a tech actually spent on an RO job. */
export interface LaborEntry {
  id: number
  roId: number
  jobId: number | null
  userId: number | null
  date: string
  hours: number
  note: string
  timerStart: string | null
}

export const PAYMENT_METHODS = ['Cash', 'Card', 'Check', 'Transfer', 'Financing', 'Other'] as const
export interface Payment {
  id: number
  roId: number
  date: string
  amount: number
  method: string
  reference: string
  note: string
}

// ---------- inspections ----------
export type Rating = 'good' | 'soon' | 'now' | 'na' | ''
export const RATING_LABEL: Record<Exclude<Rating, ''>, string> = { good: 'Good', soon: 'Needs attention soon', now: 'Needs attention now', na: 'N/A' }
export interface TemplateItem { section: string; name: string }
export interface InspectionTemplate { id: number; name: string; items: TemplateItem[] }
export interface Inspection {
  id: number
  roId: number
  name: string
  userId: number | null
  createdAt: string
  completedAt: string
}
export interface InspectionItem {
  id: number
  inspectionId: number
  section: string
  name: string
  rating: Rating
  note: string
  photos: string[] // file names in the data folder's photos/
  jobId: number | null // recommended job created from this finding
  sort: number
}

// ---------- canned jobs ----------
export interface CannedLine {
  kind: LineKind
  description: string
  partNumber: string
  qty: number
  cost: number
  price: number
  laborRateId: string
  taxable: boolean
}
export interface CannedJob {
  id: number
  name: string
  category: string
  notes: string
  lines: CannedLine[]
  intervalMonths: number // creates a service reminder when used, 0 = none
  intervalMiles: number
}

// ---------- parts ----------
export type PartCategory = 'part' | 'tire' | 'fluid' | 'other'
export interface InventoryPart {
  id: number
  partNumber: string
  description: string
  brand: string
  category: PartCategory
  vendorId: number | null
  cost: number
  price: number // 0 = use the pricing matrix
  onHand: number
  minQty: number
  location: string
  tireSize: string
  notes: string
}
export interface Vendor {
  id: number
  name: string
  contact: string
  phone: string
  email: string
  website: string
  accountNumber: string
  notes: string
}
export type PoStatus = 'draft' | 'ordered' | 'received' | 'cancelled'
export interface PurchaseOrder {
  id: number
  number: number
  vendorId: number | null
  roId: number | null
  status: PoStatus
  notes: string
  createdAt: string
  orderedAt: string
  receivedAt: string
}
export interface PoLine {
  id: number
  poId: number
  inventoryPartId: number | null
  partNumber: string
  description: string
  qty: number
  cost: number
  receivedQty: number
}

// ---------- scheduling, time, marketing, content ----------
export interface Appointment {
  id: number
  customerId: number | null
  vehicleId: number | null
  roId: number | null
  userId: number | null
  title: string
  start: string // ISO local "YYYY-MM-DDTHH:mm"
  end: string
  dropOff: boolean // drop-off vs waiting
  notes: string
  status: 'scheduled' | 'arrived' | 'no-show' | 'cancelled'
}

export interface TimePunch {
  id: number
  userId: number
  clockIn: string // ISO
  clockOut: string // '' while clocked in
  note: string
}

export interface Reminder {
  id: number
  customerId: number | null
  vehicleId: number | null
  service: string
  dueDate: string
  dueMiles: number
  status: 'open' | 'done' | 'dismissed'
  sourceRoId: number | null
  notes: string
}

export const PLATFORMS = ['TikTok', 'YouTube', 'Instagram', 'Facebook', 'Other'] as const
export interface ContentPost {
  id: number
  roId: number
  platform: string
  url: string
  date: string
  views: number
  likes: number
}

/** Everything the renderer works from. A single shop's data is small enough to load whole. */
export interface Snapshot {
  settings: Settings
  users: User[]
  customers: Customer[]
  vehicles: Vehicle[]
  ros: RepairOrder[]
  jobs: RoJob[]
  lines: RoLine[]
  labor: LaborEntry[]
  payments: Payment[]
  inspections: Inspection[]
  inspectionItems: InspectionItem[]
  templates: InspectionTemplate[]
  cannedJobs: CannedJob[]
  parts: InventoryPart[]
  vendors: Vendor[]
  pos: PurchaseOrder[]
  poLines: PoLine[]
  appointments: Appointment[]
  punches: TimePunch[]
  reminders: Reminder[]
  posts: ContentPost[]
  googleConnected: boolean
}
