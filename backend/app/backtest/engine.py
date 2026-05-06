"""Backtest engine — replays historical bars through a strategy."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.backtest.metrics import compute_metrics, compute_per_symbol_metrics
from app.models.backtest import Backtest, BacktestResult, BacktestStatus, FillModel
from app.models.historical_bar import HistoricalBar
from app.models.symbol import Symbol
from app.strategies import STRATEGY_REGISTRY
from app.strategies.clocks import SimulatedClock
from app.strategies.context import ExecutionContext
from app.strategies.data_sources import ReplayDataSource
from app.strategies.routers import SimulatedRouter

logger = logging.getLogger(__name__)

COMMISSION_PER_SHARE = Decimal("0.005")
MIN_COMMISSION = Decimal("1.00")


def _calc_commission(qty: Decimal, price: Decimal) -> Decimal:
    """IBKR tiered approximation."""
    commission = qty * COMMISSION_PER_SHARE
    return max(commission, MIN_COMMISSION)


class BacktestEngine:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def run(self, backtest_id: int) -> BacktestResult:
        backtest = await self.db.get(Backtest, backtest_id)
        if not backtest:
            raise ValueError(f"Backtest {backtest_id} not found")

        backtest.status = BacktestStatus.RUNNING
        backtest.started_at = datetime.now(timezone.utc)
        await self.db.flush()

        try:
            result = await self._execute(backtest)
            backtest.status = BacktestStatus.COMPLETED
            backtest.finished_at = datetime.now(timezone.utc)
            return result
        except Exception as e:
            backtest.status = BacktestStatus.FAILED
            backtest.error_message = str(e)
            backtest.finished_at = datetime.now(timezone.utc)
            logger.error(f"Backtest {backtest_id} failed: {e}")
            raise

    async def _execute(self, backtest: Backtest) -> BacktestResult:
        strategy_cls = STRATEGY_REGISTRY.get(backtest.strategy_code)
        if not strategy_cls:
            raise ValueError(f"Strategy '{backtest.strategy_code}' not found in registry")

        params = strategy_cls.ParamsModel().model_dump()
        params.update(backtest.params or {})
        strategy = strategy_cls(params=params)

        # Load symbols
        symbol_ids: list[int] = backtest.symbol_ids
        symbols: dict[int, Symbol] = {}
        for sid in symbol_ids:
            sym = await self.db.get(Symbol, sid)
            if sym:
                symbols[sid] = sym

        # Load all bars sorted by timestamp for all symbols
        start_dt = datetime.combine(backtest.start_date, datetime.min.time()).replace(tzinfo=timezone.utc)
        end_dt = datetime.combine(backtest.end_date, datetime.max.time()).replace(tzinfo=timezone.utc)

        bars_result = await self.db.execute(
            select(HistoricalBar)
            .where(
                HistoricalBar.symbol_id.in_(symbol_ids),
                HistoricalBar.timeframe == backtest.timeframe,
                HistoricalBar.ts >= start_dt,
                HistoricalBar.ts <= end_dt,
            )
            .order_by(HistoricalBar.ts.asc())
        )
        all_bars = bars_result.scalars().all()

        if not all_bars:
            raise ValueError(
                f"No historical bars found for symbols={symbol_ids}, "
                f"timeframe={backtest.timeframe}, {start_dt}–{end_dt}"
            )

        # Group bars by timestamp so we can iterate in chronological order
        from collections import defaultdict
        bars_by_ts: dict[datetime, list[HistoricalBar]] = defaultdict(list)
        for bar in all_bars:
            bars_by_ts[bar.ts].append(bar)

        sorted_timestamps = sorted(bars_by_ts.keys())

        # Setup
        clock = SimulatedClock(sorted_timestamps[0])
        router = SimulatedRouter()
        initial_capital = float(backtest.initial_capital)

        cash = initial_capital
        positions: dict[int, dict] = {}  # symbol_id → {qty, avg_price}

        equity_curve = []
        trade_log = []

        # Pending signal for "next bar open" fill
        pending_signals: list[dict] = []

        for i, ts in enumerate(sorted_timestamps):
            clock.advance_to(ts)
            bars_at_ts = bars_by_ts[ts]

            # --- Fill pending orders at this bar's open ---
            new_pending = []
            for sig in pending_signals:
                sid = sig["symbol_id"]
                matching_bars = [b for b in bars_at_ts if b.symbol_id == sid]
                if not matching_bars:
                    new_pending.append(sig)
                    continue

                bar = matching_bars[0]
                fill_price = _get_fill_price(bar, backtest.fill_model)
                qty = Decimal(str(sig["qty"]))
                fill_price_d = Decimal(str(fill_price))
                notional = qty * fill_price_d
                slippage = notional * Decimal(str(backtest.slippage_bps)) / Decimal("10000")
                commission = _calc_commission(qty, fill_price_d)

                if sig["direction"] == "BUY":
                    total_cost = notional + slippage + commission
                    if cash < float(total_cost):
                        logger.debug(f"Insufficient cash for BUY {sid}, skipping")
                        continue
                    cash -= float(total_cost)
                    pos = positions.setdefault(sid, {"qty": Decimal("0"), "avg_price": Decimal("0")})
                    total_pos_cost = pos["qty"] * pos["avg_price"] + notional
                    pos["qty"] += qty
                    pos["avg_price"] = total_pos_cost / pos["qty"] if pos["qty"] > 0 else Decimal("0")
                else:  # SELL
                    pos = positions.get(sid)
                    if not pos or pos["qty"] <= 0:
                        continue
                    sell_qty = min(qty, pos["qty"])
                    realized_pnl = sell_qty * (fill_price_d - pos["avg_price"]) - slippage - commission
                    cash += float(sell_qty * fill_price_d - slippage - commission)
                    pos["qty"] -= sell_qty
                    if pos["qty"] == 0:
                        pos["avg_price"] = Decimal("0")

                    trade_log.append({
                        "symbol_id": sid,
                        "direction": sig["direction"],
                        "qty": float(sell_qty),
                        "entry_price": float(pos["avg_price"]),
                        "exit_price": fill_price,
                        "pnl": float(realized_pnl),
                        "commission": float(commission),
                        "exit_ts": ts.isoformat(),
                        "entry_ts": sig.get("entry_ts", ts.isoformat()),
                    })

            pending_signals = new_pending

            # --- Compute equity ---
            unrealized = 0.0
            for sid, pos in positions.items():
                if pos["qty"] > 0:
                    bar_list = [b for b in bars_at_ts if b.symbol_id == sid]
                    if bar_list:
                        unrealized += float(pos["qty"] * Decimal(str(bar_list[0].close)))

            in_position = any(p["qty"] > 0 for p in positions.values())
            equity_curve.append({
                "ts": ts.isoformat(),
                "equity": round(cash + unrealized, 4),
                "in_position": in_position,
            })

            # --- Generate signals ---
            for sid in symbol_ids:
                ctx = ExecutionContext(
                    clock=clock,
                    data=ReplayDataSource(self.db),
                    router=router,
                    portfolio_id=None,
                    mode="backtest",
                )
                try:
                    signal = await strategy.generate_signal(sid, ctx)
                    if signal:
                        pending_signals.append({
                            "symbol_id": sid,
                            "direction": signal.direction,
                            "qty": signal.qty,
                            "order_type": signal.order_type,
                            "limit_price": signal.limit_price,
                            "entry_ts": ts.isoformat(),
                        })
                except Exception as e:
                    logger.debug(f"Signal generation error at {ts}: {e}")

        # Compute metrics
        metrics = compute_metrics(equity_curve, trade_log, initial_capital)
        per_symbol = compute_per_symbol_metrics(trade_log)

        # Build drawdown curve
        drawdown_curve = _build_drawdown_curve(equity_curve)

        # Persist result
        existing = await self.db.execute(
            select(BacktestResult).where(BacktestResult.backtest_id == backtest.id)
        )
        bt_result = existing.scalars().first()
        if not bt_result:
            bt_result = BacktestResult(backtest_id=backtest.id)
            self.db.add(bt_result)

        bt_result.equity_curve = equity_curve
        bt_result.drawdown_curve = drawdown_curve
        bt_result.trades = trade_log
        bt_result.metrics = metrics
        bt_result.per_symbol_metrics = {str(k): v for k, v in per_symbol.items()}

        await self.db.flush()
        logger.info(
            f"Backtest {backtest.id} complete: {len(trade_log)} trades, "
            f"final equity={metrics.get('final_equity')}"
        )
        return bt_result


def _get_fill_price(bar: HistoricalBar, fill_model: FillModel) -> float:
    if fill_model == FillModel.BAR_CLOSE:
        return float(bar.close)
    elif fill_model == FillModel.MIDPOINT:
        return float((bar.high + bar.low) / 2)
    else:  # NEXT_BAR_OPEN default
        return float(bar.open)


def _build_drawdown_curve(equity_curve: list[dict]) -> list[dict]:
    peak = equity_curve[0]["equity"] if equity_curve else 1.0
    result = []
    for row in equity_curve:
        peak = max(peak, row["equity"])
        dd = (peak - row["equity"]) / peak if peak > 0 else 0.0
        result.append({"ts": row["ts"], "drawdown": round(dd * 100, 4)})
    return result
