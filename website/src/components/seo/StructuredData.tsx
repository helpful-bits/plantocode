import type { Thing } from 'schema-dts';

interface StructuredDataProps {
  data: Thing;
}

export function StructuredData({ data }: StructuredDataProps) {
  // Ensure @context is always present in JSON-LD
  const dataWithContext: any = data;
  if (!dataWithContext['@context']) {
    dataWithContext['@context'] = 'https://schema.org';
  }

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(dataWithContext),
      }}
      type="application/ld+json"
    />
  );
}