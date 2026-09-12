import { describe, expect, it } from 'vitest';
import { detectLanguage, t } from '../src/i18n';

describe('browser language detection', () => {
  it('uses Japanese when the primary browser language is Japanese', () => {
    expect(detectLanguage(['ja-JP', 'en-US'])).toBe('ja');
  });

  it('uses English for other primary languages', () => {
    expect(detectLanguage(['en-US', 'ja-JP'])).toBe('en');
    expect(detectLanguage(['fr-FR'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });

  it('keeps editing labels in English', () => {
    expect(t('top.new')).toBe('New');
    expect(t('section.timeline')).toBe('TIMELINE');
  });
});
