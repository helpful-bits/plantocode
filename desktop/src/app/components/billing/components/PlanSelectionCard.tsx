import { Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
import { Badge } from '@/ui/badge';
import { formatUsdCurrency } from '@/utils/currency-utils';
import type { SubscriptionPlan } from '@/types/tauri-commands';

interface PlanSelectionCardProps {
  plan: SubscriptionPlan;
  isCurrentPlan: boolean;
  isSelected: boolean;
  onClick: () => void;
}

export function PlanSelectionCard({
  plan,
  isCurrentPlan,
  isSelected,
  onClick
}: PlanSelectionCardProps) {
  return (
    <Card 
      className={`cursor-pointer transition-all duration-200 border-2 hover:shadow-md ${
        isSelected 
          ? 'border-primary shadow-lg' 
          : isCurrentPlan
          ? 'border-green-500'
          : 'border-border hover:border-primary/50'
      }`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      aria-label={`Select ${plan.name} plan - ${plan.description}`}
    >
      <CardHeader className="text-center">
        <CardTitle className="text-lg">{plan.name}</CardTitle>
        <div className="space-y-1">
          <div className="text-3xl font-bold">
            {formatUsdCurrency(Number(plan.monthlyPrice))}
          </div>
          <div className="text-sm text-muted-foreground">
            per month
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{plan.description}</p>
        
        {isCurrentPlan && (
          <Badge variant="secondary" className="mx-auto">
            Current Plan
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}