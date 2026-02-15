import { calculateMomentum, scoreStocks, standardDeviation, zScores } from '../lib/scoring';

describe('scoring helpers', () => {
  it('calculates weighted momentum', () => {
    expect(calculateMomentum(0.1, 0.2)).toBeCloseTo(0.16);
  });

  it('computes standard deviation', () => {
    expect(standardDeviation([1, 2, 3, 4])).toBeCloseTo(1.118, 3);
  });

  it('creates centered z-scores', () => {
    const values = zScores([10, 20, 30]);
    expect(values[1]).toBeCloseTo(0);
    expect(values[0]).toBeLessThan(0);
    expect(values[2]).toBeGreaterThan(0);
  });

  it('applies stronger volatility penalty for low risk profile', () => {
    const inputs = [
      { ticker: 'AAA', companyName: 'AAA Inc.', price: 100, return1M: 0.02, return6M: 0.08, volatility3M: 0.01, valueProxy: null },
      { ticker: 'BBB', companyName: 'BBB Inc.', price: 110, return1M: 0.03, return6M: 0.09, volatility3M: 0.04, valueProxy: null }
    ];

    const lowRisk = scoreStocks(inputs, 'low');
    const highRisk = scoreStocks(inputs, 'high');

    const lowGap = lowRisk[0].overallScore - lowRisk[1].overallScore;
    const highGap = highRisk[0].overallScore - highRisk[1].overallScore;

    expect(lowGap).toBeGreaterThan(highGap);
  });
});
