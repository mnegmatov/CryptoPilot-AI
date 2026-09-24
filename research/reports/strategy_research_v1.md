# Strategy Research Phase V1: Alternative Systematic Models

## A. Executive Summary
This research phase investigates whether alternative systematic crypto strategies (Momentum, Mean Reversion, Regime-Based) can provide a more robust statistical edge than the current frozen baseline (Model D - 4H Trend Following). All research strictly adheres to paper-trading/backtest environments without modifying Model D.

## B. Research Questions
1. Can short-term momentum (Model E) outperform Model D's longer 4H trend-following approach in choppy markets?
2. Does mean reversion (Model F) provide a smoother equity curve with higher win rates during non-trending regimes?
3. Can a regime-based strategy (Model G) dynamically switch between trend and mean-reversion rules to maximize expectancy across all market phases?
4. Do these models survive transaction costs, slippage, and out-of-sample data validation?

## C. Existing Infrastructure Identification
We will reuse the following existing production infrastructure to ensure zero lookahead bias and apples-to-apples comparison:
- **`src/core/backtest/engine.ts`**: The core `runBacktest` engine, which we have augmented to accept custom `signalGenerator` functions. It already handles slippage, fees, and bar-by-bar walk-forward simulation.
- **`src/core/quant/indicators.ts`**: Existing indicators (EMA, RSI, ADX, Bollinger Bands, ATR, MACD).
- **`src/core/data/market-feed.ts`**: Access to historical Binance OHLCV data.
- **Evaluation Splits**: 
  - Development: `2021-01-01` to `2023-06-30`
  - Validation: `2023-07-01` to `2024-09-30`
  - Final Sealed OOS: `2024-10-01` to `2026-09-19`

## D. Model E Specification (Momentum / Breakout)
- **Concept**: Price breaking out of recent historical ranges indicates strong directional momentum.
- **Rules**: Long on 20-period Donchian Channel breakout if ADX(14) > 25. Short on lower breakdown if ADX > 25.
- **Exit**: Chandelier ATR Trailing Stop (2.5x ATR).

## E. Model F Specification (Mean Reversion)
- **Concept**: Extreme price deviations from the mean tend to revert during ranging markets.
- **Rules**: Long when Price touches lower Bollinger Band and RSI(14) < 30. Short when touching upper Bollinger Band and RSI(14) > 70.
- **Filter**: Only execute if ADX(14) < 25 (ranging market).
- **Exit**: TP at moving average (EMA20). Fixed SL at 1.5x ATR.

## F. Model G Specification (Regime-Based)
- **Concept**: Dynamic strategy that trades Model E logic when ADX > 25 and Model F logic when ADX < 25.
- **Rules**: Switch logic based on the ADX filter.

## G. Data Methodology
- Assets: BTCUSDT, ETHUSDT, SOLUSDT
- Timeframe: 4H (reusing identical historical CSVs)
- Slippage: 0.05% normal, 0.15% high-volatility
- Taker Fee: 0.05%

## H. Anti-Lookahead Methodology
The `runBacktest` engine strictly passes `candles.slice(0, i)` to the signal generator for the current simulated bar `i`. All indicators are calculated *only* on completed historical bars. Trades are filled on the current bar only if penetration is strictly confirmed.

## I. Backtest Methodology
Evaluated each model across Long-Only and Long+Short configurations. Used the existing robust simulation engine with Chandelier ATR trailing stops and structural targets.

## J. OOS Results
Across all three models (Model E, F, G) and configurations (Long-Only, Long/Short), **no model produced a positive return in the Final Sealed OOS Period (2024-10-01 to Present).** 

Sample OOS metrics for BTCUSDT:
- Model E (Momentum) Long-Only: -8.11% Return, Win Rate 38.6%, Sharpe -2.71
- Model E (Momentum) Long/Short: -7.40% Return, Win Rate 37.1%, Sharpe -2.25
- Model F (Mean Reversion) Long/Short: -26.96% Return, Win Rate 30.0%, Sharpe -7.33
- Model G (Regime) Long/Short: -23.47% Return, Win Rate 33.3%, Sharpe -3.12

For SOLUSDT, Model E (Momentum) showed brief promise in the Dev (+13.18%) and Validation (+4.68%) periods, but ultimately failed the OOS test (-5.51% Return, Sharpe -1.21).

## K. Cost Sensitivity
Given the negative baseline performance before heavy transaction costs are even stressed, the models are highly sensitive to slippage. Mean reversion (Model F) suffers exceptionally from slippage because of its low average win distance per trade.

## L. Monte Carlo Analysis
Due to negative mathematical expectancy across the board (ExpectancyR ranging from -0.1 to -0.4), Monte Carlo trade-order resampling confirms near a 100% probability of eventual ruin for Models E, F, and G in their current raw forms.

## M. Comparison with Model D
Model D remains vastly superior to these raw systematic strategies. The integration of 4H Macro Trend Gates, 4H Structural Swing Trailing, and strictly ignoring ranging chop (which Model F tries to trade and fails) protects Model D from the massive drawdowns exhibited by Models E and F.

## N. Failure Modes
1. **Model E (Momentum)**: High false-breakout rate. The crypto markets are prone to liquidity sweeps, triggering Donchian/Bollinger breakouts that immediately reverse.
2. **Model F (Mean Reversion)**: Gets steamrolled in trending markets. A tight 1.5x ATR stop is repeatedly hunted during high-volatility expansions.
3. **Model G (Regime)**: The ADX(14) indicator lags. By the time ADX drops below 25 to signal a "ranging" regime, the market often breaks out, causing the Mean Reversion sub-model to get caught on the wrong side of the trend.

## O. Robustness Analysis
Evidence of robustness is exceptionally weak. The models failed to generalize across assets (BTC vs SOL) and failed to survive the temporal split into unseen OOS data.

## P. Recommendation
**No model passed the research gate.** 
There is zero evidence of a robust statistical edge for Models E, F, or G out-of-sample. Do NOT deploy these to paper trading. The current baseline, Model D, remains the frozen production standard. Research should pivot toward improving Model D's filters or exploring entirely different non-linear alpha sources (e.g., funding rate arbitrage, orderbook imbalance).
