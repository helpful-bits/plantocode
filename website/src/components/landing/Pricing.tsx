import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface PricingTier {
  name: string;
  price: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  buttonText?: string;
  buttonVariant?: 'default' | 'outline' | 'secondary';
}

interface PricingProps {
  tiers?: PricingTier[];
}

const defaultTiers: PricingTier[] = [];

export function Pricing({ tiers = defaultTiers }: PricingProps) {
  return (
    <section id="pricing" className="py-16 px-4 bg-secondary/50">
      <div className="container mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Simple, Transparent Pricing</h2>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
            No subscriptions. No hidden fees. Pay only for AI usage with transparent processing fees.
          </p>
          <div className="mt-6">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-secondary text-secondary-foreground text-lg font-medium">
              No Subscriptions - Usage-Based Only
            </div>
          </div>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {tiers.map((tier, index) => (
            <Card key={index} className={`relative ${tier.highlighted ? 'border-primary shadow-lg scale-105' : ''}`}>
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <div className="bg-primary text-primary-foreground text-sm py-1 px-3 rounded-full font-medium">
                    Most Popular
                  </div>
                </div>
              )}
              <CardHeader className="text-center">
                <CardTitle className="text-xl">{tier.name}</CardTitle>
                <CardDescription className="text-base">{tier.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <div className="mb-6">
                  <span className="text-3xl font-bold">{tier.price}</span>
                  {tier.name === "Free Credits" && (
                    <p className="text-sm text-muted-foreground mt-2">30-day expiration</p>
                  )}
                  {tier.name === "Paid Credits" && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Processing fees apply to credit purchases
                    </p>
                  )}
                  {tier.name === "Enterprise" && (
                    <p className="text-sm text-muted-foreground mt-2">Volume pricing available</p>
                  )}
                </div>
                <ul className="space-y-3 mb-6 text-sm text-left">
                  {tier.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  variant={tier.buttonVariant || (tier.highlighted ? "default" : "outline")}
                  className="w-full"
                  size="lg"
                >
                  {tier.buttonText || "Get Started"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="mt-12 text-center">
          <div className="bg-muted rounded-lg p-6 max-w-4xl mx-auto">
            <h3 className="text-xl font-semibold mb-4">Processing Fee Structure</h3>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="bg-background rounded-lg p-4">
                <div className="text-2xl font-bold text-orange-600">20%</div>
                <div className="text-muted-foreground">Under $30</div>
              </div>
              <div className="bg-background rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-600">10%</div>
                <div className="text-muted-foreground">$30 - $300</div>
              </div>
              <div className="bg-background rounded-lg p-4">
                <div className="text-2xl font-bold text-green-600">5%</div>
                <div className="text-muted-foreground">Over $300</div>
              </div>
            </div>
            <p className="text-muted-foreground mt-4">
              Processing fees only apply to credit purchases, not AI usage itself. Purchase range: $0.01 to $10,000.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}