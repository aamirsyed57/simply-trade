"""Backtest metrics computation."""

from __future__ import annotations

import math
from typing import Any


def _safe_div(a: float, b: float, default: float = 0.0) -> float:
    return a / b if b != 0 else default


# Trading bars per year per timeframe (approximate).
# Used to annualise per-bar return statistics correctly.
_BARS_PER_YEAR: dict[str, float] = {
    "1m":  390 * 252,   # 98,280
    "5m":  78 * 252,    # 19,656
    "15m": 26 * 252,    # 6,552
    "1h":  6.5 * 252,   # 1,638
    "1d":  252.0,
}


def compute_metrics(
    equity_curve: list[dict[str, Any]],
    trades: list[dict[str, Any]],
    initial_capital: float,
    risk_free_rate: float = 0.05,
    timeframe: str = "1d",
) -> dict[str, Any]:
    """
    Compute standard backtesting metrics.

    Args:
        equity_curve: list of {"ts": str, "equity": float}
        trades: list of {"entry_ts", "exit_ts", "symbol_id", "direction", "qty",
                         "entry_price", "exit_price", "pnl", "commission"}
        initial_capital: starting capital
        risk_free_rate: annualised risk-free rate (default 5%)
        timeframe: bar timeframe used in the backtest (drives annualisation)
    """
    if not equity_curve:
        return {}

    equities = [row["equity"] for row in equity_curve]
    final_equity = equities[-1]

    bars_per_year = _BARS_PER_YEAR.get(timeframe, 252.0)

    # --- CAGR ---
    n_bars = len(equities)
    years = n_bars / bars_per_year if n_bars > 1 else 1.0
    cagr = (_safe_div(final_equity, initial_capital) ** _safe_div(1.0, years) - 1.0) if years > 0 else 0.0

    # --- Per-bar returns ---
    returns = [
        _safe_div(equities[i] - equities[i - 1], equities[i - 1])
        for i in range(1, len(equities))
    ]

    n = len(returns)
    mean_ret = sum(returns) / n if n > 0 else 0.0

    ann_return = mean_ret * bars_per_year

    variance = sum((r - mean_ret) ** 2 for r in returns) / n if n > 0 else 0.0
    std_ret = math.sqrt(variance)
    ann_std = std_ret * math.sqrt(bars_per_year)

    # --- Sharpe ---
    bar_rfr = risk_free_rate / bars_per_year
    sharpe = _safe_div(ann_return - risk_free_rate, ann_std)

    # --- Sortino ---
    downside_returns = [r for r in returns if r < bar_rfr]
    downside_var = sum((r - bar_rfr) ** 2 for r in downside_returns) / n if n > 0 else 0.0
    downside_std = math.sqrt(downside_var)
    ann_downside_std = downside_std * math.sqrt(bars_per_year)
    sortino = _safe_div(ann_return - risk_free_rate, ann_downside_std)

    # --- Max Drawdown & Calmar ---
    peak = equities[0]
    max_dd = 0.0
    for eq in equities:
        peak = max(peak, eq)
        dd = _safe_div(peak - eq, peak)
        max_dd = max(max_dd, dd)

    calmar = _safe_div(cagr, max_dd)

    # --- Trade-level stats ---
    if trades:
        pnls = [t["pnl"] for t in trades]
        winners = [p for p in pnls if p > 0]
        losers = [p for p in pnls if p <= 0]

        win_rate = _safe_div(len(winners), len(pnls))
        gross_profit = sum(winners)
        gross_loss = abs(sum(losers)) if losers else 0.0
        profit_factor = (
            None if (gross_loss == 0.0 and gross_profit > 0)
            else _safe_div(gross_profit, gross_loss)
        )
        avg_winner = _safe_div(sum(winners), len(winners)) if winners else 0.0
        avg_loser = _safe_div(sum(losers), len(losers)) if losers else 0.0
        expectancy = win_rate * avg_winner + (1 - win_rate) * avg_loser

        # Average holding period — in bars (estimated by examining trade log order)
        total_pnl = sum(pnls)
        n_trades = len(pnls)
    else:
        win_rate = expectancy = 0.0
        profit_factor = None
        total_pnl = n_trades = 0

    # --- Exposure % ---
    # Ratio of bars where a position was open vs total bars
    bars_with_position = sum(1 for row in equity_curve if row.get("in_position", False))
    exposure_pct = _safe_div(bars_with_position, n_bars) * 100

    return {
        "cagr": round(cagr * 100, 4),            # %
        "sharpe": round(sharpe, 4),
        "sortino": round(sortino, 4),
        "calmar": round(calmar, 4),
        "max_drawdown": round(max_dd * 100, 4),   # %
        "win_rate": round(win_rate * 100, 4),      # %
        "profit_factor": round(profit_factor, 4),
        "expectancy": round(expectancy, 4),
        "total_pnl": round(total_pnl, 4),
        "n_trades": n_trades,
        "initial_capital": initial_capital,
        "final_equity": round(final_equity, 4),
        "exposure_pct": round(exposure_pct, 4),
    }


def compute_per_symbol_metrics(
    trades: list[dict[str, Any]],
) -> dict[int, dict[str, Any]]:
    """Group trades by symbol_id and compute per-symbol metrics."""
    by_symbol: dict[int, list[dict]] = {}
    for t in trades:
        sid = t.get("symbol_id")
        by_symbol.setdefault(sid, []).append(t)

    result = {}
    for sid, sym_trades in by_symbol.items():
        pnls = [t["pnl"] for t in sym_trades]
        winners = [p for p in pnls if p > 0]
        losers = [p for p in pnls if p <= 0]
        result[sid] = {
            "n_trades": len(pnls),
            "total_pnl": round(sum(pnls), 4),
            "win_rate": round(_safe_div(len(winners), len(pnls)) * 100, 4),
            "avg_pnl": round(_safe_div(sum(pnls), len(pnls)), 4),
        }
    return result
