interface StructuredDataProps {
  data: any;
}

/**
 * Validates that an FAQ item has the required fields
 */
function hasRequiredFAQ(item: any): boolean {
  return !!(
    item &&
    item['@type'] === 'Question' &&
    item.name &&
    typeof item.name === 'string' &&
    item.name.trim() !== '' &&
    item.acceptedAnswer &&
    item.acceptedAnswer['@type'] === 'Answer' &&
    item.acceptedAnswer.text &&
    typeof item.acceptedAnswer.text === 'string' &&
    item.acceptedAnswer.text.trim() !== ''
  );
}

/**
 * Validates and sanitizes schema objects to prevent invalid JSON-LD emission
 */
function sanitizeSchema(schema: any): any | null {
  if (!schema || typeof schema !== 'object') {
    return null;
  }

  const type = schema['@type'];

  // Validate FAQPage
  if (type === 'FAQPage') {
    if (!schema.mainEntity || !Array.isArray(schema.mainEntity)) {
      return null;
    }

    // Filter out invalid FAQ items
    const validItems = schema.mainEntity.filter(hasRequiredFAQ);

    // If no valid items remain, return null
    if (validItems.length === 0) {
      return null;
    }

    return {
      ...schema,
      mainEntity: validItems
    };
  }

  // Validate VideoObject
  if (type === 'VideoObject') {
    const requiredFields = ['name', 'description', 'thumbnailUrl', 'uploadDate'];
    const hasAllRequired = requiredFields.every(field => {
      const value = schema[field];
      return value && typeof value === 'string' && value.trim() !== '';
    });

    if (!hasAllRequired) {
      return null;
    }
  }

  // Validate Organization
  if (type === 'Organization') {
    if (!schema.name || typeof schema.name !== 'string' || schema.name.trim() === '') {
      return null;
    }
  }

  // Validate SoftwareApplication
  if (type === 'SoftwareApplication') {
    if (!schema.name || typeof schema.name !== 'string' || schema.name.trim() === '') {
      return null;
    }
  }

  // Validate @graph arrays
  if (schema['@graph'] && Array.isArray(schema['@graph'])) {
    const validGraphItems = schema['@graph']
      .map((item: any) => sanitizeSchema(item))
      .filter((item: any) => item !== null);

    if (validGraphItems.length === 0) {
      return null;
    }

    return {
      ...schema,
      '@graph': validGraphItems
    };
  }

  return schema;
}

export function StructuredData({ data }: StructuredDataProps) {
  // Sanitize and validate the schema
  const sanitizedData = sanitizeSchema(data);

  // Return null if the schema is invalid
  if (!sanitizedData) {
    return null;
  }

  // Ensure @context is present
  const structuredData = {
    '@context': 'https://schema.org',
    ...sanitizedData
  };

  // If data contains @graph, don't duplicate @context
  if (sanitizedData['@graph']) {
    structuredData['@context'] = sanitizedData['@context'] || 'https://schema.org';
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}