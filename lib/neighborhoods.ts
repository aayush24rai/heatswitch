/**
 * Boston zip → neighborhood name, for friendlier labels in the Buildings tab.
 *
 * Only well-known Boston neighborhood zips are listed. A zip NOT in this map is
 * "uncertain" — callers should fall back to showing just the zip. Pure data +
 * a tiny lookup; no I/O.
 * Source: USPS ZIP lookup + City of Boston neighborhood guides.
 */
export const NEIGHBORHOODS: Record<string, string> = {
  "02108": "Beacon Hill",
  "02109": "North End",
  "02110": "Financial District",
  "02111": "Chinatown",
  "02113": "North End",
  "02114": "West End",
  "02115": "Fenway",
  "02116": "Back Bay",
  "02118": "South End",
  "02119": "Roxbury",
  "02120": "Mission Hill",
  "02121": "Dorchester",
  "02122": "Dorchester",
  "02124": "Dorchester",
  "02125": "Dorchester",
  "02126": "Mattapan",
  "02127": "South Boston",
  "02128": "East Boston",
  "02129": "Charlestown",
  "02130": "Jamaica Plain",
  "02131": "Roslindale",
  "02132": "West Roxbury",
  "02134": "Allston",
  "02135": "Brighton",
  "02136": "Hyde Park",
  "02151": "Revere",
  "02152": "Winthrop",
  "02163": "Allston",
  "02199": "Back Bay",
  "02210": "Seaport",
  "02215": "Fenway",
  "02467": "Chestnut Hill",
}

/** Neighborhood name for a zip, or null when it is not a known one. */
export function neighborhoodFor(zip: string): string | null {
  return NEIGHBORHOODS[zip] ?? null
}

/** Label for a zip: "02125 · Dorchester" when known, else just "02125". */
export function zipLabel(zip: string): string {
  const n = neighborhoodFor(zip)
  return n ? `${zip} · ${n}` : zip
}
