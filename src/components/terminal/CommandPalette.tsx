"use client";

import React, { useEffect } from "react";
import { Command } from "cmdk";
import { Search, TrendingUp } from "lucide-react";
import { DEFAULT_ASSETS } from "@/core/data/market-feed";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSymbol: (symbol: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectSymbol,
}) => {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (isOpen) onClose();
        else onClose(); // parent handles toggle
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-start justify-center pt-24 p-4">
      <div className="bg-[#141A29] border border-[#1E2638] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <Command className="w-full">
          <div className="flex items-center px-4 border-b border-[#1E2638]">
            <Search className="h-4 w-4 text-[#7B849B] mr-2 shrink-0" />
            <Command.Input
              autoFocus
              placeholder="Поиск криптовалюты (например, Bitcoin, Solana, ETH)..."
              className="w-full bg-transparent py-3.5 text-sm text-white placeholder-[#7B849B] focus:outline-none font-mono"
            />
          </div>

          <Command.List className="max-h-72 overflow-y-auto p-2 divide-y divide-[#1E2638]/40">
            <Command.Empty className="p-4 text-center text-xs text-[#7B849B]">
              Активы не найдены.
            </Command.Empty>

            <Command.Group heading="Активы списка наблюдения" className="text-[11px] font-semibold text-[#7B849B] px-2 py-1">
              {DEFAULT_ASSETS.map((asset) => (
                <Command.Item
                  key={asset.symbol}
                  value={`${asset.name} ${asset.symbol}`}
                  onSelect={() => {
                    onSelectSymbol(asset.symbol);
                    onClose();
                  }}
                  className="flex items-center justify-between p-2.5 rounded-lg text-xs hover:bg-[#1E2638] cursor-pointer transition-colors group"
                >
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white group-hover:text-sky-400">
                      {asset.symbol.replace("USDT", "")}
                    </span>
                    <span className="text-[#7B849B]">{asset.name}</span>
                  </div>
                  <span className="text-[11px] font-mono text-[#7B849B]">/USDT</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
};
