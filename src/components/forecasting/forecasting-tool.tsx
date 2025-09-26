'use client';

import { useState } from 'react';
import { useForm, FormProvider, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lightbulb, TrendingUp, ShieldCheck } from 'lucide-react';
import { getSalesForecast } from '@/lib/actions';
import type { SalesForecastingOutput } from '@/ai/flows/sales-forecasting';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '../ui/skeleton';

const formSchema = z.object({
  pipelineData: z.string().min(1, 'Pipeline data is required.'),
  historicalData: z.string().min(1, 'Historical data is required.'),
});

type ForecastingFormValues = z.infer<typeof formSchema>;

interface ForecastingToolProps {
  initialPipelineData: string;
  initialHistoricalData: string;
}

const ResultCard = ({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
      {icon}
      <CardTitle className="text-base font-medium">{title}</CardTitle>
    </CardHeader>
    <CardContent className="text-sm text-muted-foreground">
      {children}
    </CardContent>
  </Card>
);

const ResultSkeleton = () => (
    <div className="grid md:grid-cols-2 gap-6 mt-6">
        <Card>
            <CardHeader>
                <Skeleton className="h-8 w-1/2" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-12 w-3/4" />
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <Skeleton className="h-8 w-1/2" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-12 w-3/4" />
            </CardContent>
        </Card>
        <div className="md:col-span-2">
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-1/3" />
                </CardHeader>
                <CardContent className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                </CardContent>
            </Card>
        </div>
    </div>
)

export function ForecastingTool({
  initialPipelineData,
  initialHistoricalData,
}: ForecastingToolProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SalesForecastingOutput | null>(null);
  const { toast } = useToast();

  const form = useForm<ForecastingFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      pipelineData: initialPipelineData,
      historicalData: initialHistoricalData,
    },
  });

  const onSubmit = async (data: ForecastingFormValues) => {
    setIsLoading(true);
    setResult(null);

    const response = await getSalesForecast(data);

    if (response.success && response.data) {
      setResult(response.data);
    } else {
      toast({
        variant: 'destructive',
        title: 'Forecasting Failed',
        description:
          response.error || 'An unknown error occurred. Please try again.',
      });
    }

    setIsLoading(false);
  };

  return (
    <div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="pipelineData"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Sales Pipeline (JSON)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={10}
                      className="font-code text-xs"
                      placeholder="Enter pipeline data..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="historicalData"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Historical Sales Data (JSON)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={10}
                      className="font-code text-xs"
                      placeholder="Enter historical data..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? 'Analyzing...' : 'Generate Forecast'}
          </Button>
        </form>
      </Form>

      {isLoading && <ResultSkeleton />}

      {result && (
        <div className="mt-8 space-y-6 animate-in fade-in duration-500">
            <Card className="bg-green-500/10 border-green-500/30">
                <CardHeader>
                    <div className="flex items-center gap-4">
                        <TrendingUp className="h-10 w-10 text-green-600" />
                        <div>
                            <CardTitle className="text-xl">Predicted Revenue</CardTitle>
                            <p className="text-4xl font-bold text-green-700 mt-1">
                                ${result.predictedRevenue.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
                <ResultCard
                    icon={<ShieldCheck className="text-blue-500" />}
                    title="Confidence Level"
                >
                    <p className="text-lg font-semibold text-foreground">{result.confidenceLevel}</p>
                </ResultCard>

                <ResultCard
                    icon={<Lightbulb className="text-yellow-500" />}
                    title="Key Influencers"
                >
                    <p>{result.keyInfluencers}</p>
                </ResultCard>
            </div>
            <ResultCard
                icon={<Lightbulb className="text-purple-500" />}
                title="Recommendations"
            >
                <p>{result.recommendations}</p>
            </ResultCard>
        </div>
      )}
    </div>
  );
}
