export interface ExchangeInfo {
  timezone: string;
  // Regular session
  openHour: number;
  openMin: number;
  closeHour: number;
  closeMin: number;
  // Extended sessions (optional)
  preMarketOpenHour?: number;
  preMarketOpenMin?: number;
  afterHoursCloseHour?: number;
  afterHoursCloseMin?: number;
  name: string;
  region: 'Americas' | 'Europe' | 'Asia-Pacific';
}

const US_ET = 'America/New_York';

export const EXCHANGE_HOURS: Record<string, ExchangeInfo> = {
  // Americas — US (IBKR pre-market 04:00–09:30, after-hours 16:00–20:00 ET)
  NYSE:   { timezone: US_ET, openHour: 9, openMin: 30, closeHour: 16, closeMin: 0, preMarketOpenHour: 4, preMarketOpenMin: 0, afterHoursCloseHour: 20, afterHoursCloseMin: 0, name: 'New York Stock Exchange',  region: 'Americas' },
  NASDAQ: { timezone: US_ET, openHour: 9, openMin: 30, closeHour: 16, closeMin: 0, preMarketOpenHour: 4, preMarketOpenMin: 0, afterHoursCloseHour: 20, afterHoursCloseMin: 0, name: 'NASDAQ',                   region: 'Americas' },
  ARCA:   { timezone: US_ET, openHour: 9, openMin: 30, closeHour: 16, closeMin: 0, preMarketOpenHour: 4, preMarketOpenMin: 0, afterHoursCloseHour: 20, afterHoursCloseMin: 0, name: 'NYSE Arca',                region: 'Americas' },
  AMEX:   { timezone: US_ET, openHour: 9, openMin: 30, closeHour: 16, closeMin: 0, preMarketOpenHour: 4, preMarketOpenMin: 0, afterHoursCloseHour: 20, afterHoursCloseMin: 0, name: 'NYSE American',            region: 'Americas' },
  BATS:   { timezone: US_ET, openHour: 9, openMin: 30, closeHour: 16, closeMin: 0, preMarketOpenHour: 4, preMarketOpenMin: 0, afterHoursCloseHour: 20, afterHoursCloseMin: 0, name: 'Cboe BZX (BATS)',          region: 'Americas' },
  IEX:    { timezone: US_ET, openHour: 9, openMin: 30, closeHour: 16, closeMin: 0, preMarketOpenHour: 4, preMarketOpenMin: 0, afterHoursCloseHour: 20, afterHoursCloseMin: 0, name: 'Investors Exchange',       region: 'Americas' },
  SMART:  { timezone: US_ET, openHour: 9, openMin: 30, closeHour: 16, closeMin: 0, preMarketOpenHour: 4, preMarketOpenMin: 0, afterHoursCloseHour: 20, afterHoursCloseMin: 0, name: 'IBKR Smart Routing (US)',  region: 'Americas' },
  CBOE:   { timezone: US_ET, openHour: 9, openMin: 30, closeHour: 16, closeMin: 0, preMarketOpenHour: 4, preMarketOpenMin: 0, afterHoursCloseHour: 20, afterHoursCloseMin: 0, name: 'Cboe Options Exchange',    region: 'Americas' },
  // Americas — Canada (TSX pre-market 07:00–09:30, after-hours 16:00–17:00 ET)
  TSX:    { timezone: 'America/Toronto', openHour: 9, openMin: 30, closeHour: 16, closeMin: 0, preMarketOpenHour: 7, preMarketOpenMin: 0, afterHoursCloseHour: 17, afterHoursCloseMin: 0, name: 'Toronto Stock Exchange', region: 'Americas' },
  TSXV:   { timezone: 'America/Toronto', openHour: 9, openMin: 30, closeHour: 16, closeMin: 0, preMarketOpenHour: 7, preMarketOpenMin: 0, afterHoursCloseHour: 17, afterHoursCloseMin: 0, name: 'TSX Venture Exchange',   region: 'Americas' },
  // Europe — London (pre-auction 07:00–08:00, closing auction ends ~16:35)
  LSE:    { timezone: 'Europe/London',    openHour: 8, openMin: 0, closeHour: 16, closeMin: 30, preMarketOpenHour: 7, preMarketOpenMin: 0, afterHoursCloseHour: 17, afterHoursCloseMin: 15, name: 'London Stock Exchange',    region: 'Europe' },
  IOB:    { timezone: 'Europe/London',    openHour: 8, openMin: 0, closeHour: 16, closeMin: 30, preMarketOpenHour: 7, preMarketOpenMin: 0, afterHoursCloseHour: 17, afterHoursCloseMin: 15, name: 'LSE Intl Order Book',      region: 'Europe' },
  // Europe — Xetra/Frankfurt (pre-trading 08:00–09:00, post-trading 17:30–20:00)
  XETRA:  { timezone: 'Europe/Berlin',    openHour: 9, openMin: 0, closeHour: 17, closeMin: 30, preMarketOpenHour: 8, preMarketOpenMin: 0, afterHoursCloseHour: 20, afterHoursCloseMin: 0, name: 'Xetra (Frankfurt)',        region: 'Europe' },
  FWB:    { timezone: 'Europe/Berlin',    openHour: 9, openMin: 0, closeHour: 17, closeMin: 30, preMarketOpenHour: 8, preMarketOpenMin: 0, afterHoursCloseHour: 20, afterHoursCloseMin: 0, name: 'Frankfurt Stock Exchange', region: 'Europe' },
  // Europe — Euronext (pre-opening 07:15–09:00, TAL session 17:30–17:40)
  SBF:    { timezone: 'Europe/Paris',     openHour: 9, openMin: 0, closeHour: 17, closeMin: 30, preMarketOpenHour: 7, preMarketOpenMin: 15, name: 'Euronext Paris',           region: 'Europe' },
  AEB:    { timezone: 'Europe/Amsterdam', openHour: 9, openMin: 0, closeHour: 17, closeMin: 30, preMarketOpenHour: 7, preMarketOpenMin: 15, name: 'Euronext Amsterdam',       region: 'Europe' },
  // Asia-Pacific — no standardised extended sessions
  ASX:    { timezone: 'Australia/Sydney', openHour: 10, openMin: 0, closeHour: 16, closeMin: 0,  name: 'Australian Securities Exch.',  region: 'Asia-Pacific' },
  TSEJ:   { timezone: 'Asia/Tokyo',       openHour: 9,  openMin: 0, closeHour: 15, closeMin: 30, name: 'Tokyo Stock Exchange',         region: 'Asia-Pacific' },
  OSE:    { timezone: 'Asia/Tokyo',       openHour: 9,  openMin: 0, closeHour: 15, closeMin: 30, name: 'Osaka Exchange',               region: 'Asia-Pacific' },
  SEHK:   { timezone: 'Asia/Hong_Kong',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0, name: 'Hong Kong Exchanges',          region: 'Asia-Pacific' },
  SGX:    { timezone: 'Asia/Singapore',   openHour: 9,  openMin: 0, closeHour: 17, closeMin: 0,  name: 'Singapore Exchange',           region: 'Asia-Pacific' },
  NSE:    { timezone: 'Asia/Kolkata',     openHour: 9,  openMin: 15, closeHour: 15, closeMin: 30, name: 'National Stock Exch. India',  region: 'Asia-Pacific' },
  BSE:    { timezone: 'Asia/Kolkata',     openHour: 9,  openMin: 15, closeHour: 15, closeMin: 30, name: 'Bombay Stock Exchange',        region: 'Asia-Pacific' },
};

const DEFAULT = EXCHANGE_HOURS['NYSE'];

export type SessionType = 'pre-market' | 'open' | 'after-hours' | 'closed';

export interface MarketStatus {
  session: SessionType;
  isOpen: boolean;   // true only during the regular session
  countdown: string;
}

function _localNow(tz: string): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
}

function _fmtMins(totalMins: number): string {
  if (totalMins <= 0) return '< 1m';
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function _minsUntilNextWeekdaySession(currentMins: number, day: number, targetMins: number): number {
  // Called when we're past the target time today (or it's a weekend).
  let nextDay = (day + 1) % 7;
  let daysAhead = 1;
  while (nextDay === 0 || nextDay === 6) { nextDay = (nextDay + 1) % 7; daysAhead++; }
  return (24 * 60 - currentMins) + (daysAhead - 1) * 24 * 60 + targetMins;
}

export function getMarketStatus(exchange: string): MarketStatus {
  const spec = EXCHANGE_HOURS[exchange.toUpperCase()] ?? DEFAULT;
  const now = _localNow(spec.timezone);
  const day = now.getDay();
  const cur = now.getHours() * 60 + now.getMinutes();
  const openMins  = spec.openHour  * 60 + spec.openMin;
  const closeMins = spec.closeHour * 60 + spec.closeMin;
  const preMins   = spec.preMarketOpenHour !== undefined ? spec.preMarketOpenHour * 60 + (spec.preMarketOpenMin ?? 0) : null;
  const ahMins    = spec.afterHoursCloseHour !== undefined ? spec.afterHoursCloseHour * 60 + (spec.afterHoursCloseMin ?? 0) : null;
  const isWeekday = day >= 1 && day <= 5;

  if (isWeekday) {
    if (cur >= openMins && cur < closeMins)
      return { session: 'open', isOpen: true, countdown: `Closes in ${_fmtMins(closeMins - cur)}` };
    if (preMins !== null && cur >= preMins && cur < openMins)
      return { session: 'pre-market', isOpen: false, countdown: `Regular opens in ${_fmtMins(openMins - cur)}` };
    if (ahMins !== null && cur >= closeMins && cur < ahMins)
      return { session: 'after-hours', isOpen: false, countdown: `Extended ends in ${_fmtMins(ahMins - cur)}` };
  }

  // Closed — count down to next session start (pre-market if defined, else regular open)
  const nextSessionMins = preMins ?? openMins;
  let minsUntil: number;
  if (isWeekday && cur < nextSessionMins) {
    minsUntil = nextSessionMins - cur;
  } else {
    minsUntil = _minsUntilNextWeekdaySession(cur, day, nextSessionMins);
  }

  const h = Math.floor(minsUntil / 60);
  const d = Math.floor(h / 24);
  const label = d > 0
    ? `Opens in ${d}d ${h % 24}h ${minsUntil % 60}m`
    : `Opens in ${_fmtMins(minsUntil)}`;

  return { session: 'closed', isOpen: false, countdown: label };
}

/** True only during the regular session — used by automated strategy guards. */
export function isMarketHours(exchange = 'NYSE'): boolean {
  const spec = EXCHANGE_HOURS[exchange.toUpperCase()] ?? DEFAULT;
  const now = _localNow(spec.timezone);
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= spec.openHour * 60 + spec.openMin && mins < spec.closeHour * 60 + spec.closeMin;
}

/** True during pre-market, regular, or after-hours — used by manual trade guards. */
export function isTradingSession(exchange = 'NYSE'): boolean {
  return getMarketStatus(exchange).session !== 'closed';
}
