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

  const [watchlist, setWatchlist] = useState<WatchlistAsset[]>([]);
  const [marketContext, setMarketContext] = useState<MarketContextData | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(true);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [loadingCandles, setLoadingCandles] = useState(true);

  const [signal, setSignal] = useState<TradingSignal | null>(null);
  const [loadingSignal, setLoadingSignal] = useState(true);

  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // 1. Fetch Watchlist & Market Context
  const fetchMarketOverview = async () => {
    try {
      const res = await fetch("/api/market");
      const data = await res.json();
      if (data.success) {
        setWatchlist(data.watchlist);
        setMarketContext(data.context);
      }
    } catch (err) {
      console.error("Market overview error:", err);
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
    try {
      const res = await fetch(`/api/candles?symbol=${symbol}&timeframe=${tf}&limit=180`);
      const data = await res.json();
      if (data.success && Array.isArray(data.candles)) {
        setCandles(data.candles);

        // Update paper trading live prices
        if (data.candles.length > 0) {
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
        }
      }
    } catch (err) {
      console.error("Candles fetch error:", err);
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
    try {
      const res = await fetch(`/api/signal?symbol=${symbol}`);
      const data = await res.json();
      if (data.success && data.signal) {
        setSignal(data.signal);
      }
    } catch (err) {
      console.error("Signal fetch error:", err);
    } finally {
      setLoadingSignal(false);
    }
  };

  useEffect(() => {
    fetchCandles(selectedSymbol, timeframe);
    fetchSignal(selectedSymbol);
  }, [selectedSymbol, timeframe]);

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
      <main className="flex-1 flex overflow-hidden">
        {activeTab === "terminal" && (
          <div className="flex-1 flex flex-col md:flex-row w-full h-[calc(100vh-4rem)] overflow-hidden">
            {/* Left Watchlist */}
            <Watchlist
              assets={watchlist}
              selectedSymbol={selectedSymbol}
              onSelectSymbol={(sym) => setSelectedSymbol(sym)}
              loading={loadingMarket}
            />

            {/* Center 60fps Candlestick Chart */}
            <TradingViewChart
              symbol={selectedSymbol}
              timeframe={timeframe}
              onTimeframeChange={(tf) => setTimeframe(tf)}
              candles={candles}
              signal={signal}
              loading={loadingCandles}
            />

            {/* Right Signal Dossier & AI Analyst */}
            <SignalDossier
              signal={signal}
              loading={loadingSignal}
              onDeployPaperTrade={handleDeployPaperTrade}
            />
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
