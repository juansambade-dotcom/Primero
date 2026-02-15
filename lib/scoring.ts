export type RiskLevel = 'low' | 'med' | 'high';

export interface StockScoreInput {
  ticker: string;
  companyName: string;
  price: number;
  return1M: number;
  return6M: number;
  volatility3M: number;
  valueProxy?: number | null;
}

export interface ScoredStock extends StockScoreInput {
  momentum: number;
  momentumZ: number;
  volatilityZ: number;
  overallScore: number;
}

export const RISK_FACTORS: Record<RiskLevel, number> = {
  low: 1.2,
  med: 0.8,
  high: 0.4
};

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function zScores(values: number[]): number[] {
  const avg = mean(values);
  const sd = standardDeviation(values);
  if (sd === 0) return values.map(() => 0);
  return values.map((value) => (value - avg) / sd);
}

export function calculateMomentum(return1M: number, return6M: number): number {
  return return6M * 0.6 + return1M * 0.4;
}

export function scoreStocks(inputs: StockScoreInput[], riskLevel: RiskLevel): ScoredStock[] {
  const momentumValues = inputs.map((stock) => calculateMomentum(stock.return1M, stock.return6M));
  const volatilityValues = inputs.map((stock) => stock.volatility3M);

  const momentumZs = zScores(momentumValues);
  const volatilityZs = zScores(volatilityValues);
  const riskFactor = RISK_FACTORS[riskLevel];

  return inputs
    .map((stock, index) => {
      const momentum = momentumValues[index];
      const momentumZ = momentumZs[index];
      const volatilityZ = volatilityZs[index];
      const overallScore = momentumZ - volatilityZ * riskFactor;

      return {
        ...stock,
        momentum,
        momentumZ,
        volatilityZ,
        overallScore
      };
    })
    .sort((a, b) => b.overallScore - a.overallScore);
}
