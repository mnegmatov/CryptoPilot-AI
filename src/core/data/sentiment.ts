/**
 * Alternative.me Crypto Fear & Greed Index client.
 * Completely free, no API key required.
 */
export async function fetchFearAndGreedIndex(): Promise<{
  score: number;
  sentiment: string;
  timestamp: number;
}> {
  try {
    const url = "https://api.alternative.me/fng/?limit=1";
    const res = await fetch(url, {
      next: { revalidate: 300 }, // Cache 5 minutes
    });

    if (!res.ok) {
      return { score: 50, sentiment: "Neutral", timestamp: Date.now() };
    }

    const data = await res.json();
    if (data && data.data && data.data[0]) {
      const item = data.data[0];
      return {
        score: parseInt(item.value, 10),
        sentiment: item.value_classification || "Neutral",
        timestamp: parseInt(item.timestamp, 10) * 1000,
      };
    }
    return { score: 50, sentiment: "Neutral", timestamp: Date.now() };
  } catch (error) {
    return { score: 50, sentiment: "Neutral", timestamp: Date.now() };
  }
}
