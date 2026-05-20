"""Market hours utility — exchange-aware, shared by strategy runner, orders API, and bridge.

Holidays are not accounted for; this is a best-effort guard against overnight/weekend noise.
Lunch-break markets (Tokyo, Hong Kong, China) are treated as single sessions for simplicity.
"""

from datetime import datetime, time
from zoneinfo import ZoneInfo
from dataclasses import dataclass


@dataclass(frozen=True)
class _Hours:
    timezone: str
    open: time
    close: time


_MAP: dict[str, _Hours] = {
    # US equities / options
    "NYSE":   _Hours("America/New_York",  time(9, 30),  time(16, 0)),
    "NASDAQ": _Hours("America/New_York",  time(9, 30),  time(16, 0)),
    "ARCA":   _Hours("America/New_York",  time(9, 30),  time(16, 0)),
    "AMEX":   _Hours("America/New_York",  time(9, 30),  time(16, 0)),
    "BATS":   _Hours("America/New_York",  time(9, 30),  time(16, 0)),
    "IEX":    _Hours("America/New_York",  time(9, 30),  time(16, 0)),
    "SMART":  _Hours("America/New_York",  time(9, 30),  time(16, 0)),
    "CBOE":   _Hours("America/New_York",  time(9, 30),  time(16, 0)),
    # Canada
    "TSX":    _Hours("America/Toronto",   time(9, 30),  time(16, 0)),
    "TSXV":   _Hours("America/Toronto",   time(9, 30),  time(16, 0)),
    # United Kingdom
    "LSE":    _Hours("Europe/London",     time(8, 0),   time(16, 30)),
    "IOB":    _Hours("Europe/London",     time(8, 0),   time(16, 30)),
    # Germany
    "XETRA":  _Hours("Europe/Berlin",     time(9, 0),   time(17, 30)),
    "FWB":    _Hours("Europe/Berlin",     time(9, 0),   time(17, 30)),
    # France
    "SBF":    _Hours("Europe/Paris",      time(9, 0),   time(17, 30)),
    # Netherlands
    "AEB":    _Hours("Europe/Amsterdam",  time(9, 0),   time(17, 30)),
    # Australia
    "ASX":    _Hours("Australia/Sydney",  time(10, 0),  time(16, 0)),
    # Japan (simplified: no lunch break 11:30–12:30)
    "TSEJ":   _Hours("Asia/Tokyo",        time(9, 0),   time(15, 30)),
    "OSE":    _Hours("Asia/Tokyo",        time(9, 0),   time(15, 30)),
    # Hong Kong (simplified: no lunch break 12:00–13:00)
    "SEHK":   _Hours("Asia/Hong_Kong",   time(9, 30),  time(16, 0)),
    # Singapore
    "SGX":    _Hours("Asia/Singapore",    time(9, 0),   time(17, 0)),
    # India
    "NSE":    _Hours("Asia/Kolkata",      time(9, 15),  time(15, 30)),
    "BSE":    _Hours("Asia/Kolkata",      time(9, 15),  time(15, 30)),
}

_DEFAULT = _MAP["NYSE"]


def is_market_hours(exchange: str = "NYSE") -> bool:
    """Return True if the given exchange is currently within regular trading hours (weekdays only)."""
    spec = _MAP.get(exchange.upper(), _DEFAULT)
    now_local = datetime.now(ZoneInfo(spec.timezone))
    if now_local.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    t = now_local.time().replace(second=0, microsecond=0)
    return spec.open <= t < spec.close


# Extended pre-market / after-hours windows per exchange.
# Used by is_trading_session() and the manual trade guard.
_EXTENDED: dict[str, tuple[time, time]] = {
    # US equities: 4 AM – 8 PM ET
    "NYSE":   (time(4, 0),  time(20, 0)),
    "NASDAQ": (time(4, 0),  time(20, 0)),
    "ARCA":   (time(4, 0),  time(20, 0)),
    "AMEX":   (time(4, 0),  time(20, 0)),
    "BATS":   (time(4, 0),  time(20, 0)),
    "IEX":    (time(4, 0),  time(20, 0)),
    "SMART":  (time(4, 0),  time(20, 0)),
    "CBOE":   (time(4, 0),  time(20, 0)),
    # Canada: 7 AM – 5 PM ET
    "TSX":    (time(7, 0),  time(17, 0)),
    "TSXV":   (time(7, 0),  time(17, 0)),
    # UK: 7 AM – 5:15 PM London
    "LSE":    (time(7, 0),  time(17, 15)),
    "IOB":    (time(7, 0),  time(17, 15)),
    # Germany: 8 AM – 8 PM Berlin (Xetra extended)
    "XETRA":  (time(8, 0),  time(20, 0)),
    "FWB":    (time(8, 0),  time(20, 0)),
    # France: 7:15 AM – 5:30 PM Paris
    "SBF":    (time(7, 15), time(17, 30)),
    # Netherlands: 7:15 AM – 5:30 PM Amsterdam
    "AEB":    (time(7, 15), time(17, 30)),
    # Australia: pre-open 7 AM, closing auction ends ~4:12 PM; use 7 AM – 5 PM Sydney
    "ASX":    (time(7, 0),  time(17, 0)),
    # Japan: pre-open 8 AM, night session ends 6 AM next day — cap at 4:30 PM Tokyo
    "TSEJ":   (time(8, 0),  time(16, 30)),
    "OSE":    (time(8, 0),  time(16, 30)),
    # Hong Kong: pre-open 9 AM, no significant after-hours; use 9 AM – 5 PM HKT
    "SEHK":   (time(9, 0),  time(17, 0)),
    # Singapore: pre-open 8:30 AM, after-hours 5–7 PM SGT
    "SGX":    (time(8, 30), time(19, 0)),
    # India: pre-market 9 AM, closing session ends ~4 PM IST
    "NSE":    (time(9, 0),  time(16, 0)),
    "BSE":    (time(9, 0),  time(16, 0)),
}


def is_trading_session(exchange: str = "NYSE") -> bool:
    """Return True during pre-market, regular, or after-hours — used by manual trade guards."""
    exch = exchange.upper()
    spec = _MAP.get(exch, _DEFAULT)
    now_local = datetime.now(ZoneInfo(spec.timezone))
    if now_local.weekday() >= 5:
        return False
    t = now_local.time().replace(second=0, microsecond=0)
    # Use extended window if defined, otherwise fall back to regular hours
    ext = _EXTENDED.get(exch)
    if ext:
        return ext[0] <= t < ext[1]
    return spec.open <= t < spec.close
