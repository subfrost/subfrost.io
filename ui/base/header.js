'use client';
import { LINKS } from '@/utils/constants';
import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  { text: 'GitHub', type: 'lnk', link: LINKS.github },
  { text: 'Twitter', type: 'lnk', link: LINKS.twitter }
  // { text: 'Docs', type: 'lnk' },
  // { text: 'Whitepaper', type: 'btn' }
];

export const Header = () => {
  const [toggle, setToggle] = useState(false);
  useEffect(() => {
    window.addEventListener('scroll', () => {
      const sections = document.querySelectorAll('.section_');
      const navLi = document.querySelectorAll('.top-menu li');
      let current = '';
      sections.forEach((section) => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (window.scrollY >= sectionTop - sectionHeight / 3) {
          current = section.getAttribute('id');
        }
      });

      navLi.forEach((li) => {
        if (current !== null) {
          li.classList.remove('active');
        }
        if (
          li.getElementsByTagName('a')[0].getAttribute('href') == `#${current}`
        ) {
          li.classList.add('active');
        }
      });
    });
  }, []);

  const onClick = (e) => {
    e.preventDefault();
    document.querySelector('body').classList.toggle('loaded');
    setToggle(!toggle);
  };

  return (
    <header className={toggle ? 'active' : ''}>
      <div className="head-top">
        <a href="#" className="menu-btn" onClick={(e) => onClick(e)}>
          <span />
        </a>
        <div className="top-menu">
          <ul>
            {NAV_ITEMS.map(({ text, type }, i) => (
              <li key={`nav-${i}`}>
                <a
                  href={
                    text === 'Twitter'
                      ? 'https://x.com/@bc1SUBFROST'
                      : text === 'GitHub'
                        ? 'https://github.com/subfrost'
                        : '#'
                  }
                  className={type}
                >
                  {text}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </header>
  );
};
