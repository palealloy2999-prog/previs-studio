import { en, type TranslationKey } from './locales/en';
import { ja } from './locales/ja';

export type Language = 'en' | 'ja';
export function detectLanguage(languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages): Language {
  return languages[0]?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export const language = detectLanguage();
const messages: Record<Language, Record<TranslationKey, string>> = { en, ja };

export function t(key: TranslationKey, values: Record<string, string | number> = {}): string {
  const localized = key.startsWith('help.') || key.startsWith('error.') || key.startsWith('model.');
  const selectedLanguage = localized ? language : 'en';
  return messages[selectedLanguage][key].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}
