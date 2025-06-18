import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/dialog';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Loader2 } from 'lucide-react';
import { getDetailedUsage, type DetailedUsage } from '@/actions/billing/plan.actions';
import { formatUsdCurrency } from '@/utils/currency-utils';

export interface UsageDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UsageDetailsModal({ open, onOpenChange }: UsageDetailsModalProps) {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [data, setData] = useState<DetailedUsage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!startDate || !endDate) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const startDateISO = new Date(startDate).toISOString();
      const endDateISO = new Date(endDate + 'T23:59:59').toISOString();
      const result = await getDetailedUsage(startDateISO, endDateISO);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch usage data');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, fetchData]);

  const handlePresetClick = (preset: 'last24hours' | 'last7days' | 'thismonth') => {
    const end = new Date();
    const endStr = end.toISOString().split('T')[0];
    
    if (preset === 'last24hours') {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === 'last7days') {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === 'thismonth') {
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto !bg-card text-foreground">
        <DialogHeader>
          <DialogTitle>Detailed Usage Report</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePresetClick('last24hours')}
            >
              Last 24 Hours
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePresetClick('last7days')}
            >
              Last 7 Days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePresetClick('thismonth')}
            >
              This Month
            </Button>
          </div>
          
          <div className="flex gap-4 items-end">
            <div className="space-y-2">
              <label htmlFor="start-date" className="text-sm font-medium">
                Start Date
              </label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="end-date" className="text-sm font-medium">
                End Date
              </label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button onClick={fetchData} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Refresh
            </Button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="ml-2">Loading usage data...</span>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && data.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No usage data found for the selected date range.
            </div>
          )}

          {!loading && !error && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-border">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="border border-border px-4 py-2 text-left text-sm font-medium">
                      Model
                    </th>
                    <th className="border border-border px-4 py-2 text-left text-sm font-medium">
                      Provider
                    </th>
                    <th className="border border-border px-4 py-2 text-left text-sm font-medium">
                      Type
                    </th>
                    <th className="border border-border px-4 py-2 text-right text-sm font-medium">
                      Cost
                    </th>
                    <th className="border border-border px-4 py-2 text-right text-sm font-medium">
                      Requests
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((usage, index) => (
                    <tr key={index} className="hover:bg-muted/30">
                      <td className="border border-border px-4 py-2 text-sm">
                        {usage.modelDisplayName}
                      </td>
                      <td className="border border-border px-4 py-2 text-sm">
                        {usage.providerCode}
                      </td>
                      <td className="border border-border px-4 py-2 text-sm">
                        {usage.modelType}
                      </td>
                      <td className="border border-border px-4 py-2 text-sm text-right">
                        {formatUsdCurrency(usage.totalCost)}
                      </td>
                      <td className="border border-border px-4 py-2 text-sm text-right">
                        {usage.totalRequests?.toLocaleString() ?? 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}