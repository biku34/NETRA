import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { NEUTRAL, seriesColour, type MethodPattern, type RelatedFir } from '../lib/patterns.ts'
import type { Network, ProcessedFir } from '../lib/types.ts'
import { formatDate } from './ui.tsx'

export interface MapGang {
  network: Network
  related: RelatedFir[]
}

interface Props {
  gangs: MapGang[]
  patterns: MethodPattern[]
  others: ProcessedFir[]
  byId: Map<string, ProcessedFir>
  selected: string | null
  onSelect: (id: string | null) => void
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const tip = (f: ProcessedFir, extra = '') =>
  `<strong>${escape(f.police_station)} PS, ${escape(f.district)}</strong><br>${escape(f.extraction.crime_types.map((c) => c.value).join(', '))}<br>${formatDate(f.occurrence.date)}${f.redacted ? '<br>Outside your state, approximate location' : ''}${extra}`

// Solid line: the same accused, FIR to FIR in date order. Dashed line: same method,
// different accused. Line style carries the meaning, so colour is never the only cue.
export function GangMap({ gangs, patterns, others, byId, selected, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { scrollWheelZoom: false, zoomSnap: 0.25 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, attribution: '&copy; OpenStreetMap contributors' }).addTo(m)
    map.current = m
    layer.current = L.layerGroup().addTo(m)
    const resize = new ResizeObserver(() => m.invalidateSize())
    resize.observe(el.current)
    return () => {
      resize.disconnect()
      m.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const m = map.current
    const g = layer.current
    if (!m || !g) return
    g.clearLayers()
    const points: L.LatLngExpression[] = []
    const at = (f: ProcessedFir): L.LatLngTuple => [f.lat, f.lng]

    for (const f of others) {
      points.push(at(f))
      L.circleMarker(at(f), { radius: 4, color: '#ffffff', weight: 1, fillColor: NEUTRAL, fillOpacity: 0.55 }).bindTooltip(tip(f)).addTo(g)
    }

    for (const p of patterns) {
      for (const f of p.firs) {
        points.push(at(f))
        L.circleMarker(at(f), { radius: 5, color: NEUTRAL, weight: 2, fillColor: '#ffffff', fillOpacity: 1 }).bindTooltip(tip(f, '<br>Repeated method, accused not identified')).addTo(g)
      }
    }

    gangs.forEach(({ network, related }, i) => {
      const colour = seriesColour(i)
      const dim = selected !== null && selected !== network.id
      const members = network.firs.map((id) => byId.get(id)).filter((f): f is ProcessedFir => !!f)
      const opacity = dim ? 0.25 : 1

      L.polyline(members.map(at), { color: '#ffffff', weight: 7, opacity: dim ? 0 : 0.9 }).addTo(g)
      L.polyline(members.map(at), { color: colour, weight: 3, opacity })
        .on('click', () => onSelect(network.id))
        .addTo(g)

      for (const r of related) {
        const nearest = byId.get(network.firs.includes(r.match.a) ? r.match.a : r.match.b)
        if (!nearest) continue
        points.push(at(r.fir))
        L.polyline([at(nearest), at(r.fir)], { color: colour, weight: 2, dashArray: '6 6', opacity }).addTo(g)
        L.circleMarker(at(r.fir), { radius: 6, color: colour, weight: 2, fillColor: '#ffffff', fillOpacity: 1, opacity })
          .bindTooltip(tip(r.fir, `<br>Same method as ${escape(network.label)}, different accused`))
          .addTo(g)
      }

      members.forEach((f, n) => {
        points.push(at(f))
        L.circleMarker(at(f), { radius: 8, color: '#ffffff', weight: 2, fillColor: colour, fillOpacity: opacity, opacity })
          .bindTooltip(tip(f, `<br>FIR ${n + 1} of ${members.length}: ${escape(network.label)}`))
          .on('click', () => onSelect(network.id))
          .addTo(g)
        // the latest FIR carries the gang's name, so the line is identified without the legend
        if (n === members.length - 1 && !dim) {
          L.tooltip({ permanent: true, direction: 'right', offset: [10, 0], className: 'gang-label' }).setLatLng(at(f)).setContent(escape(network.label)).addTo(g)
        }
      })
    })

    if (points.length) m.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 9 })
  }, [gangs, patterns, others, byId, selected, onSelect])

  // z-0 keeps the map's own layers beneath the header, menus and the assistant
  return <div ref={el} className="relative z-0 h-[26rem] w-full rounded-md border border-line" role="img" aria-label="Map of FIRs with lines joining FIRs linked to the same accused" />
}

export function MapLegend({ gangs, hasPatterns }: { gangs: MapGang[]; hasPatterns: boolean }) {
  const line = 'inline-block h-0 w-7 border-t-[3px] align-middle'
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
      {gangs.map(({ network }, i) => (
        <li key={network.id} className="flex items-center gap-2">
          <span className={line} style={{ borderColor: seriesColour(i) }} />
          {network.label}
        </li>
      ))}
      <li className="flex items-center gap-2">
        <span className={`${line} border-dashed`} style={{ borderColor: NEUTRAL, borderTopWidth: 2 }} />
        Same method, different accused
      </li>
      {hasPatterns && (
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full border-2 bg-white" style={{ borderColor: NEUTRAL }} />
          Repeated method, accused not identified
        </li>
      )}
      <li className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full opacity-60" style={{ background: NEUTRAL }} />
        Other FIRs
      </li>
    </ul>
  )
}
