import { useMemo, useState } from 'react'
import { api } from '../api'
import { useData } from '../store'
import { confirmDialog, Empty, LazyText, Modal, todayIso } from '../ui'
import type { InspectionItem, Rating } from '../../../shared/types'

const RATE: { r: Exclude<Rating, '' | 'na'>; glyph: string; word: string }[] = [
  { r: 'good', glyph: '✓', word: 'Good' },
  { r: 'soon', glyph: '!', word: 'Soon' },
  { r: 'now', glyph: '✕', word: 'Now' },
]

export function InspectionTab({ roId, onPrint }: { roId: number; onPrint: () => void }) {
  const { data, act, user } = useData()
  const inspections = data.inspections.filter((i) => i.roId === roId)
  const [activeId, setActiveId] = useState<number | null>(inspections.at(-1)?.id ?? null)
  const insp = inspections.find((i) => i.id === activeId) ?? inspections.at(-1)
  const [tpl, setTpl] = useState(data.templates[0]?.id ?? 0)
  const [section, setSection] = useState('')
  const [filter, setFilter] = useState<Rating | 'unchecked' | ''>('')
  const [open, setOpen] = useState<number | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const items = useMemo(() => (insp ? data.inspectionItems.filter((i) => i.inspectionId === insp.id).sort((a, b) => a.sort - b.sort) : []), [data, insp])
  const sections = [...new Set(items.map((i) => i.section))]
  const count = (r: Rating | 'unchecked', list = items) => list.filter((i) => (r === 'unchecked' ? !i.rating : i.rating === r)).length

  if (!insp) {
    return (
      <div className="card">
        <Empty text="No inspection on this RO yet. Pick a template to start." action={
          <div className="row">
            <select style={{ width: 260 }} value={tpl} onChange={(e) => setTpl(Number(e.target.value))}>{data.templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.items.length} items)</option>)}</select>
            <button className="btn primary" disabled={!tpl} onClick={async () => { const i = await act(() => api.startInspection(roId, tpl, user?.id ?? null)); if (i) setActiveId(i.id) }}>Start inspection</button>
          </div>
        } />
      </div>
    )
  }

  const shown = items.filter((i) => (!section || i.section === section) && (!filter || (filter === 'unchecked' ? !i.rating : i.rating === filter)))
  const rate = (it: InspectionItem, rating: Rating) => act(() => api.save('inspectionItems', { id: it.id, rating: it.rating === rating ? '' : rating }))

  async function addPhotos(it: InspectionItem, files: FileList | null) {
    if (!files?.length) return
    const names: string[] = []
    for (const f of Array.from(files)) {
      const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f) })
      const name = await act(() => api.savePhoto(url))
      if (name) names.push(name)
    }
    await act(() => api.save('inspectionItems', { id: it.id, photos: [...it.photos, ...names] }))
  }

  return (
    <div className="stack">
      <div className="card row wrap" style={{ padding: '8px 12px', gap: 8 }}>
        <b>{insp.name}</b>
        {inspections.length > 1 && (
          <select className="sm" style={{ width: 200 }} value={insp.id} onChange={(e) => setActiveId(Number(e.target.value))}>{inspections.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.createdAt}</option>)}</select>
        )}
        <span className="grow" />
        {([['now', `✕ ${count('now')} Now`, 'tint-bad'], ['soon', `! ${count('soon')} Soon`, 'tint-warn'], ['good', `✓ ${count('good')} Good`, 'tint-good'], ['unchecked', `${count('unchecked')} not checked`, 'muted']] as const).map(([k, label, cls]) => (
          <button key={k} className={`btn sm ${filter === k ? 'primary' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(filter === k ? '' : k)}><span className={filter === k ? '' : cls}>{label}</span></button>
        ))}
        <button className="btn sm" disabled={!count('unchecked')} onClick={async () => {
          if (!(await confirmDialog(`Mark the ${count('unchecked')} unchecked items as Good?`, 'Mark Good'))) return
          await act(() => api.saveMany(items.filter((i) => !i.rating).map((i) => ({ entity: 'inspectionItems' as const, data: { id: i.id, rating: 'good' } }))))
        }}>Mark unchecked Good</button>
        {!insp.completedAt ? (
          <button className="btn sm" onClick={() => act(() => api.save('inspections', { id: insp.id, completedAt: todayIso() }))}>Mark complete</button>
        ) : <span className="pill p-green">Completed</span>}
        <button className="btn sm" onClick={onPrint}>Print report</button>
      </div>

      <div className="dvi">
        <nav className="card" style={{ padding: 6, position: 'sticky', top: 12 }} aria-label="Sections">
          <button className={`sec-link ${!section ? 'on' : ''}`} onClick={() => setSection('')}><span>All sections</span><span className="small muted">{items.length}</span></button>
          {sections.map((sec) => {
            const list = items.filter((i) => i.section === sec)
            return (
              <button key={sec} className={`sec-link ${section === sec ? 'on' : ''}`} onClick={() => setSection(sec)}>
                <span className="ellipsis">{sec}</span>
                <span className="small">{count('now', list) > 0 && <span className="tint-bad">✕{count('now', list)} </span>}{count('soon', list) > 0 && <span className="tint-warn">!{count('soon', list)}</span>}</span>
              </button>
            )
          })}
        </nav>

        <div className="card flush">
          {!shown.length && <Empty text="No items match this filter." />}
          {shown.map((it, idx) => (
            <div className="dvi-item" key={it.id}>
              <div className="dvi-row" tabIndex={0}
                onKeyDown={(e) => {
                  const r = ({ '1': 'good', '2': 'soon', '3': 'now' } as Record<string, Rating>)[e.key]
                  if (r) { e.preventDefault(); void rate(it, r) }
                  if (e.key === 'ArrowDown') { e.preventDefault(); ((e.currentTarget.parentElement?.nextElementSibling?.firstElementChild) as HTMLElement | null)?.focus() }
                  if (e.key === 'ArrowUp') { e.preventDefault(); ((e.currentTarget.parentElement?.previousElementSibling?.firstElementChild) as HTMLElement | null)?.focus() }
                  if (e.key === 'Enter') setOpen(open === it.id ? null : it.id)
                }}>
                <span className="grow item-name">
                  <span>{it.name}</span>
                  {!section && (idx === 0 || shown[idx - 1].section !== it.section) && <span className="small muted"> · {it.section}</span>}
                  {it.note && <div className="small muted ellipsis">{it.note}</div>}
                </span>
                {it.photos.length > 0 && <span className="chip">▣ {it.photos.length}</span>}
                {it.jobId && <span className="chip blue">Job added ✓</span>}
                <div className="rate" role="radiogroup" aria-label={`Rating for ${it.name}`}>
                  {RATE.map(({ r, glyph, word }) => (
                    <button key={r} role="radio" aria-checked={it.rating === r} className={`${r} ${it.rating === r ? 'on' : ''}`} onClick={() => rate(it, r)}>{glyph} {word}</button>
                  ))}
                </div>
                <button className="btn ghost sm icon" aria-expanded={open === it.id} aria-label="Notes and photos" onClick={() => setOpen(open === it.id ? null : it.id)}>{open === it.id ? '▴' : '▾'}</button>
              </div>
              {open === it.id && (
                <div className="stack tight" style={{ padding: '0 12px 12px' }}>
                  <LazyText value={it.note} placeholder="Note (what you found, measurements)" aria-label="Note" onCommit={(note) => act(() => api.save('inspectionItems', { id: it.id, note }))} />
                  <div className="thumbs">
                    {it.photos.map((p) => <img key={p} src={`shopfile://photo/${p}`} alt={`Photo of ${it.name}`} onClick={() => setLightbox(p)} />)}
                    <label className="btn sm" style={{ height: 72, width: 96 }}>+ Photo<input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(it, e.target.files)} /></label>
                  </div>
                  {(it.rating === 'now' || it.rating === 'soon') && !it.jobId && (
                    <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => act(() => api.recommendJob(it.id))}>Recommend job (adds a pending job to the RO)</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Tip: focus a row and press 1 / 2 / 3 for Good / Soon / Now, ↓ for the next item.</p>
      {lightbox && <Modal title="Photo" size="wide" onClose={() => setLightbox(null)}><img src={`shopfile://photo/${lightbox}`} alt="" style={{ width: '100%' }} /></Modal>}
    </div>
  )
}
