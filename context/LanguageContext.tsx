'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { setLocaleCookie, LOCALE_COOKIE } from '@/lib/i18n/cookie';

export type Locale = 'en' | 'zh';

type LanguageContextType = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({
  children,
  initialLocale = 'en',
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const router = useRouter();

  const setLocale = useCallback(
    (newLocale: Locale) => {
      setLocaleState(newLocale);
      setLocaleCookie(newLocale);
      // Mirror into localStorage for backward compatibility (cookie is authoritative).
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LOCALE_COOKIE, newLocale);
      }
      // Re-render server components (e.g. article pages) with the new locale.
      router.refresh();
    },
    [router],
  );

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'en' ? 'zh' : 'en');
  }, [locale, setLocale]);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, toggleLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
