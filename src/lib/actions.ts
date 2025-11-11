'use server';

import { opportunities } from './data';


export function getMockForecastingData() {
  const pipelineData = JSON.stringify(
    opportunities.map((o) => ({
      deal_size: o.value,
      stage: o.stage,
      close_probability:
        o.stage === 'New'
          ? 0.1
          : o.stage === 'Proposal'
          ? 0.4
          : o.stage === 'Negotiation'
          ? 0.7
          : o.stage === 'Closed Won'
          ? 1
          : 0,
    })),
    null,
    2
  );

  const historicalData = JSON.stringify(
    {
      last_quarter_revenue: 45000,
      same_quarter_last_year_revenue: 38000,
      market_trend: "positive",
      average_deal_size: 65000,
    },
    null,
    2
  );

  return { pipelineData, historicalData };
}
