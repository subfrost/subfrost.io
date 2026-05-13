'use client';

import en from '@/i18n/en';
import { useTranslation } from '@/hooks/useTranslation';

interface StableTextProps {
  textKey: string;
}

// Sizes to the English translation so locale changes don't reflow the button.
export default function StableText({ textKey }: StableTextProps) {
  const { t } = useTranslation();
  const enText = en[textKey] ?? textKey;

  return (
    <span className="relative inline-block whitespace-nowrap">
      <span aria-hidden className="invisible">{enText}</span>
      <span className="absolute inset-0 flex items-center justify-center">{t(textKey)}</span>
    </span>
  );
}
