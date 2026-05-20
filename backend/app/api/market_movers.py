"""Market movers endpoint powered by yfinance."""

import asyncio
import math
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

import yfinance as yf
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/market", tags=["market"])

MARKETS: dict[str, dict[str, Any]] = {
    "dow30": {
        "label": "Dow Jones 30",
        "tickers": [
            "AAPL", "AMGN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX",
            "DIS", "DOW", "GS", "HD", "HON", "IBM", "JNJ", "JPM",
            "KO", "MCD", "MMM", "MRK", "MSFT", "NKE", "PG", "TRV",
            "UNH", "V", "VZ", "WMT",
        ],
    },
    "nasdaq100": {
        "label": "NASDAQ 100",
        "tickers": [
            "AAPL", "MSFT", "AMZN", "NVDA", "META", "GOOGL", "TSLA",
            "AVGO", "COST", "NFLX", "AMD", "ADBE", "CSCO", "QCOM",
            "INTC", "INTU", "TXN", "AMGN", "HON", "AMAT", "SBUX",
            "MDLZ", "ADI", "REGN", "GILD", "VRTX", "LRCX", "KLAC",
            "PANW", "SNPS", "CDNS", "PYPL", "CRWD", "MELI", "ORLY",
            "MNST", "FTNT", "ODFL", "CTAS", "BKNG", "DXCM", "BIIB",
            "CHTR", "PAYX", "IDXX", "MRNA", "PCAR", "AEP", "EXC",
        ],
    },
    "sp500": {
        "label": "S&P 500 (Top 50)",
        "tickers": [
            "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "BRK-B",
            "LLY", "TSLA", "AVGO", "JPM", "UNH", "V", "XOM", "MA",
            "JNJ", "PG", "HD", "COST", "ABBV", "MRK", "CVX", "NFLX",
            "KO", "BAC", "PEP", "CRM", "TMO", "ACN", "MCD", "CSCO",
            "ABT", "WMT", "ADBE", "DHR", "LIN", "NEE", "AMD", "TXN",
            "AMGN", "ORCL", "INTC", "PM", "HON", "UPS", "QCOM", "LOW",
            "UNP", "BA", "IBM",
        ],
    },
    "dax": {
        "label": "DAX 40",
        "tickers": [
            "ADS.DE", "AIR.DE", "ALV.DE", "BAS.DE", "BAYN.DE", "BMW.DE",
            "BNR.DE", "1COV.DE", "DB1.DE", "DBK.DE", "DHL.DE", "DTE.DE",
            "EOAN.DE", "FRE.DE", "HEI.DE", "HEN3.DE", "IFX.DE",
            "LHA.DE", "MBG.DE", "MRK.DE", "MTX.DE", "MUV2.DE",
            "PAH3.DE", "PUM.DE", "RWE.DE", "SAP.DE", "SIE.DE",
            "VOW3.DE", "ZAL.DE", "QIA.DE",
        ],
    },
    "ftse100": {
        "label": "FTSE 100",
        "tickers": [
            "HSBA.L", "BP.L", "SHEL.L", "AZN.L", "ULVR.L", "RIO.L",
            "GSK.L", "DGE.L", "BATS.L", "LLOY.L", "VOD.L", "BARC.L",
            "NWG.L", "PRU.L", "NG.L", "REL.L", "RKT.L", "AAL.L",
            "EXPN.L", "LSEG.L", "BHP.L", "IMB.L", "ABF.L", "WPP.L",
            "MNG.L", "BA.L", "HIK.L", "JD.L", "SDR.L", "AUTO.L",
        ],
    },
}

# Approximate trading days for each lookback window
_DAYS_1M = 21
_DAYS_6M = 126
_DAYS_1Y = 252

# Simple in-memory cache: {market_key: (monotonic_ts, TopMoversResponse)}
_CACHE: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 300  # 5 minutes


class Mover(BaseModel):
    ticker: str
    price: float
    change: float
    change_pct: float
    change_1m: float | None
    change_6m: float | None
    change_1y: float | None
    sparkline: list[float]
    volume: int
    market_cap: float | None


class TopMoversResponse(BaseModel):
    market: str
    label: str
    gainers: list[Mover]
    losers: list[Mover]
    as_of: str


class MarketInfo(BaseModel):
    key: str
    label: str


def _safe_float(val: Any) -> float | None:
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else f
    except (TypeError, ValueError):
        return None


def _pct_change_vs_offset(series: Any, ticker: str, offset: int) -> float | None:
    """Return % change of last close vs close `offset` rows back (or earliest available)."""
    clean = series[ticker].dropna() if ticker in series.columns else series.dropna()
    if len(clean) < 2:
        return None
    base_idx = max(0, len(clean) - 1 - offset)
    base = _safe_float(clean.iloc[base_idx])
    last = _safe_float(clean.iloc[-1])
    if base is None or last is None or base == 0:
        return None
    return round((last - base) / base * 100, 2)


def _fetch_market_cap(ticker: str) -> float | None:
    try:
        mc = yf.Ticker(ticker).fast_info.market_cap
        return _safe_float(mc)
    except Exception:
        return None


def _sparkline(series: Any, ticker: str, n: int = _DAYS_1M) -> list[float]:
    """Return last `n` daily closes for a ticker, as a list of floats."""
    col = series[ticker].dropna() if ticker in series.columns else series.dropna()
    prices = col.tail(n).tolist()
    return [round(float(p), 4) for p in prices if _safe_float(p) is not None]


def _fetch_movers(market_key: str) -> TopMoversResponse:
    mkt = MARKETS[market_key]
    tickers = mkt["tickers"]

    # One download covers day change, 1M, 6M, and 1Y — no extra calls needed
    data = yf.download(
        tickers,
        period="1y",
        interval="1d",
        auto_adjust=True,
        progress=False,
        threads=True,
    )

    empty = TopMoversResponse(
        market=market_key,
        label=mkt["label"],
        gainers=[],
        losers=[],
        as_of=datetime.now(timezone.utc).isoformat(),
    )

    if data.empty:
        return empty

    try:
        close = data["Close"]
        volume = data["Volume"]
    except KeyError:
        return empty

    close_clean = close.dropna(how="all")
    if len(close_clean) < 2:
        return empty

    last_close = close_clean.iloc[-1]
    prev_close = close_clean.iloc[-2]
    last_vol = volume.dropna(how="all").iloc[-1] if not volume.dropna(how="all").empty else None

    price_change = last_close - prev_close
    pct_change = (price_change / prev_close) * 100

    movers: list[Mover] = []
    for ticker in tickers:
        try:
            price = _safe_float(last_close.get(ticker, float("nan")))
            chg = _safe_float(price_change.get(ticker, float("nan")))
            chg_pct = _safe_float(pct_change.get(ticker, float("nan")))
            vol_raw = last_vol.get(ticker, 0) if last_vol is not None else 0
        except AttributeError:
            continue

        if price is None or chg_pct is None or chg is None:
            continue

        vol = 0
        try:
            v = float(vol_raw)
            vol = int(v) if not math.isnan(v) else 0
        except (TypeError, ValueError):
            vol = 0

        movers.append(Mover(
            ticker=ticker,
            price=round(price, 2),
            change=round(chg, 2),
            change_pct=round(chg_pct, 2),
            change_1m=None,
            change_6m=None,
            change_1y=None,
            sparkline=[],
            volume=vol,
            market_cap=None,
        ))

    movers.sort(key=lambda m: m.change_pct, reverse=True)
    top_gainers = movers[:5]
    top_losers = list(reversed(movers[-5:])) if len(movers) >= 5 else list(reversed(movers))

    # Enrich only the 10 movers that are shown (avoid computing for all ~50 tickers)
    shown = top_gainers + top_losers
    for mover in shown:
        mover.change_1m = _pct_change_vs_offset(close_clean, mover.ticker, _DAYS_1M)
        mover.change_6m = _pct_change_vs_offset(close_clean, mover.ticker, _DAYS_6M)
        mover.change_1y = _pct_change_vs_offset(close_clean, mover.ticker, _DAYS_1Y)
        mover.sparkline = _sparkline(close_clean, mover.ticker, _DAYS_1M)

    # Fetch market cap for the 10 shown tickers in parallel
    with ThreadPoolExecutor(max_workers=10) as pool:
        caps = list(pool.map(_fetch_market_cap, [m.ticker for m in shown]))
    for mover, cap in zip(shown, caps):
        mover.market_cap = cap

    as_of = close_clean.index[-1]
    as_of_str = as_of.isoformat() if hasattr(as_of, "isoformat") else str(as_of)

    return TopMoversResponse(
        market=market_key,
        label=mkt["label"],
        gainers=top_gainers,
        losers=top_losers,
        as_of=as_of_str,
    )


@router.get("/markets", response_model=list[MarketInfo], summary="List available markets")
async def list_markets() -> list[MarketInfo]:
    return [MarketInfo(key=k, label=v["label"]) for k, v in MARKETS.items()]


@router.get("/top-movers", response_model=TopMoversResponse, summary="Top gainers and losers for a market")
async def get_top_movers(
    market: str = Query(..., description="Market key (e.g. sp500, dow30, nasdaq100, dax, ftse100)"),
) -> TopMoversResponse:
    if market not in MARKETS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown market '{market}'. Options: {', '.join(MARKETS)}",
        )

    now = time.monotonic()
    cached = _CACHE.get(market)
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1]

    result = await asyncio.get_event_loop().run_in_executor(None, _fetch_movers, market)
    _CACHE[market] = (now, result)
    return result
