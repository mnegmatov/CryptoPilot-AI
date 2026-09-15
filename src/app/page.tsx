"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { BacktestView } from "@/components/backtest/BacktestView";
import { Header } from "@/components/layout/Header";
import { PaperTradingView } from "@/components/paper/PaperTradingView";
import { CommandPalette } from "@/components/terminal/CommandPalette";
import { SignalDossier } from "@/components/terminal/SignalDossier";
import { TradingViewChart } from "@/components/terminal/TradingViewChart";
import { Watchlist } from "@/components/terminal/Watchlist";
import { WatchlistAsset } from "@/core/data/market-feed";
import { Candle, MarketContextData, Timeframe, TradingSignal } from "@/core/types";

export default function TerminalPage() {
  const [activeTab, setActiveTab] = useState<"terminal" | "backtest" | "paper">("terminal");
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [mobileSection, setMobileSection] = useState<"chart" | "watchlist" | "signal">("chart");

  const [watchlist, setWatchlist] = useState<WatchlistAsset[]>([]);
  const [marketContext, setMarketContext] = useState<MarketContextData | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [isWatchlistStale, setIsWatchlistStale] = useState(false);
  const [lastMarketUpdate, setLastMarketUpdate] = useState<number | null>(null);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [loadingCandles, setLoadingCandles] = useState(true);
  const [candlesError, setCandlesError] = useState<string | null>(null);

  const [signal, setSignal] = useState<TradingSignal | null>(null);
  const [loadingSignal, setLoadingSignal] = useState(true);
  const [signalError, setSignalError] = useState<string | null>(null);

  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // 1. Fetch Watchlist & Market Context
  const fetchMarketOverview = async () => {
    try {
      const res = await fetch("/api/market");
      const data = await res.json();
      if (data.success && Array.isArray(data.watchlist) && data.watchlist.length > 0) {
        setWatchlist(data.watchlist);
        if (data.context) {
          setMarketContext(data.context);
        }
        setIsWatchlistStale(false);
        setWatchlistError(null);
        setLastMarketUpdate(Date.now());
      } else {
        const errorMsg = data.error || "Не удалось загрузить рыночные данные";
        setWatchlistError(errorMsg);
        setWatchlist((prev) => {
          if (prev.length > 0) {
            setIsWatchlistStale(true);
          }
          return prev;
        });
      }
    } catch (err: any) {
      console.error("Market overview error:", err);
      const errorMsg = err.message || "Ошибка подключения к рыночному шлюзу";
      setWatchlistError(errorMsg);
      setWatchlist((prev) => {
        if (prev.length > 0) {
          setIsWatchlistStale(true);
        }
        return prev;
      });
    } finally {
      setLoadingMarket(false);
    }
  };

  useEffect(() => {
    fetchMarketOverview();
    const interval = setInterval(fetchMarketOverview, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, []);

  // 2. Fetch Candlesticks
  const fetchCandles = async (symbol: string, tf: Timeframe) => {
    setLoadingCandles(true);
    setCandlesError(null);
    try {
      const res = await fetch(`/api/candles?symbol=${symbol}&timeframe=${tf}&limit=180`);
      const data = await res.json();
      if (data.success && Array.isArray(data.candles) && data.candles.length > 0) {
        setCandles(data.candles);
        setCandlesError(null);

        // Update paper trading live prices
        const latestPrice = data.candles[data.candles.length - 1].close;
        fetch("/api/paper", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "UPDATE_PRICE",
            symbol,
            price: latestPrice,
          }),
        }).catch(() => {});
      } else {
        setCandlesError(data.error || "Не удалось загрузить свечные котировки");
      }
    } catch (err: any) {
      console.error("Candles fetch error:", err);
      setCandlesError(err.message || "Сетевая ошибка при получении свечей");
    } finally {
      setLoadingCandles(false);
    }
  };

  // Real-time WebSocket streaming subscription for sub-second updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let isMounted = true;

    try {
      const formatted = selectedSymbol.toLowerCase().replace(/[^a-z0-9]/g, "");
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${formatted}@kline_1h`);

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const message = JSON.parse(event.data);
          if (message && message.k) {
            const kline = message.k;
            const currentPrice = parseFloat(kline.c);

            // Notify paper trading engine with tick price
            fetch("/api/paper", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "UPDATE_PRICE",
                symbol: selectedSymbol,
                price: currentPrice,
              }),
            }).catch(() => {});
          }
        } catch (e) {
          // Ignore parse errors
        }
      };
    } catch (e) {
      // Graceful fallback to REST polling
    }

    return () => {
      isMounted = false;
      if (ws) {
        ws.close();
      }
    };
  }, [selectedSymbol]);

  // 3. Fetch Signal & AI Thesis
  const fetchSignal = async (symbol: string) => {
    setLoadingSignal(true);
    setSignalError(null);
    try {
      const res = await fetch(`/api/signal?symbol=${symbol}`);
      const data = await res.json();
      if (data.success && data.signal) {
        setSignal(data.signal);
        setSignalError(null);
      } else {
        setSignalError(data.error || "Не удалось рассчитать количественный сетап");
      }
    } catch (err: any) {
      console.error("Signal fetch error:", err);
      setSignalError(err.message || "Ошибка соединения с генератором сигналов");
    } finally {
      setLoadingSignal(false);
    }
  };

  useEffect(() => {
    fetchCandles(selectedSymbol, timeframe);
    fetchSignal(selectedSymbol);
  }, [selectedSymbol, timeframe]);

  const handleSelectSymbol = (symbol: string) => {
    setSelectedSymbol(symbol);
    setMobileSection("chart"); // Auto-switch to chart on mobile
  };

  // Handle Deploying Paper Trade
  const handleDeployPaperTrade = async (riskPct: number, orderType: "MARKET" | "LIMIT") => {
    if (!signal) return;

    try {
      const res = await fetch("/api/paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "OPEN",
          signal,
          riskPercentage: riskPct,
          orderType,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(
          `Симулированный ордер открыт: ${signal.asset} по $${data.position.entryPrice.toLocaleString()} (риск ${riskPct}%).`
        );
        setActiveTab("paper");
      } else {
        toast.error(data.error || "Не удалось открыть демо-позицию.");
      }
    } catch (err: any) {
      toast.error(err.message || "Ошибка отправки демо-ордера");
    }
  };

  return (
    <div className="min-h-screen bg-[#080B10] flex flex-col font-sans">
      {/* Top Global Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        context={marketContext}
        onOpenSearch={() => setIsSearchOpen(true)}
      />

      {/* Main View Router */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === "terminal" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Mobile Navigation Segmented Switcher (Visible only < 1024px) */}
            <div className="flex lg:hidden bg-[#0A0E17] border-b border-[#1E2638] p-2 gap-1.5 shrink-0 z-10">
              <button
                type="button"
                onClick={() => setMobileSection("chart")}
                className={`flex-1 py-2 px-3 min-h-[44px] rounded-lg text-xs font-semibold font-mono flex items-center justify-center transition-colors ${
                  mobileSection === "chart"
                    ? "bg-[#1E2638] text-sky-400 border border-sky-500/30 shadow-sm"
                    : "text-[#7B849B] hover:text-[#E2E8F0] hover:bg-[#141A29]"
                }`}
              >
                График
              </button>
              <button
                type="button"
                onClick={() => setMobileSection("watchlist")}
                className={`flex-1 py-2 px-3 min-h-[44px] rounded-lg text-xs font-semibold font-mono flex items-center justify-center transition-colors ${
                  mobileSection === "watchlist"
                    ? "bg-[#1E2638] text-sky-400 border border-sky-500/30 shadow-sm"
                    : "text-[#7B849B] hover:text-[#E2E8F0] hover:bg-[#141A29]"
                }`}
              >
                Пары {watchlist.length > 0 ? `(${watchlist.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setMobileSection("signal")}
                className={`flex-1 py-2 px-3 min-h-[44px] rounded-lg text-xs font-semibold font-mono flex items-center justify-center transition-colors ${
                  mobileSection === "signal"
                    ? "bg-[#1E2638] text-sky-400 border border-sky-500/30 shadow-sm"
                    : "text-[#7B849B] hover:text-[#E2E8F0] hover:bg-[#141A29]"
                }`}
              >
                Сигнал
              </button>
            </div>

            {/* Terminal Main Workspace: 3-column on >= 1024px, single active section on < 1024px */}
            <div className="flex-1 flex flex-col lg:flex-row w-full lg:h-[calc(100vh-4rem)] overflow-hidden">
              {/* Left Watchlist */}
              <div
                className={`h-full ${
                  mobileSection === "watchlist" ? "flex flex-col flex-1" : "hidden"
                } lg:flex lg:flex-initial shrink-0`}
              >
                <Watchlist
                  assets={watchlist}
                  selectedSymbol={selectedSymbol}
                  onSelectSymbol={handleSelectSymbol}
                  loading={loadingMarket}
                  isStale={isWatchlistStale}
                  lastUpdated={lastMarketUpdate}
                  error={watchlistError}
                  onRetry={fetchMarketOverview}
                />
              </div>

              {/* Center 60fps Candlestick Chart */}
              <div
                className={`h-full ${
                  mobileSection === "chart" ? "flex flex-col flex-1" : "hidden"
                } lg:flex lg:flex-1 min-w-0`}
              >
                <TradingViewChart
                  symbol={selectedSymbol}
                  timeframe={timeframe}
                  onTimeframeChange={(tf) => setTimeframe(tf)}
                  candles={candles}
                  signal={signal}
                  loading={loadingCandles}
                  error={candlesError}
                  onRetry={() => fetchCandles(selectedSymbol, timeframe)}
                />
              </div>

              {/* Right Signal Dossier & AI Analyst */}
              <div
                className={`h-full ${
                  mobileSection === "signal" ? "flex flex-col flex-1" : "hidden"
                } lg:flex lg:flex-initial shrink-0`}
              >
                <SignalDossier
                  signal={signal}
                  loading={loadingSignal}
                  error={signalError}
                  onRetry={() => fetchSignal(selectedSymbol)}
                  onDeployPaperTrade={handleDeployPaperTrade}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "backtest" && <BacktestView initialSymbol={selectedSymbol} />}

        {activeTab === "paper" && <PaperTradingView />}
      </main>

      {/* ⌘K Command Palette */}
      <CommandPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectSymbol={(sym) => {
          setSelectedSymbol(sym);
          setIsSearchOpen(false);
        }}
      />
    </div>
  );
}
