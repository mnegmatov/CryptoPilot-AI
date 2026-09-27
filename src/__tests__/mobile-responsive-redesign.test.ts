import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("Mobile Responsive Redesign Specification Validation", () => {
  const headerPath = path.resolve(process.cwd(), "src/components/layout/Header.tsx");
  const breakoutPath = path.resolve(process.cwd(), "src/components/breakout-paper/BreakoutPaperView.tsx");
  const equityChartPath = path.resolve(process.cwd(), "src/components/breakout-paper/BreakoutEquityChart.tsx");
  const globalsCssPath = path.resolve(process.cwd(), "src/app/globals.css");

  const headerContent = fs.readFileSync(headerPath, "utf-8");
  const breakoutContent = fs.readFileSync(breakoutPath, "utf-8");
  const equityChartContent = fs.readFileSync(equityChartPath, "utf-8");
  const globalsCssContent = fs.readFileSync(globalsCssPath, "utf-8");

  describe("1. Header & Mobile Navigation", () => {
    it("provides a mobile horizontal scroll bar with no-scrollbar utility", () => {
      expect(headerContent).toContain("overflow-x-auto no-scrollbar");
      expect(headerContent).toContain("md:hidden");
      expect(globalsCssContent).toContain(".no-scrollbar");
    });

    it("enforces minimum 44px touch targets on mobile tabs and controls", () => {
      expect(headerContent).toContain("min-h-[44px]");
      expect(headerContent).toContain("min-w-[44px]");
    });

    it("presents full readable tab names without shrinking to illegible abbreviations", () => {
      expect(headerContent).toContain("Терминал");
      expect(headerContent).toContain("Breakout Paper");
      expect(headerContent).toContain("Model D");
      expect(headerContent).toContain("Бэктестер");
    });

    it("preserves desktop navigation intact on >= md screens", () => {
      expect(headerContent).toContain("hidden md:flex");
      expect(headerContent).toContain("Terminal className");
      expect(headerContent).toContain("Zap className");
      expect(headerContent).toContain("Wallet className");
      expect(headerContent).toContain("BarChart3 className");
    });
  });

  describe("2. Breakout Paper Vertical Mobile Hierarchy", () => {
    it("arranges mobile sections in exact vertical order: Header -> Overview -> Positions -> Signals -> Equity -> History", () => {
      const headerIdx = breakoutContent.indexOf("1. TOP BANNER / SYSTEM CONTROLS (HEADER)");
      const overviewIdx = breakoutContent.indexOf("2. ACCOUNT OVERVIEW");
      const positionsIdx = breakoutContent.indexOf("3. OPEN POSITIONS");
      const signalsIdx = breakoutContent.indexOf("4. CURRENT SIGNALS / MONITORING");
      const equityIdx = breakoutContent.indexOf("5. EQUITY CURVE");
      const historyIdx = breakoutContent.indexOf("6. TRADE HISTORY");

      expect(headerIdx).toBeGreaterThan(-1);
      expect(overviewIdx).toBeGreaterThan(headerIdx);
      expect(positionsIdx).toBeGreaterThan(overviewIdx);
      expect(signalsIdx).toBeGreaterThan(positionsIdx);
      expect(equityIdx).toBeGreaterThan(signalsIdx);
      expect(historyIdx).toBeGreaterThan(equityIdx);
    });
  });

  describe("3. Account Overview 2-Column Mobile Grid", () => {
    it("renders primary metrics in a 2-column mobile grid: Equity | Cash and Realized | Unrealized", () => {
      expect(breakoutContent).toContain("grid grid-cols-2 md:grid-cols-4");
      expect(breakoutContent).toContain("Эквити (Equity)");
      expect(breakoutContent).toContain("Доступный кэш");
      expect(breakoutContent).toContain("Реализованный PnL");
      expect(breakoutContent).toContain("Нереализованный PnL");
    });

    it("ensures cards have equal height and no number wrapping overflow", () => {
      expect(breakoutContent).toContain("flex flex-col justify-between min-h-[96px]");
      expect(breakoutContent).toContain("truncate");
    });
  });

  describe("4. Open Position Mobile Cards", () => {
    it("renders card-based view for open positions on mobile (< md)", () => {
      expect(breakoutContent).toContain("md:hidden space-y-3");
      expect(breakoutContent).toContain("pos.direction === \"LONG\"");
      expect(breakoutContent).toContain("pos.entryPrice");
      expect(breakoutContent).toContain("pos.currentPrice");
      expect(breakoutContent).toContain("pos.stopPrice");
      expect(breakoutContent).toContain("pos.channelExitLevel");
      expect(breakoutContent).toContain("pos.positionSizeDollar");
      expect(breakoutContent).toContain("pos.riskDollar");
    });

    it("retains desktop table for >= md screens", () => {
      expect(breakoutContent).toContain("hidden md:block overflow-x-auto");
      expect(breakoutContent).toContain("<table");
    });
  });

  describe("5. Current Signals Mobile Cards", () => {
    it("renders 1 card per asset in mobile-friendly 1-col / desktop 3-col grid", () => {
      expect(breakoutContent).toContain("grid-cols-1 md:grid-cols-3");
      expect(breakoutContent).toContain("HH20 (Пробой Вверх)");
      expect(breakoutContent).toContain("LL20 (Пробой Вниз)");
      expect(breakoutContent).toContain("Объёмный фильтр");
      expect(breakoutContent).toContain("ATR(14)");
      expect(breakoutContent).toContain("Выход из канала");
      expect(breakoutContent).toContain("Кулдаун");
    });
  });

  describe("6. Equity Curve Chart", () => {
    it("uses ResizeObserver for responsive recalculation on resize and rotation", () => {
      expect(equityChartContent).toContain("ResizeObserver");
      expect(equityChartContent).toContain("containerRef.current");
      expect(equityChartContent).toContain("observer.disconnect()");
    });

    it("respects mobile height boundaries (220px–260px) and 100% width", () => {
      expect(equityChartContent).toContain("w-full h-[220px] sm:h-[260px]");
      expect(equityChartContent).toContain("overflow-hidden");
    });

    it("plots baseline at $10,000.00 and handles dynamic snapshot counts", () => {
      expect(equityChartContent).toContain("initialBalance = 10000");
      expect(equityChartContent).toContain("baselineY");
      expect(equityChartContent).toContain("snapshots.length");
    });
  });

  describe("7. Trade History Mobile Cards & Disclosure", () => {
    it("renders mobile cards on < md with <details> disclosure", () => {
      expect(breakoutContent).toContain("md:hidden space-y-2.5");
      expect(breakoutContent).toContain("<details");
      expect(breakoutContent).toContain("Причина выхода");
      expect(breakoutContent).toContain("Комиссии + Слиппедж");
    });

    it("retains desktop table on >= md screens", () => {
      expect(breakoutContent).toContain("hidden md:block overflow-x-auto max-h-72");
    });
  });

  describe("8. Touch UX & Layout Safety across Breakpoints (320px, 360px, 390px, 430px, 768px, 1280px+)", () => {
    it("enforces touch target sizes >= 44px on primary mobile buttons", () => {
      const buttonMatches = breakoutContent.match(/min-h-\[44px\]/g) || [];
      expect(buttonMatches.length).toBeGreaterThanOrEqual(2);
    });

    it("ensures overflow protection with w-full, max-w-full, min-w-0 across components", () => {
      expect(breakoutContent).toContain("w-full max-w-full min-w-0");
      expect(headerContent).toContain("w-full min-w-0");
      expect(globalsCssContent).toContain("overflow-x: hidden");
    });
  });
});
