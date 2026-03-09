import { useAppStore } from '@/stores/appStore';
import zh from './zh';
import en from './en';

export type Translations = typeof zh;
export type Language = 'zh' | 'en';

export const translations: Record<Language, Translations> = { zh, en };

export function useT(): Translations {
  const settings = useAppStore((s) => s.settings);
  const lang: Language = (settings?.ui?.language as Language) ?? 'zh';
  return translations[lang] ?? zh;
}
