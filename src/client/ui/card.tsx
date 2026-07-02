import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
  /** Optional cover image. `alt` is mandatory — empty alt only for decoration. */
  image?: { src: string; alt: string };
  testId?: string;
}

export function Card({ title, children, image, testId }: CardProps) {
  return (
    <section className="card" data-testid={testId}>
      {image && <img className="card__image" src={image.src} alt={image.alt} loading="lazy" />}
      <div className="card__body">
        {title && <h3 className="card__title">{title}</h3>}
        {children}
      </div>
    </section>
  );
}
