'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Link from 'next/link'
import type { Vendor } from '@/lib/vendors'
import { VENDORS_BASE_PATH } from '@/lib/vendors'

// Tanzania city coordinates
const CITY_COORDS: Record<string, [number, number]> = {
  'Dar es Salaam': [-6.7924, 39.2083],
  'Zanzibar':      [-6.1659, 39.1994],
  'Arusha':        [-3.3869, 36.6830],
  'Mwanza':        [-2.5164, 32.9175],
  'Moshi':         [-3.3549, 37.3392],
  'Dodoma':        [-6.1722, 35.7395],
}

// Deterministic jitter so vendors in the same city don't stack
function jitter(id: string, scale: number): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i) | 0
  }
  return ((h % 2000) / 2000 - 0.5) * scale
}

function vendorCoords(vendor: Vendor): [number, number] | null {
  const base = CITY_COORDS[vendor.city]
  if (!base) return null
  return [base[0] + jitter(vendor.id + 'lat', 0.08), base[1] + jitter(vendor.id + 'lng', 0.08)]
}

function createPriceMarker(price: string, active: boolean, hovered: boolean) {
  const bg = active ? '#C9A0DC' : hovered ? '#C9A0DC' : '#ffffff'
  const color = '#1A1A1A'
  const border = active || hovered ? '#C9A0DC' : '#d1d5db'
  const shadow = active || hovered ? '0 4px 16px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.12)'
  const scale = active || hovered ? 'scale(1.12)' : 'scale(1)'

  return L.divIcon({
    html: `<div style="
      display:inline-flex;
      align-items:center;
      background:${bg};
      border:2px solid ${border};
      border-radius:var(--opus-radius-medium);
      padding:5px 10px;
      font-size:11px;
      font-weight:700;
      color:${color};
      white-space:nowrap;
      box-shadow:${shadow};
      transform:${scale};
      transform-origin:center bottom;
      transition:all 0.15s ease;
      cursor:pointer;
      font-family:sans-serif;
    ">${price}</div>`,
    className: '',
    iconAnchor: [0, 14],
    iconSize: [0, 0],
  })
}

// Tanzania bounding box: SW -11.75,29.34 / NE -0.99,40.44
const TANZANIA_BOUNDS: [[number, number], [number, number]] = [[-11.75, 29.34], [-0.99, 40.44]]

function MapInit() {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(TANZANIA_BOUNDS, { padding: [24, 24] })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

// Fly-to helper when active vendor changes
function MapFlyTo({ coords }: { coords: [number, number] | null }) {
  const map = useMap()
  const prev = useRef<[number, number] | null>(null)
  useEffect(() => {
    if (!coords) return
    if (prev.current && prev.current[0] === coords[0] && prev.current[1] === coords[1]) return
    prev.current = coords
    map.flyTo(coords, Math.max(map.getZoom(), 10), { animate: true, duration: 0.6 })
  }, [coords, map])
  return null
}

export default function VendorsMap({
  vendors,
  activeId,
  hoveredId,
  onMarkerClick,
  onMarkerHover,
}: {
  vendors: Vendor[]
  activeId: string | null
  hoveredId: string | null
  onMarkerClick: (id: string) => void
  onMarkerHover: (id: string | null) => void
}) {
  // Fix Leaflet's broken default icon path in webpack/Next.js
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    })
  }, [])

  const activeCoords = activeId
    ? vendorCoords(vendors.find((v) => v.id === activeId) ?? vendors[0])
    : null

  return (
    <MapContainer
      center={[-6.3, 34.9]}
      zoom={7}
      minZoom={6}
      maxZoom={14}
      maxBounds={[[-12.5, 28.5], [-0.5, 41.5]]}
      maxBoundsViscosity={0.9}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={19}
      />
      <MapInit />
      <MapFlyTo coords={activeCoords} />
      <ZoomControl position="topright" />

      {vendors.map((vendor) => {
        const coords = vendorCoords(vendor)
        if (!coords) return null
        const isActive = vendor.id === activeId
        const isHovered = vendor.id === hoveredId
        const startPrice = vendor.priceRange.split('–')[0].trim()

        return (
          <Marker
            key={vendor.id}
            position={coords}
            icon={createPriceMarker(startPrice, isActive, isHovered)}
            zIndexOffset={isActive ? 1000 : isHovered ? 500 : 0}
            eventHandlers={{
              click: () => onMarkerClick(vendor.id),
              mouseover: () => onMarkerHover(vendor.id),
              mouseout: () => onMarkerHover(null),
            }}
          >
            <Popup
              maxWidth={260}
              className="vendor-map-popup"
              closeButton={false}
            >
              <Link
                href={`${VENDORS_BASE_PATH}/${vendor.slug}`}
                style={{ display: 'block', textDecoration: 'none', color: 'inherit', width: '260px' }}
              >
                {/* Image */}
                <div style={{ position: 'relative', width: '100%', height: '148px', overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={vendor.heroMedia.src}
                    alt={vendor.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {(vendor.badge || vendor.featured) && (
                    <div style={{ position: 'absolute', top: '10px', left: '10px' }}>
                      <span style={{ background: vendor.featured ? 'rgba(201,160,220,0.9)' : 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: '20px', padding: '3px 9px', fontSize: '10px', fontWeight: 700, color: '#1A1A1A', backdropFilter: 'blur(4px)' }}>
                        {vendor.featured ? 'Featured' : vendor.badge}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: '12px 14px 14px' }}>
                  <p style={{ fontWeight: 700, fontSize: '14px', margin: '0 0 2px', color: '#1A1A1A', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {vendor.name}
                  </p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 10px', fontWeight: 500 }}>
                    {vendor.category} · {vendor.city}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 1px', fontWeight: 500 }}>starting at</p>
                      <p style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A', margin: 0, lineHeight: 1 }}>
                        {vendor.priceRange.split('–')[0].trim()}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f9fafb', borderRadius: '20px', padding: '5px 10px' }}>
                      <span style={{ fontSize: '11px', color: '#F5A623' }}>★</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#1A1A1A' }}>{vendor.rating.toFixed(1)}</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>({vendor.reviewCount})</span>
                    </div>
                  </div>
                </div>
              </Link>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
