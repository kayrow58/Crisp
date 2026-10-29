// A Crisp "day" runs 3:00 AM → 2:59 AM in the person's own time zone (spec §7).

export const DAY_CUTOFF_HOURS = 3

/** YYYY-MM-DD for the given instant in the given IANA time zone, applying the 3 AM cutoff. */
export function dayKey(at: Date = new Date(), timeZone?: string): string {
  const shifted = new Date(at.getTime() - DAY_CUTOFF_HOURS * 3600_000)
  return ymdInZone(shifted, timeZone)
}

export function ymdInZone(at: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Hour (0–23) of the instant in the given time zone. */
export function hourInZone(at: Date, timeZone?: string): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(at)
  return Number(h) % 24
}

/** Add days to a YYYY-MM-DD key (calendar math, time-zone free). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400_000)
}

/** 0 = Sunday … 6 = Saturday for a YYYY-MM-DD key */
export function weekday(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function monthKey(at: Date = new Date()): string {
  return at.toISOString().slice(0, 7)
}
