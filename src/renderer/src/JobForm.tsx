import type { Job, Settings } from '../../shared/types'
import { ContentEditor, Field, fmtMoney, NumInput, RiskEditor, Seg } from './ui'

export type Draft = Job & { customerName: string }

/** The estimate form shared by "Should I take it?" and a job's Overview tab. */
export function JobForm({ draft, set, settings, customers }: {
  draft: Draft
  set: (patch: Partial<Draft>) => void
  settings: Settings
  customers: { id: number; name: string }[]
}) {
  return (
    <div className="stack">
      <section className="card stack">
        <h2>Job</h2>
        <div className="grid2">
          <Field label="Customer">
            <input list="customer-list" value={draft.customerName} onChange={(e) => set({ customerName: e.target.value })} placeholder="Name" />
            <datalist id="customer-list">
              {customers.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
          </Field>
          <Field label="Job">
            <input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Front brakes + rotors" />
          </Field>
        </div>
        <div className="grid3">
          <Field label="Year"><input value={draft.vehicleYear} onChange={(e) => set({ vehicleYear: e.target.value })} placeholder="2014" /></Field>
          <Field label="Make"><input value={draft.vehicleMake} onChange={(e) => set({ vehicleMake: e.target.value })} placeholder="Ford" /></Field>
          <Field label="Model"><input value={draft.vehicleModel} onChange={(e) => set({ vehicleModel: e.target.value })} placeholder="F-150" /></Field>
        </div>
        <div className="grid2">
          <Field label="VIN (optional)"><input value={draft.vin} onChange={(e) => set({ vin: e.target.value.toUpperCase() })} /></Field>
          <Field label="Mileage (optional)"><input value={draft.mileage} onChange={(e) => set({ mileage: e.target.value })} /></Field>
        </div>
        <Field label="Notes"><textarea value={draft.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      </section>

      <section className="card stack">
        <h2>Estimate</h2>
        <div className="row">
          <Seg options={['flat', 'hourly'] as const} labels={{ flat: 'Flat price', hourly: 'Hourly' }} value={draft.quoteType} onChange={(quoteType) => set({ quoteType })} />
          <span className="small muted">
            {draft.quoteType === 'flat'
              ? 'Customer pays the quoted labor price no matter how long it takes.'
              : `Customer pays ${fmtMoney(settings.laborRate)}/hr for the hours worked.`}
          </span>
        </div>
        <div className="grid3">
          {draft.quoteType === 'flat' ? (
            <Field label="Quoted labor price">
              <NumInput prefix="$" value={draft.quotedPrice} onChange={(quotedPrice) => set({ quotedPrice })} />
            </Field>
          ) : (
            <Field label="Labor at your rate">
              <input disabled value={fmtMoney(draft.estHours * settings.laborRate)} />
            </Field>
          )}
          <Field label="Estimated hours">
            <NumInput value={draft.estHours} step="0.5" onChange={(estHours) => set({ estHours })} />
          </Field>
          <Field label="Estimated parts cost">
            <NumInput prefix="$" value={draft.estPartsCost} onChange={(estPartsCost) => set({ estPartsCost })} />
          </Field>
        </div>
        <span className="small muted">
          Parts are charged at cost + {settings.partsMarkupPct}% markup. Each labor hour costs you {fmtMoney(settings.techCost + settings.overheadPerHour)} (tech {fmtMoney(settings.techCost)} + overhead {fmtMoney(settings.overheadPerHour)}). Change these in Settings.
        </span>
      </section>

      <section className="card">
        <h2>Risks</h2>
        <p className="small muted" style={{ marginTop: -6 }}>Each one pads the hours by {settings.riskPenaltyPct}%. Three or more drop the verdict a level.</p>
        <RiskEditor value={draft.riskFlags} onChange={(riskFlags) => set({ riskFlags })} />
      </section>

      <section className="card">
        <h2>Content potential</h2>
        <p className="small muted" style={{ marginTop: -6 }}>Would it make a good TikTok / YouTube / Instagram post? A score of {settings.contentBumpScore}+ raises the verdict a level.</p>
        <ContentEditor value={draft.content} onChange={(content) => set({ content })} />
      </section>
    </div>
  )
}
