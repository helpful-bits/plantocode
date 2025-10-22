import { Mail, MessageCircle } from 'lucide-react';
import { Button } from '@/ui/button';
import { open } from '@tauri-apps/plugin-shell';

export default function FeedbackPage() {
  const handleSendFeedback = async () => {
    await open('mailto:feedback@plantocode.com?subject=PlanToCode%20Feedback');
  };

  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <div className="max-w-lg w-full text-center">
        <div className="flex justify-center mb-6">
          <MessageCircle className="h-20 w-20 text-primary" />
        </div>

        <h1 className="text-3xl font-bold mb-3">Send Us Your Feedback</h1>

        <p className="text-muted-foreground text-lg mb-8">
          We'd love to hear from you! Share your thoughts, suggestions, or report any issues.
        </p>

        <Button
          onClick={handleSendFeedback}
          size="lg"
          className="min-w-[280px]"
        >
          <Mail className="mr-2 h-5 w-5" />
          Email feedback@plantocode.com
        </Button>

        <p className="text-sm text-muted-foreground mt-6">
          Clicking this button will open your default email client with our feedback address pre-filled.
        </p>
      </div>
    </div>
  );
}
