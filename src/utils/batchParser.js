/**
 * Parses batch number in YY-JJJ format (Julian Date).
 * YY: last two digits of the year.
 * JJJ: Day of the year (1-365, or 1-366 for leap years).
 * 
 * Returns an object: { valid: boolean, date: string (YYYY-MM-DD) }
 */
export function parseBatchNumber(number) {
  const match = String(number || '').trim().match(/^(\d{2})-(\d{3})$/)
  if (!match) return { valid: false, date: '' }
  const year = 2000 + Number(match[1])
  const dayOfYear = Number(match[2])
  const maxDay = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365
  if (dayOfYear < 1 || dayOfYear > maxDay) return { valid: false, date: '' }
  
  const date = new Date(Date.UTC(year, 0, dayOfYear))
  return { valid: true, date: date.toISOString().slice(0, 10) }
}
