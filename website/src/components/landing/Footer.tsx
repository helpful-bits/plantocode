export function Footer() {
  return (
    <footer className="border-t">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-muted-foreground text-sm">
            © 2024 Vibe Manager. All rights reserved.
          </p>
          <div className="flex gap-6">
            <a href="/privacy" className="text-muted-foreground hover:text-foreground text-sm">
              Privacy Policy
            </a>
            <a href="/terms" className="text-muted-foreground hover:text-foreground text-sm">
              Terms of Service
            </a>
            <a href="https://github.com/vibemanager" className="text-muted-foreground hover:text-foreground text-sm">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}