export const OnePageLink = ({ href, children, target }) => (
  <a
    href={href}
    style={{ textDecoration: 'underline' }}
    data-text={children}
    target={target ? target : '_self'}
  >
    {children}
  </a>
);
