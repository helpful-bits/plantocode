interface Processor {
  name: string;
  purpose: string;
  regions: string;
  dataUsage?: string;
  links: {
    privacy: string;
    terms?: string;
    dpa?: string;
  };
  euTransferSafeguards?: string;
}

const processors: Processor[] = [
  {
    name: 'Stripe',
    purpose: 'Payment processing services',
    regions: 'United States, European Union',
    links: {
      privacy: 'https://stripe.com/privacy',
      terms: 'https://stripe.com/terms',
      dpa: 'https://stripe.com/legal/dpa'
    },
    euTransferSafeguards: 'EU operations processed in-region; for transfers to the US, Data Privacy Framework participation and Standard Contractual Clauses with supplementary measures'
  },
  {
    name: 'OpenAI',
    purpose: 'AI model processing and natural language understanding',
    regions: 'United States',
    dataUsage: 'Training disabled where available and contractually restricted to service provision',
    links: {
      privacy: 'https://openai.com/policies/privacy-policy',
      terms: 'https://openai.com/policies/terms-of-use',
      dpa: 'https://openai.com/policies/data-processing-addendum'
    },
    euTransferSafeguards: 'Standard Contractual Clauses with supplementary measures'
  },
  {
    name: 'Google AI/Gemini',
    purpose: 'AI model processing and natural language understanding',
    regions: 'United States',
    dataUsage: 'Training disabled where available and contractually restricted to service provision',
    links: {
      privacy: 'https://policies.google.com/privacy',
      terms: 'https://policies.google.com/terms',
      dpa: 'https://cloud.google.com/terms/data-processing-addendum'
    },
    euTransferSafeguards: 'Standard Contractual Clauses with supplementary measures'
  },
  {
    name: 'xAI',
    purpose: 'AI model processing and natural language understanding',
    regions: 'United States',
    dataUsage: 'Training disabled where available and contractually restricted to service provision',
    links: {
      privacy: 'https://x.ai/legal/privacy-policy',
      terms: 'https://x.ai/legal/terms-of-service'
    },
    euTransferSafeguards: 'Standard Contractual Clauses with supplementary measures'
  },
  {
    name: 'OpenRouter',
    purpose: 'AI routing and processing services',
    regions: 'United States',
    dataUsage: 'Training disabled where available and contractually restricted to service provision',
    links: {
      privacy: 'https://openrouter.ai/privacy',
      terms: 'https://openrouter.ai/terms'
    },
    euTransferSafeguards: 'Standard Contractual Clauses with supplementary measures'
  },
  {
    name: 'Vercel',
    purpose: 'Web hosting and edge infrastructure',
    regions: 'Global (with EU data residency options)',
    links: {
      privacy: 'https://vercel.com/legal/privacy-policy',
      terms: 'https://vercel.com/legal/terms',
      dpa: 'https://vercel.com/legal/dpa'
    },
    euTransferSafeguards: 'Standard Contractual Clauses, EU data residency available'
  },
  {
    name: 'Amazon Web Services (AWS)',
    purpose: 'Desktop application hosting and content delivery (CloudFront CDN and S3 storage)',
    regions: 'Global (with regional data residency options)',
    links: {
      privacy: 'https://aws.amazon.com/privacy/',
      terms: 'https://aws.amazon.com/service-terms/',
      dpa: 'https://aws.amazon.com/compliance/gdpr-center/'
    },
    euTransferSafeguards: 'Standard Contractual Clauses, EU data residency available, enterprise security standards'
  },
  {
    name: 'Auth0',
    purpose: 'Authentication and identity management services',
    regions: 'United States, European Union',
    links: {
      privacy: 'https://auth0.com/privacy',
      terms: 'https://auth0.com/terms',
      dpa: 'https://auth0.com/docs/compliance/gdpr/data-processing-agreement'
    },
    euTransferSafeguards: 'Standard Contractual Clauses, EU data residency available'
  },
  {
    name: 'Mailgun',
    purpose: 'Transactional email delivery services',
    regions: 'United States, European Union',
    links: {
      privacy: 'https://www.mailgun.com/legal/privacy-policy/',
      terms: 'https://www.mailgun.com/legal/terms/',
      dpa: 'https://www.mailgun.com/legal/dpa/'
    },
    euTransferSafeguards: 'Standard Contractual Clauses with supplementary measures'
  }
];

interface SubprocessorsListProps {
  region: 'eu' | 'us';
}

export default function SubprocessorsList({ region }: SubprocessorsListProps) {
  return (
    <div className="space-y-6">
      {processors.map((processor) => (
        <div key={processor.name} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-2">{processor.name}</h3>
          <p><strong>Purpose:</strong> {processor.purpose}</p>
          <p><strong>Data Processing Regions:</strong> {processor.regions}</p>
          {processor.dataUsage && (
            <p><strong>Data Usage:</strong> {processor.dataUsage}</p>
          )}
          
          <div className="mt-2 space-y-1">
            <p><strong>Legal Documents:</strong></p>
            <ul className="list-disc list-inside text-sm space-y-1 ml-4">
              <li>
                <a href={processor.links.privacy} target="_blank" rel="noopener noreferrer" className="link-primary">
                  Privacy Policy
                </a>
              </li>
              {processor.links.terms && (
                <li>
                  <a href={processor.links.terms} target="_blank" rel="noopener noreferrer" className="link-primary">
                    Terms of Service
                  </a>
                </li>
              )}
              {processor.links.dpa && (
                <li>
                  <a href={processor.links.dpa} target="_blank" rel="noopener noreferrer" className="link-primary">
                    Data Processing Agreement
                  </a>
                </li>
              )}
            </ul>
          </div>
          
          {region === 'eu' && processor.euTransferSafeguards && (
            <p className="mt-2"><strong>Transfer Safeguards:</strong> {processor.euTransferSafeguards}</p>
          )}
        </div>
      ))}
    </div>
  );
}