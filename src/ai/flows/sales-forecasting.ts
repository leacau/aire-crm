'use server';

/**
 * @fileOverview Provides AI-driven sales forecasting based on pipeline analysis and historical data.
 *
 * - forecastSales - Function to trigger the sales forecasting process.
 * - SalesForecastingInput - Input type for the forecastSales function.
 * - SalesForecastingOutput - Return type for the forecastSales function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SalesForecastingInputSchema = z.object({
  pipelineData: z
    .string()
    .describe(
      'JSON string containing the sales pipeline data including deal size, close probability, and stage.'
    ),
  historicalData: z
    .string()
    .describe(
      'JSON string containing historical sales data, including past sales performance and trends.'
    ),
});
export type SalesForecastingInput = z.infer<typeof SalesForecastingInputSchema>;

const SalesForecastingOutputSchema = z.object({
  predictedRevenue: z
    .number()
    .describe('The predicted revenue based on the analysis of the sales pipeline and historical data.'),
  confidenceLevel: z
    .string()
    .describe('The confidence level of the prediction (e.g., High, Medium, Low).'),
  keyInfluencers: z
    .string()
    .describe(
      'A summary of the key factors influencing the forecast, such as specific large deals or market trends.'
    ),
  recommendations: z
    .string()
    .describe(
      'Recommendations for improving sales strategies or resource allocation based on the forecast.'
    ),
});
export type SalesForecastingOutput = z.infer<typeof SalesForecastingOutputSchema>;

export async function forecastSales(input: SalesForecastingInput): Promise<SalesForecastingOutput> {
  return forecastSalesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'salesForecastingPrompt',
  input: {schema: SalesForecastingInputSchema},
  output: {schema: SalesForecastingOutputSchema},
  prompt: `You are an AI sales forecasting expert. Analyze the provided sales pipeline data and historical sales data to predict future revenue.

Sales Pipeline Data: {{{pipelineData}}}
Historical Sales Data: {{{historicalData}}}

Consider deal sizes, close probabilities, sales stages, past performance, and market trends. Provide a predicted revenue, confidence level, key influencers, and recommendations.

Ensure the predictedRevenue is a number.
`,
});

const forecastSalesFlow = ai.defineFlow(
  {
    name: 'forecastSalesFlow',
    inputSchema: SalesForecastingInputSchema,
    outputSchema: SalesForecastingOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
