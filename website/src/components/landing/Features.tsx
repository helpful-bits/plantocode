import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Parallax } from '@/components/ui/parallax';

interface Feature {
  title: string;
  description: string;
  icon: React.ReactNode;
}

interface FeaturesProps {
  features?: Feature[];
}

const defaultFeatures: Feature[] = [];

export function Features({ features = defaultFeatures }: FeaturesProps) {
  return (
    <section id="features" className="py-16 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Key Features</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Powerful tools designed for large codebase development and AI-assisted workflow optimization
          </p>
        </div>
        
        <Parallax speed={-10}>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <CardHeader className="text-center">
                  <div className="text-4xl mb-4">{feature.icon}</div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-center">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Parallax>
      </div>
    </section>
  );
}