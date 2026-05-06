interface ExchangeHours {
  timezone: string;
  openHour: number;
  openMin: number;
  closeHour: number;
  closeMin: number;
}

const EXCHANGE_HOURS: Record<string, ExchangeHours> = {
  // US equities / options
  NYSE:   { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0 },
  NASDAQ: { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0 },
  ARCA:   { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0 },
  AMEX:   { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0 },
  BATS:   { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0 },
  IEX:    { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0 },
  SMART:  { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0 },
  CBOE:   { timezone: 'America/New_York',  openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0 },
  // Canada
  TSX:    { timezone: 'America/Toronto',   openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0 },
  TSXV:   { timezone: 'America/Toronto',   openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0 },
  // United Kingdom
  LSE:    { timezone: 'Europe/London',     openHour: 8,  openMin: 0,  closeHour: 16, closeMin: 30 },
  IOB:    { timezone: 'Europe/London',     openHour: 8,  openMin: 0,  closeHour: 16, closeMin: 30 },
  // Germany
  XETRA:  { timezone: 'Europe/Berlin',     openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30 },
  FWB:    { timezone: 'Europe/Berlin',     openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30 },
  // France
  SBF:    { timezone: 'Europe/Paris',      openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30 },
  // Netherlands
  AEB:    { timezone: 'Europe/Amsterdam',  openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30 },
  // Australia
  ASX:    { timezone: 'Australia/Sydney',  openHour: 10, openMin: 0,  closeHour: 16, closeMin: 0 },
  // Japan (simplified: no lunch break 11:30–12:30)
  TSEJ:   { timezone: 'Asia/Tokyo',        openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30 },
  OSE:    { timezone: 'Asia/Tokyo',        openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30 },
  // Hong Kong (simplified: no lunch break 12:00–13:00)
  SEHK:   { timezone: 'Asia/Hong_Kong',   openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0 },
  // Singapore
  SGX:    { timezone: 'Asia/Singapore',    openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 0 },
  // India
  NSE:    { timezone: 'Asia/Kolkata',      openHour: 9,  openMin: 15, closeHour: 15, closeMin: 30 },
  BSE:    { timezone: 'Asia/Kolkata',      openHour: 9,  openMin: 15, closeHour: 15, closeMin: 30 },
};

const DEFAULT = EXCHANGE_HOURS['NYSE'];

export function isMarketHours(exchange = 'NYSE'): boolean {
  const spec = EXCHANGE_HOURS[exchange.toUpperCase()] ?? DEFAULT;
  const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: spec.timezone }));
  const day = localNow.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const mins = localNow.getHours() * 60 + localNow.getMinutes();
  return mins >= spec.openHour * 60 + spec.openMin && mins < spec.closeHour * 60 + spec.closeMin;
}
