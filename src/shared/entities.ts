import {
  emptyContent,
  type Appointment, type CannedJob, type ContentPost, type Customer, type Inspection, type InspectionItem, type InspectionTemplate,
  type InventoryPart, type LaborEntry, type Payment, type PoLine, type PurchaseOrder, type Reminder, type RepairOrder, type RoJob,
  type RoLine, type TimePunch, type User, type Vehicle, type Vendor,
} from './types'

const today = () => new Date().toISOString().slice(0, 10)

/** Every stored record type: table name, JSON columns, boolean columns, default sort, blank record. */
export const ENTITIES = {
  users: { table: 'users', json: [], bool: ['active'], order: 'id', blank: (): Omit<User, 'id'> => ({ name: '', role: 'tech', pin: '', hourlyCost: 0, color: '#1D4ED8', active: true }) },
  customers: {
    table: 'customers', json: ['tags'], bool: ['marketingOptIn', 'taxExempt', 'fleet'], order: 'name COLLATE NOCASE',
    blank: (): Omit<Customer, 'id'> => ({ name: '', company: '', phone: '', phone2: '', email: '', address: '', contactPref: 'call', marketingOptIn: true, taxExempt: false, fleet: false, tags: [], notes: '', createdAt: today() }),
  },
  vehicles: {
    table: 'vehicles', json: ['decoded'], bool: [], order: 'id',
    blank: (): Omit<Vehicle, 'id'> => ({ customerId: null, year: '', make: '', model: '', trim: '', engine: '', vin: '', plate: '', color: '', mileage: 0, notes: '', decoded: {}, createdAt: today() }),
  },
  ros: {
    table: 'repair_orders', json: ['riskFlags', 'content'], bool: ['stockApplied'], order: 'number DESC',
    blank: (): Omit<RepairOrder, 'id'> => ({
      number: 0, customerId: null, vehicleId: null, status: 'estimate', stage: 'Not started', advisorId: null, techId: null, mileageIn: 0, mileageOut: 0,
      promisedAt: '', poNumber: '', concern: '', notes: '', riskFlags: [], content: emptyContent(), discountPct: 0, suppliesOverride: null,
      authorizedBy: '', authorizedAt: '', signature: '', createdAt: today(), startedAt: '', completedAt: '', pickedUpAt: '', stockApplied: false,
    }),
  },
  jobs: { table: 'ro_jobs', json: [], bool: [], order: 'sort, id', blank: (): Omit<RoJob, 'id'> => ({ roId: 0, title: '', notes: '', status: 'pending', techId: null, cannedJobId: null, declinedReason: '', sort: 0 }) },
  lines: {
    table: 'ro_lines', json: [], bool: ['taxable'], order: 'sort, id',
    blank: (): Omit<RoLine, 'id'> => ({ jobId: 0, kind: 'labor', description: '', partNumber: '', qty: 1, cost: 0, price: 0, laborRateId: '', inventoryPartId: null, vendorId: null, taxable: true, sort: 0 }),
  },
  labor: { table: 'labor_entries', json: [], bool: [], order: 'date, id', blank: (): Omit<LaborEntry, 'id'> => ({ roId: 0, jobId: null, userId: null, date: today(), hours: 0, note: '', timerStart: null }) },
  payments: { table: 'payments', json: [], bool: [], order: 'date, id', blank: (): Omit<Payment, 'id'> => ({ roId: 0, date: today(), amount: 0, method: 'Card', reference: '', note: '' }) },
  inspections: { table: 'inspections', json: [], bool: [], order: 'id', blank: (): Omit<Inspection, 'id'> => ({ roId: 0, name: '', userId: null, createdAt: today(), completedAt: '' }) },
  inspectionItems: {
    table: 'inspection_items', json: ['photos'], bool: [], order: 'sort, id',
    blank: (): Omit<InspectionItem, 'id'> => ({ inspectionId: 0, section: '', name: '', rating: '', note: '', photos: [], jobId: null, sort: 0 }),
  },
  templates: { table: 'inspection_templates', json: ['items'], bool: [], order: 'name', blank: (): Omit<InspectionTemplate, 'id'> => ({ name: '', items: [] }) },
  cannedJobs: { table: 'canned_jobs', json: ['lines'], bool: [], order: 'name COLLATE NOCASE', blank: (): Omit<CannedJob, 'id'> => ({ name: '', category: '', notes: '', lines: [], intervalMonths: 0, intervalMiles: 0 }) },
  parts: {
    table: 'inventory_parts', json: [], bool: [], order: 'description COLLATE NOCASE',
    blank: (): Omit<InventoryPart, 'id'> => ({ partNumber: '', description: '', brand: '', category: 'part', vendorId: null, cost: 0, price: 0, onHand: 0, minQty: 0, location: '', tireSize: '', notes: '' }),
  },
  vendors: { table: 'vendors', json: [], bool: [], order: 'name COLLATE NOCASE', blank: (): Omit<Vendor, 'id'> => ({ name: '', contact: '', phone: '', email: '', website: '', accountNumber: '', notes: '' }) },
  pos: { table: 'purchase_orders', json: [], bool: [], order: 'number DESC', blank: (): Omit<PurchaseOrder, 'id'> => ({ number: 0, vendorId: null, roId: null, status: 'draft', notes: '', createdAt: today(), orderedAt: '', receivedAt: '' }) },
  poLines: { table: 'po_lines', json: [], bool: [], order: 'id', blank: (): Omit<PoLine, 'id'> => ({ poId: 0, inventoryPartId: null, partNumber: '', description: '', qty: 1, cost: 0, receivedQty: 0 }) },
  appointments: {
    table: 'appointments', json: [], bool: ['dropOff'], order: 'start',
    blank: (): Omit<Appointment, 'id'> => ({ customerId: null, vehicleId: null, roId: null, userId: null, title: '', start: '', end: '', dropOff: true, notes: '', status: 'scheduled' }),
  },
  punches: { table: 'time_punches', json: [], bool: [], order: 'clock_in', blank: (): Omit<TimePunch, 'id'> => ({ userId: 0, clockIn: '', clockOut: '', note: '' }) },
  reminders: {
    table: 'reminders', json: [], bool: [], order: 'due_date',
    blank: (): Omit<Reminder, 'id'> => ({ customerId: null, vehicleId: null, service: '', dueDate: '', dueMiles: 0, status: 'open', sourceRoId: null, notes: '' }),
  },
  posts: { table: 'content_posts', json: [], bool: [], order: 'date, id', blank: (): Omit<ContentPost, 'id'> => ({ roId: 0, platform: 'TikTok', url: '', date: today(), views: 0, likes: 0 }) },
} as const

export type EntityName = keyof typeof ENTITIES
export interface EntityTypes {
  users: User; customers: Customer; vehicles: Vehicle; ros: RepairOrder; jobs: RoJob; lines: RoLine; labor: LaborEntry
  payments: Payment; inspections: Inspection; inspectionItems: InspectionItem; templates: InspectionTemplate; cannedJobs: CannedJob
  parts: InventoryPart; vendors: Vendor; pos: PurchaseOrder; poLines: PoLine; appointments: Appointment; punches: TimePunch
  reminders: Reminder; posts: ContentPost
}

export const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
export const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
