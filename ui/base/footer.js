import { LINKS } from '@/utils/constants';
import { SocialLink } from '../components';

export const Footer = () => {
  return (
    <footer>
      <div className="soc">
        <SocialLink link={LINKS.linkedin} icon="linkedin" />
        <SocialLink link={LINKS.github} icon="github" />
      </div>
      <div className="copy">
        © {new Date().getFullYear()} Subfrost. All rights reserved.
      </div>
      <div className="clr" />
    </footer>
  );
};
