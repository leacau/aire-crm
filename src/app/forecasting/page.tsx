import { Header } from '@/components/layout/header';
import { ForecastingTool } from '@/components/forecasting/forecasting-tool';
import { getMockForecastingData } from '@/lib/actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Info } from 'lucide-react';

export default function ForecastingPage() {
  const { pipelineData, historicalData } = getMockForecastingData();

  return (
    <div className="flex flex-col h-full">
      <Header title="AI Sales Forecasting" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
            <Card className="bg-primary/5 border-primary/20 mb-6">
                <CardHeader className="flex flex-row items-start gap-4">
                    <Info className="h-6 w-6 text-primary mt-1" />
                    <div>
                        <CardTitle className="text-primary">How it Works</CardTitle>
                        <CardDescription className="text-foreground/80">
                            Our AI analyzes your current sales pipeline and historical data to generate a revenue forecast. You can edit the data below to see how changes might impact the prediction.
                        </CardDescription>
                    </div>
                </CardHeader>
            </Card>
            <ForecastingTool
            initialPipelineData={pipelineData}
            initialHistoricalData={historicalData}
            />
        </div>
      </main>
    </div>
  );
}
