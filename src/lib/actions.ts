'use server';

import {
  forecastSales as forecastSalesFlow,
  type SalesForecastingInput,
  type SalesForecastingOutput,
} from '@/ai/flows/sales-forecasting';
import { opportunities } from './data';

type ForecastResult = {
  success: boolean;
  data?: SalesForecastingOutput;
  error?: string;
};

export async function getSalesForecast(
  input: SalesForecastingInput
): Promise<ForecastResult> {
  try {
    const result = await forecastSalesFlow(input);
    return { success: true, data: result };
  } catch (error) {
    console.error('Error during sales forecasting:', error);
    // In a real app, you might want to log this error to a monitoring service
    return { success: false, error: 'An unexpected error occurred while generating the forecast.' };
  }
}

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
