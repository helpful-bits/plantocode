interface StructuredDataProps {
  data: any;
}

export function StructuredData({ data }: StructuredDataProps) {
  // Ensure @context is present
  const structuredData = {
    '@context': 'https://schema.org',
    ...data
  };

  // If data contains @graph, don't duplicate @context
  if (data['@graph']) {
    structuredData['@context'] = data['@context'] || 'https://schema.org';
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}