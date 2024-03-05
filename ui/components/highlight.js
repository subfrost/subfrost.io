import Image from 'next/image';

export const LanguageHighlight = ({ src, size, children }) => (
  <div className="name">
    <Image
      src={src}
      alt={`image ${children ?? 'from angello'}`}
      width={size ?? 18}
      height={size ?? 18}
    />
    <span>{children}</span>
  </div>
);

export const TechnologyHighlight = ({ src, size, children, description }) => (
  <div className="service-item">
    <div className="flex">
      <Image
        src={src}
        alt={`image ${children ?? 'from angello'}`}
        width={size ?? 30}
        height={size ?? 30}
      />
      <div className="name">{children}</div>
    </div>
    <p>{description}</p>
  </div>
);
