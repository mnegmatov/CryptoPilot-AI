import { GoogleGenAI } from "@google/genai";
import { TradingSignal } from "../types";

export interface AIExplanationResult {
  thesis: string;
  whySetupExists: string;
  marketContextSummary: string;
  invalidationDetail: string;
  executionPlan: string;
}

/**
 * Deterministic fallback analyst synthesis when no LLM API key is configured.
 * Generates an institutional-grade breakdown strictly from computed quantitative telemetry.
 */
export function generateDeterministicAnalysis(signal: TradingSignal): AIExplanationResult {
  const { asset, stance, currentPrice, entryRange, stopLoss, takeProfitTargets, technicalSummary, marketStructure, marketContext } = signal;

  const htfTrendRu = marketStructure.trendHTF === "BULLISH" ? "бычий" : marketStructure.trendHTF === "BEARISH" ? "медвежий" : "боковой";
  const ltfTrendRu = marketStructure.trendLTF === "BULLISH" ? "бычий" : marketStructure.trendLTF === "BEARISH" ? "медвежий" : "боковой";
  const trendDesc = `${htfTrendRu} на старших таймфреймах (4H) и ${ltfTrendRu} на младших (1H)`;

  const rsiStateRu = technicalSummary.rsiState === "OVERSOLD" ? "перепроданность"
    : technicalSummary.rsiState === "OVERBOUGHT" ? "перекупленность"
    : technicalSummary.rsiState === "BULLISH_DIVERGENCE" ? "бычья дивергенция"
    : technicalSummary.rsiState === "BEARISH_DIVERGENCE" ? "медвежья дивергенция"
    : "нейтральное состояние";

  const rsiDesc = `RSI(14) на уровне ${technicalSummary.rsi14} (${rsiStateRu}) при значении ADX ${technicalSummary.adx14}`;

  const fundingPart = marketContext.fundingRate !== null
    ? `Ставка финансирования бессрочных фьючерсов составляет ${(marketContext.fundingRate * 100).toFixed(4)}%`
    : "Ставка финансирования фьючерсов: данные недоступны";

  const fngPart = (marketContext.fearGreedIndex !== null && marketContext.fearGreedSentiment)
    ? `индекс страха и жадности находится в зоне «${marketContext.fearGreedSentiment}» (${marketContext.fearGreedIndex}/100)`
    : "индекс страха и жадности: данные недоступны";

  const fundingDesc = `${fundingPart}, ${fngPart}`;

  const isModelD = signal.id.includes("model_d");

  let thesis = "";
  let whySetupExists = "";
  let invalidationDetail = "";
  let executionPlan = "";

  if (stance === "BUY") {
    thesis = `Текущая структура рынка по ${asset} поддерживает сценарий продолжения восходящего движения. Цена удерживает ключевую поддержку около $${marketStructure.keySupport.toLocaleString()} при подтверждении тренда на старшем таймфрейме.`;
    whySetupExists = `Сигнал сформирован на основе трёх факторов: 1) Согласованность трендов: ${trendDesc}, цена находится выше 200 EMA ($${technicalSummary.ema200.toFixed(2)}). 2) Динамика импульса: ${rsiDesc}, сохраняется потенциал движения без признаков истощения. 3) Структурная ликвидность: покупатели выкупили откат при объёме в ${technicalSummary.volumeRatio20}x от 20-периодной средней.`;
    invalidationDetail = `Сценарий на покупку аннулируется при закрытии 1-часовой свечи ниже стоп-лосса на уровне $${stopLoss.toLocaleString()} либо при пробое 200 EMA на повышенном объёме продаж.`;
    executionPlan = isModelD
      ? `Рекомендуется лимитный вход в диапазоне $${entryRange.min.toLocaleString()} – $${entryRange.max.toLocaleString()} (оптимально: $${entryRange.ideal.toLocaleString()}). Жёсткий стоп-лосс на $${stopLoss.toLocaleString()} (2.5×ATR). Фиксация прибыли: без фиксированных тейк-профитов; сопровождение по свинговому минимуму 5 свечей. Целевые уровни являются информационными рубежами (Milestones +3R/+6R), а не лимитными тейками.`
      : `Рекомендуется лимитный вход в диапазоне $${entryRange.min.toLocaleString()} – $${entryRange.max.toLocaleString()} (оптимальная цена: $${entryRange.ideal.toLocaleString()}). Жёсткий стоп-лосс на $${stopLoss.toLocaleString()}. Фиксация 50% объёма на ТП1 ($${takeProfitTargets[0]?.price.toLocaleString()}) с переводом стопа в безубыток, остаток позиции удерживается до ТП2 ($${takeProfitTargets[1]?.price.toLocaleString()}).`;
  } else if (stance === "SHORT") {
    thesis = `Структура рынка по ${asset} указывает на преобладание продавцов и продолжение нисходящего движения. Котировки формируют последовательно понижающиеся максимумы и минимумы ниже 200 EMA ($${technicalSummary.ema200.toFixed(2)}).`;
    whySetupExists = `Шорт-сценарий подтверждается: 1) Слабостью структуры: отбой от сопротивления $${marketStructure.keyResistance.toLocaleString()} при условии, что ${trendDesc}. 2) Нисходящим импульсом: ${rsiDesc} при преобладании продавцов (-DI: ${technicalSummary.minusDI} > +DI: ${technicalSummary.plusDI}). 3) Ликвидностью: неудачные попытки закрепиться выше скользящих средних сопровождаются давлением на продажу.`;
    invalidationDetail = `Шорт-сценарий аннулируется при закрытии 1-часовой свечи выше стоп-лосса на уровне $${stopLoss.toLocaleString()} либо при импульсном возврате цены выше 200 EMA на высоком объёме.`;
    executionPlan = isModelD
      ? `Лимитные заявки на продажу в диапазоне $${entryRange.min.toLocaleString()} – $${entryRange.max.toLocaleString()} (оптимально: $${entryRange.ideal.toLocaleString()}). Начальный стоп-лосс на $${stopLoss.toLocaleString()} (2.5×ATR). Фиксация прибыли: без фиксированных тейк-профитов; сопровождение по свинговому максимуму 5 свечей. Уровни +3R/+6R являются информационными рубежами (Milestones), а не ордерами ТП.`
      : `Лимитные заявки на продажу на откате к сопротивлению в диапазоне $${entryRange.min.toLocaleString()} – $${entryRange.max.toLocaleString()} (оптимально: $${entryRange.ideal.toLocaleString()}). Стоп-лосс на $${stopLoss.toLocaleString()}. Частичная фиксация на ТП1 ($${takeProfitTargets[0]?.price.toLocaleString()}) с переносом стопа в безубыток и сопровождением трейлинг-стопом до ТП2 ($${takeProfitTargets[1]?.price.toLocaleString()}).`;
  } else if (stance === "AVOID") {
    thesis = `Режим сохранения капитала по ${asset}. Рыночная структура демонстрирует признаки слома или неблагоприятное соотношение риска к прибыли.`;
    whySetupExists = `Актив находится в неблагоприятных условиях: наблюдается фаза распределения либо крайняя степень движения без сформированного отката. Открытие позиций сопряжено с высоким риском просадки.`;
    invalidationDetail = `Статус нейтрализуется только после подтверждённого слома структуры (BOS) и консолидации с подтверждающим объёмом.`;
    executionPlan = `Воздержаться от сделок. Сохранять ликвидность до появления сетапа с явным статистическим преимуществом.`;
  } else {
    thesis = `Нейтральное состояние / Режим ожидания по ${asset}. Рынок консолидируется в диапазоне между поддержкой $${marketStructure.keySupport.toLocaleString()} и сопротивлением $${marketStructure.keyResistance.toLocaleString()}.`;
    whySetupExists = `Сила направленного тренда снижена (ADX: ${technicalSummary.adx14}) внутри сужающихся полос Боллинджера (ширина: ${technicalSummary.bollingerBands.bandwidth}%). Скользящие средние переходят в горизонтальное положение. Торговля в середине коридора сопряжена с риском ложных пробоев.`;
    invalidationDetail = `Режим ожидания завершится при уверенном истинном пробое диапазона выше $${marketStructure.keyResistance.toLocaleString()} либо подтверждённом снятии ликвидности и возврате выше $${marketStructure.keySupport.toLocaleString()}.`;
    executionPlan = `Установить ценовые алерты на границах диапазона ($${marketStructure.keySupport.toLocaleString()} и $${marketStructure.keyResistance.toLocaleString()}). Не совершать входов в середине диапазона.`;
  }

  return {
    thesis,
    whySetupExists,
    marketContextSummary: fundingDesc,
    invalidationDetail,
    executionPlan,
  };
}

/**
 * Generates an institutional AI explanation using Gemini when GEMINI_API_KEY is present,
 * or gracefully falls back to the deterministic template engine.
 *
 * CRITICAL RULE: AI is NEVER the source of raw market data. It receives purely deterministic facts.
 */
export async function generateAIExplanation(signal: TradingSignal): Promise<AIExplanationResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return generateDeterministicAnalysis(signal);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const isModelD = signal.id.includes("model_d");
    const fundingDataText = signal.marketContext.fundingRate !== null
      ? `${(signal.marketContext.fundingRate * 100).toFixed(4)}%`
      : "НЕДОСТУПНО (данные отсутствуют в реальном потоке, не интерпретировать как 0% или нейтральное значение)";

    const fngDataText = (signal.marketContext.fearGreedIndex !== null && signal.marketContext.fearGreedSentiment)
      ? `${signal.marketContext.fearGreedIndex}/100 («${signal.marketContext.fearGreedSentiment}»)`
      : "НЕДОСТУПНО (данные отсутствуют в реальном потоке, не интерпретировать как 50 или Neutral)";

    const targetsText = isModelD
      ? `- Информационные рубежи (Milestones / R-multiples, Model D без фиксированного ТП, выход строго по структурному трейлинг-стопу): ${signal.takeProfitTargets.map((tp) => `Рубеж ${tp.rewardRisk}R: $${tp.price} (+${tp.percentage}%)`).join(", ")}`
      : `- Тейк-профиты: ${signal.takeProfitTargets.map((tp) => `ТП${tp.level}: $${tp.price} (${tp.percentage}%, ${tp.rewardRisk}R)`).join(", ")}`;

    const prompt = `
Вы — ведущий квант-аналитик и риск-менеджер крипто-терминала CryptoPilot AI.
Проанализируйте следующие детерминированные рыночные данные по ${signal.asset} и составьте структурированное аналитическое досье на грамотном профессиональном русском языке.

ПРАВИЛА:
1. НЕ придумывайте цены, уровни и цифры. Используйте ТОЛЬКО предоставленные данные. Если ставка финансирования или индекс страха/жадности помечены как НЕДОСТУПНО, строго запрещено предполагать нейтральные значения. В разделе marketContextSummary явно констатируйте отсутствие этих данных.
2. Тон: сдержанный, профессиональный, институциональный. Избегайте категоричных утверждений вроде «BTC точно вырастет». Используйте формулировки «Текущая структура поддерживает сценарий... однако...».
3. Используйте принятую терминологию: RSI, MACD, EMA200, ADX, ATR, PnL, R/R, Chandelier Exit, снятие ликвидности.
4. Значение "Скор сигнала /100" (Signal Score) — это детерминированная конfluence-оценка совпадения факторов (0-100), а НЕ статистическая вероятность победы или процент выигрыша.
${isModelD ? "5. Для стратегии Model D: выход из позиции осуществляется исключительно по структурному трейлинг-стопу (минимум/максимум 5 закрытых 4H свечей). Рубежи +3R и +6R являются ориентирами (Milestones), а не ордерами лимитной фиксации.\n" : ""}
ДАННЫЕ:
- Актив: ${signal.asset}
- Сигнал: ${signal.stance} (${signal.type})
- Текущая цена: $${signal.currentPrice}
- Диапазон входа: $${signal.entryRange.min} - $${signal.entryRange.max} (Идеал: $${signal.entryRange.ideal})
- Стоп-лосс: $${signal.stopLoss} (${signal.stopLossPercentage}% риска)
${targetsText}
- Соотношение риск/прибыль: ${signal.riskRewardRatio}R
- Скор сигнала (Signal Score): ${signal.confidenceScore}/100 (детерминированный конфлюенс-скор, НЕ вероятность выигрыша)
- 200 EMA: $${signal.technicalSummary.ema200}
- RSI(14): ${signal.technicalSummary.rsi14} (${signal.technicalSummary.rsiState})
- ADX(14): ${signal.technicalSummary.adx14} (+DI: ${signal.technicalSummary.plusDI}, -DI: ${signal.technicalSummary.minusDI})
- Тренд HTF: ${signal.marketStructure.trendHTF} | Тренд LTF: ${signal.marketStructure.trendLTF}
- Поддержка: $${signal.marketStructure.keySupport} | Сопротивление: $${signal.marketStructure.keyResistance}
- Ставка финансирования: ${fundingDataText}
- Индекс страха и жадности: ${fngDataText}

ФОРМАТ ОТВЕТА (строгий JSON без markdown-блоков):
{
  "thesis": "Краткий вывод из 1-2 предложений о позиции и рыночном контексте",
  "whySetupExists": "Подробное объяснение почему появился сигнал, подтверждения, структура и объём",
  "marketContextSummary": "Анализ макроконтекста, ставки финансирования и настроений (с указанием если метрика недоступна)",
  "invalidationDetail": "Чёткие условия отмены сигнала при нарушении структуры или стоп-лосса",
  "executionPlan": "План сделки: порядок размещения лимитных ордеров, фиксация ТП или сопровождение по трейлинг-стопу"
}
`;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });
    const text = (result.text || "").trim();
    const cleanedJson = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleanedJson);

    return {
      thesis: parsed.thesis || "Аналитическое досье сформировано.",
      whySetupExists: parsed.whySetupExists || "",
      marketContextSummary: parsed.marketContextSummary || "",
      invalidationDetail: parsed.invalidationDetail || "",
      executionPlan: parsed.executionPlan || "",
    };
  } catch (error) {
    console.warn("AI generation failed, falling back to deterministic analyst:", error);
    return generateDeterministicAnalysis(signal);
  }
}
