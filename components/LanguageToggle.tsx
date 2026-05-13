'use client';

import { useLanguage } from '@/context/LanguageContext';

interface LanguageToggleProps {
  className?: string;
  variant?: 'light' | 'dark';
}

export default function LanguageToggle({ className = '', variant = 'light' }: LanguageToggleProps) {
  const { locale, toggleLocale } = useLanguage();
  const isZh = locale === 'zh';

  // Mirrors subfrost-app's LanguageToggle palette:
  //   light theme  → active #284372 (sf-primary), muted #6b7280 (sf-muted)
  //   dark theme   → active #5b9cff (sf-primary), muted #7a8ba8 (sf-muted)
  const activeColor = variant === 'dark' ? 'text-[#5b9cff]' : 'text-[#284372]';
  const inactiveColor = variant === 'dark' ? 'text-[#7a8ba8]' : 'text-[#6b7280]';

  return (
    <button
      type="button"
      onClick={toggleLocale}
      className={`text-base font-bold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none leading-none ${
        isZh ? activeColor : inactiveColor
      } ${className}`}
      aria-label={`Switch to ${isZh ? 'English' : 'Chinese'}`}
    >
      文
    </button>
  );
}
