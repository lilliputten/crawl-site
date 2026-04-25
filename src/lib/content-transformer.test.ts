// src/lib/content-transformer.test.ts

import { transformContent } from './content-transformer';
import { ContentTransformRule } from '@/types';

describe('ContentTransformer', () => {
  describe('transformContent', () => {
    it('should return original content when no rules provided', () => {
      const content = 'Hello World';
      const result = transformContent(content, []);
      expect(result).toBe(content);
    });

    it('should apply simple string replacement', () => {
      const content = 'Часто задаваемы вопросы и ответы';
      const rules: ContentTransformRule[] = [
        {
          find: 'Часто задаваемы вопросы',
          replace: 'Часто задаваемые вопросы',
        },
      ];
      const result = transformContent(content, rules);
      expect(result).toBe('Часто задаваемые вопросы и ответы');
    });

    it('should replace all occurrences of a string', () => {
      const content = 'foo bar foo baz foo';
      const rules: ContentTransformRule[] = [
        {
          find: 'foo',
          replace: 'qux',
        },
      ];
      const result = transformContent(content, rules);
      expect(result).toBe('qux bar qux baz qux');
    });

    it('should apply regex replacement with flags', () => {
      const content = 'HTTP://example.com and http://test.com';
      const rules: ContentTransformRule[] = [
        {
          find: 'http://',
          replace: 'https://',
          isRegex: true,
          flags: 'gi',
        },
      ];
      const result = transformContent(content, rules);
      expect(result).toBe('https://example.com and https://test.com');
    });

    it('should apply multiple rules in order', () => {
      const content = 'foo bar baz';
      const rules: ContentTransformRule[] = [
        {
          find: 'foo',
          replace: 'qux',
        },
        {
          find: 'bar',
          replace: 'quux',
        },
      ];
      const result = transformContent(content, rules);
      expect(result).toBe('qux quux baz');
    });

    it('should handle regex patterns correctly', () => {
      const content = '<!-- DEBUG: test --> some content <!-- DEBUG: another -->';
      const rules: ContentTransformRule[] = [
        {
          find: '<!-- DEBUG:.*?-->',
          replace: '',
          isRegex: true,
          flags: 'g',
        },
      ];
      const result = transformContent(content, rules);
      expect(result).toBe(' some content ');
    });

    it('should preserve content when transformation fails', () => {
      const content = 'Test content';
      const rules: ContentTransformRule[] = [
        {
          find: '[invalid(regex',
          replace: 'replacement',
          isRegex: true,
        },
      ];
      // Should not throw error and should return original content
      const result = transformContent(content, rules);
      expect(result).toBe(content);
    });

    it('should handle undefined/null rules gracefully', () => {
      const content = 'Test content';
      const result1 = transformContent(content, null as any);
      expect(result1).toBe(content);

      const result2 = transformContent(content, undefined as any);
      expect(result2).toBe(content);
    });
  });
});
