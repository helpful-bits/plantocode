interface CallToActionProps {
  title: string;
  description: string;
  buttonText: string;
  buttonLink: string;
}

export function CallToAction({ title, description, buttonText, buttonLink }: CallToActionProps) {
  return (
    <section className="py-16 px-4 bg-primary/10">
      <div className="container mx-auto text-center">
        <h2 className="text-3xl font-bold mb-4">{title}</h2>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          {description}
        </p>
        <a
          href={buttonLink}
          className="inline-block px-8 py-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium text-lg"
        >
          {buttonText}
        </a>
      </div>
    </section>
  );
}