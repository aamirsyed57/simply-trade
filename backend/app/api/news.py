"""Aggregated stock news endpoint powered by yfinance."""

import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import yfinance as yf
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/market", tags=["market"])

# Shown by default when the user hasn't picked a watchlist yet — a mix of
# broad-market ETFs and mega-caps so the feed isn't empty on first load.
DEFAULT_NEWS_TICKERS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA"]

MAX_TICKERS = 15

_NEWS_CACHE: dict[str, tuple[float, Any]] = {}
_NEWS_CACHE_TTL = 300  # 5 minutes — headlines don't need to be fresher than this


class NewsItem(BaseModel):
    id: str
    title: str
    summary: str | None
    publisher: str
    link: str
    published_at: str
    thumbnail: str | None
    tickers: list[str]
    content_type: str | None


def _extract_news_item(article: dict[str, Any], ticker: str) -> NewsItem | None:
    content = article.get("content") or {}
    title = content.get("title")
    if not title:
        return None

    link = (
        (content.get("canonicalUrl") or {}).get("url")
        or (content.get("clickThroughUrl") or {}).get("url")
        or ""
    )
    if not link:
        return None

    thumb = None
    thumbnail = content.get("thumbnail") or {}
    resolutions = thumbnail.get("resolutions") or []
    if resolutions:
        smallest = min(resolutions, key=lambda r: r.get("width") or 99999)
        thumb = smallest.get("url")
    elif thumbnail.get("originalUrl"):
        thumb = thumbnail["originalUrl"]

    published_at = content.get("pubDate") or content.get("displayTime") or ""
    publisher = (content.get("provider") or {}).get("displayName") or "Unknown"

    return NewsItem(
        id=str(article.get("id") or content.get("id") or link),
        title=title,
        summary=content.get("summary") or content.get("description") or None,
        publisher=publisher,
        link=link,
        published_at=published_at,
        thumbnail=thumb,
        tickers=[ticker],
        content_type=content.get("contentType"),
    )


def _fetch_ticker_news(ticker: str, limit: int) -> list[dict[str, Any]]:
    try:
        return yf.Ticker(ticker).get_news(count=limit, tab="news") or []
    except Exception:
        return []


def _fetch_news(tickers: list[str], limit_per_ticker: int) -> list[NewsItem]:
    with ThreadPoolExecutor(max_workers=min(10, len(tickers))) as pool:
        results = list(pool.map(lambda t: _fetch_ticker_news(t, limit_per_ticker), tickers))

    # Merge — the same story often surfaces for multiple related tickers, so
    # dedupe by article id and accumulate which of the requested tickers it hit.
    merged: dict[str, NewsItem] = {}
    for ticker, articles in zip(tickers, results):
        for article in articles:
            item = _extract_news_item(article, ticker)
            if item is None:
                continue
            existing = merged.get(item.id)
            if existing:
                if ticker not in existing.tickers:
                    existing.tickers.append(ticker)
            else:
                merged[item.id] = item

    items = list(merged.values())
    items.sort(key=lambda it: it.published_at, reverse=True)
    return items[:80]


@router.get(
    "/news",
    response_model=list[NewsItem],
    summary="Aggregated headlines across a set of tickers",
    description=(
        "Fetches recent news for each ticker from Yahoo Finance, dedupes stories that "
        "appear for multiple tickers, and returns them sorted by publish time (newest first)."
    ),
)
async def get_news(
    tickers: str = Query(
        ",".join(DEFAULT_NEWS_TICKERS),
        description="Comma-separated tickers, e.g. AAPL,MSFT,TSLA",
    ),
    limit_per_ticker: int = Query(8, ge=1, le=20),
) -> list[NewsItem]:
    ticker_list = sorted({t.strip().upper() for t in tickers.split(",") if t.strip()})
    if not ticker_list:
        raise HTTPException(status_code=400, detail="At least one ticker is required")
    if len(ticker_list) > MAX_TICKERS:
        raise HTTPException(status_code=400, detail=f"Max {MAX_TICKERS} tickers per request")

    cache_key = f"{','.join(ticker_list)}:{limit_per_ticker}"
    now = time.monotonic()
    cached = _NEWS_CACHE.get(cache_key)
    if cached and now - cached[0] < _NEWS_CACHE_TTL:
        return cached[1]

    result = await asyncio.get_event_loop().run_in_executor(None, _fetch_news, ticker_list, limit_per_ticker)
    _NEWS_CACHE[cache_key] = (now, result)
    return result
