import type { Thing } from 'schema-dts';

interface StructuredDataProps {
  data: Thing;
}

export function StructuredData({ data }: StructuredDataProps) {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data),
      }}
      type="application/ld+json"
    />
  );
}