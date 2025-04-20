import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json(
        { error: 'XML content is required' },
        { status: 400 }
      );
    }

    // Try to detect the XML format based on root elements or namespaces
    const format = detectXmlFormat(content);

    return NextResponse.json({ format });
  } catch (error) {
    console.error('Error detecting XML format:', error);
    return NextResponse.json(
      { error: 'Failed to detect format: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

function detectXmlFormat(xmlContent: string): string {
  // Check for common XML root elements to determine format
  if (xmlContent.includes('<FMPXMLRESULT')) {
    return 'FileMaker';
  } else if (xmlContent.includes('<workbook') && xmlContent.includes('xmlns="urn:schemas-microsoft-com:office:spreadsheet"')) {
    return 'Excel XML';
  } else if (xmlContent.includes('<kml') || xmlContent.includes('xmlns="http://www.opengis.net/kml/')) {
    return 'KML';
  } else if (xmlContent.includes('<gpx') || xmlContent.includes('xmlns="http://www.topografix.com/GPX/')) {
    return 'GPX';
  } else if (xmlContent.includes('<svg')) {
    return 'SVG';
  } else if (xmlContent.includes('<rss')) {
    return 'RSS';
  } else if (xmlContent.includes('<feed xmlns="http://www.w3.org/2005/Atom"')) {
    return 'Atom';
  } else if (xmlContent.includes('<!DOCTYPE html>') || xmlContent.includes('<html')) {
    return 'HTML/XHTML';
  } else if (xmlContent.includes('<Relationships') && xmlContent.includes('xmlns="http://schemas.openxmlformats.org')) {
    return 'Office Open XML';
  } else if (xmlContent.includes('<office:document') || xmlContent.includes('xmlns:office="urn:oasis:names:tc:opendocument:')) {
    return 'OpenDocument';
  } else {
    // Generic fallback
    return 'Generic XML';
  }
} 