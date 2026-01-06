import Image from 'next/image';
import { cdnUrl } from '@/lib/cdn';
import { cn } from '@/lib/utils';

interface DocsMediaBlockProps {
  title?: string;
  description?: string;
  imageSrc?: string;
  imageAlt?: string;
  videoSrc?: string;
  posterSrc?: string;
  caption?: string;
  className?: string;
}

export function DocsMediaBlock({
  title,
  description,
  imageSrc,
  imageAlt,
  videoSrc,
  posterSrc,
  caption,
  className,
}: DocsMediaBlockProps) {
  const resolvedImageSrc = typeof imageSrc === 'string' && imageSrc.trim().length > 0
    ? cdnUrl(imageSrc)
    : null;
  const resolvedVideoSrc = typeof videoSrc === 'string' && videoSrc.trim().length > 0
    ? cdnUrl(videoSrc)
    : null;
  const resolvedPosterSrc = typeof posterSrc === 'string' && posterSrc.trim().length > 0
    ? cdnUrl(posterSrc)
    : undefined;
  const resolvedTitle = typeof title === 'string' ? title : '';
  const resolvedDescription = typeof description === 'string' ? description : '';
  const resolvedCaption = typeof caption === 'string' ? caption : '';
  const resolvedAlt = typeof imageAlt === 'string' ? imageAlt : '';

  if (!resolvedImageSrc && !resolvedVideoSrc) {
    return null;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {(resolvedTitle || resolvedDescription) ? (
        <div className="space-y-2">
          {resolvedTitle ? (
            <h3 className="text-lg font-semibold">{resolvedTitle}</h3>
          ) : null}
          {resolvedDescription ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {resolvedDescription}
            </p>
          ) : null}
        </div>
      ) : null}

      {resolvedImageSrc ? (
        <figure className="space-y-3">
          <div className="relative overflow-hidden rounded-xl border border-border/40 bg-background/60">
            <Image
              src={resolvedImageSrc}
              alt={resolvedAlt}
              width={1600}
              height={900}
              className="h-auto w-full"
            />
          </div>
          {resolvedCaption ? (
            <figcaption className="text-xs text-muted-foreground">
              {resolvedCaption}
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      {resolvedVideoSrc ? (
        <figure className="space-y-3">
          <div className="relative overflow-hidden rounded-xl border border-border/40 bg-background/60">
            <video
              className="h-auto w-full"
              controls
              preload="metadata"
              poster={resolvedPosterSrc}
            >
              <source src={resolvedVideoSrc} type="video/mp4" />
            </video>
          </div>
          {resolvedCaption ? (
            <figcaption className="text-xs text-muted-foreground">
              {resolvedCaption}
            </figcaption>
          ) : null}
        </figure>
      ) : null}
    </div>
  );
}
