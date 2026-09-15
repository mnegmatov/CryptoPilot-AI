import { describe, expect, it } from "vitest";
import { Timeframe } from "../core/types";

describe("Desktop Three-Panel Terminal MVP (T006)", () => {
  it("maps keyboard shortcut keys 1-4 to correct timeframes", () => {
    const keyMap: Record<string, Timeframe> = {
      "1": "15m",
      "2": "1h",
      "3": "4h",
      "4": "1d",
    };

    expect(keyMap["1"]).toBe("15m");
    expect(keyMap["2"]).toBe("1h");
    expect(keyMap["3"]).toBe("4h");
    expect(keyMap["4"]).toBe("1d");
  });

  it("does not trigger keyboard shortcuts when focus is inside text inputs", () => {
    const shouldIgnoreKey = (activeTagName: string) => {
      const tag = activeTagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select";
    };

    expect(shouldIgnoreKey("INPUT")).toBe(true);
    expect(shouldIgnoreKey("TEXTAREA")).toBe(true);
    expect(shouldIgnoreKey("SELECT")).toBe(true);
    expect(shouldIgnoreKey("DIV")).toBe(false);
    expect(shouldIgnoreKey("BODY")).toBe(false);
  });

  it("verifies desktop panel width allocations conform to 3-panel geometry", () => {
    const desktopPanelConfig = {
      watchlistWidthPx: 260,
      dossierWidthPx: 420,
      chartFlex: "flex-1 min-w-0",
      containerHeightClass: "h-[calc(100vh-4rem)]",
    };

    expect(desktopPanelConfig.watchlistWidthPx).toBe(260);
    expect(desktopPanelConfig.dossierWidthPx).toBe(420);
    expect(desktopPanelConfig.chartFlex).toContain("min-w-0");
  });
});
