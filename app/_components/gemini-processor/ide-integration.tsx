import { Button } from '@/components/ui/button';
import { ExternalLink, Code } from 'lucide-react';

interface IdeIntegrationProps {
  filePath: string;
}

export function IdeIntegration({ filePath }: IdeIntegrationProps) {
  const handleOpenInIde = async () => {
    try {
      // Call an API endpoint to open the file in the system's default IDE
      const response = await fetch('/api/open-in-ide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to open in IDE');
      }
    } catch (err) {
      console.error('Failed to open file in IDE:', err);
      // Fallback - create a download link
      const link = document.createElement('a');
      link.href = `/api/download-patch?path=${encodeURIComponent(filePath)}`;
      link.download = filePath.split('/').pop() || 'patch-file.patch';
      link.click();
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="flex items-center gap-1 text-xs"
      onClick={handleOpenInIde}
    >
      <Code className="h-3 w-3" />
      <span>Open in IDE</span>
      <ExternalLink className="h-3 w-3 ml-1" />
    </Button>
  );
}
