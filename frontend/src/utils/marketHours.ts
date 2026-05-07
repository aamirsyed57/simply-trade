export interface ExchangeInfo {
  timezone: string;
  openHour: number;
  openMin: number;
  closeHour: number;
  closeMin: number;
  name: string;
  region: 'Americas' | 'Europe' | 'Asia-Pacific';
}

export const EXCHANGE_HOURS: Record<string, ExchangeInfo> = {
  // Americas
  NYSE:   { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  name: 'New York Stock Exchange',  region: 'Americas' },
  NASDAQ: { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  name: 'NASDAQ',                   region: 'Americas' },
  ARCA:   { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  name: 'NYSE Arca',                region: 'Americas' },
  AMEX:   { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  name: 'NYSE American',            region: 'Americas' },
  BATS:   { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  name: 'Cboe BZX (BATS)',          region: 'Americas' },
  IEX:    { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  name: 'Investors Exchange',       region: 'Americas' },
  SMART:  { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  name: 'IBKR Smart Routing (US)',  region: 'Americas' },
  CBOE:   { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  name: 'Cboe Options Exchange',    region: 'Americas' },
  TSX:    { timezone: 'America/Toronto',   openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  name: 'Toronto Stock Exchange',   region: 'Americas' },
  TSXV:   { timezone: 'America/Toronto',   openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  name: 'TSX Venture Exchange',     region: 'Americas' },
  // Europe
  LSE:    { timezone: 'Europe/London',     openHour: 8,  openMin: 0,  closeHour: 16, closeMin: 30, name: 'London Stock Exchange',    region: 'Europe' },
  IOB:    { timezone: 'Europe/London',     openHour: 8,  openMin: 0,  closeHour: 16, closeMin: 30, name: 'LSE Intl Order Book',      region: 'Europe' },
  XETRA:  { timezone: 'Europe/Berlin',     openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, name: 'Xetra (Frankfurt)',        region: 'Europe' },
  FWB:    { timezone: 'Europe/Berlin',     openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, name: 'Frankfurt Stock Exchange', region: 'Europe' },
  SBF:    { timezone: 'Europe/Paris',      openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, name: 'Euronext Paris',           region: 'Europe' },
  AEB:    { timezone: 'Europe/Amsterdam',  openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, name: 'Euronext Amsterdam',       region: 'Europe' },
  // Asia-Pacific
  ASX:    { timezone: 'Australia/Sydney',  openHour: 10, openMin: 0,  closeHour: 16, closeMin: 0,  name: 'Australian Securities Exch.', region: 'Asia-Pacific' },
  TSEJ:   { timezone: 'Asia/Tokyo',        openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30, name: 'Tokyo Stock Exchange',     region: 'Asia-Pacific' },
  OSE:    { timezone: 'Asia/Tokyo',        openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30, name: 'Osaka Exchange',           region: 'Asia-Pacific' },
  SEHK:   { timezone: 'Asia/Hong_Kong',   openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  name: 'Hong Kong Exchanges',      region: 'Asia-Pacific' },
  SGX:    { timezone: 'Asia/Singapore',    openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 0,  name: 'Singapore Exchange',       region: 'Asia-Pacific' },
  NSE:    { timezone: 'Asia/Kolkata',      openHour: 9,  openMin: 15, closeHour: 15, closeMin: 30, name: 'National Stock Exch. India', region: 'Asia-Pacific' },
  BSE:    { timezone: 'Asia/Kolkata',      openHour: 9,  openMin: 15, closeHour: 15, closeMin: 30, name: 'Bombay Stock Exchange',    region: 'Asia-Pacific' },
};

const DEFAULT = EXCHANGE_HOURS['NYSE'];

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

export interface MarketStatus {
  isOpen: boolean;
  countdown: string; // "Closes in 2h 14m" | "Opens in 45m" | "Opens in 2d 1h 30m"
}

export function getMarketStatus(exchange: string): MarketStatus {
  const spec = EXCHANGE_HOURS[exchange.toUpperCase()] ?? DEFAULT;
  const now = _localNow(spec.timezone);
  const day = now.getDay();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const openMins = spec.openHour * 60 + spec.openMin;
  const closeMins = spec.closeHour * 60 + spec.closeMin;
  const isWeekday = day >= 1 && day <= 5;

  if (isWeekday && currentMins >= openMins && currentMins < closeMins) {
    return { isOpen: true, countdown: `Closes in ${_fmtMins(closeMins - currentMins)}` };
  }

  // Calculate minutes until next weekday open
  let daysAhead = 0;
  if (isWeekday && currentMins < openMins) {
    daysAhead = 0;
  } else {
    let nextDay = (day + 1) % 7;
    daysAhead = 1;
    while (nextDay === 0 || nextDay === 6) { nextDay = (nextDay + 1) % 7; daysAhead++; }
  }

  const minsUntilOpen = daysAhead === 0
    ? openMins - currentMins
    : (24 * 60 - currentMins) + (daysAhead - 1) * 24 * 60 + openMins;

  const h = Math.floor(minsUntilOpen / 60);
  const d = Math.floor(h / 24);
  const remH = h % 24;
  const remM = minsUntilOpen % 60;
  const label = d > 0
    ? `Opens in ${d}d ${remH}h ${remM}m`
    : `Opens in ${_fmtMins(minsUntilOpen)}`;

  return { isOpen: false, countdown: label };
}

export function isMarketHours(exchange = 'NYSE'): boolean {
  const spec = EXCHANGE_HOURS[exchange.toUpperCase()] ?? DEFAULT;
  const now = _localNow(spec.timezone);
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= spec.openHour * 60 + spec.openMin && mins < spec.closeHour * 60 + spec.closeMin;
}
