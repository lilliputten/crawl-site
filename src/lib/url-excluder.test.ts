// src/lib/url-excluder.test.ts

import { isUrlExcluded } from './url-excluder';
import { ExcludeRule } from '@/types';

describe('URL Excluder', () => {
  describe('extractUrlPath functionality', () => {
    test('should extract path from full HTTP URL', () => {
      const rules: ExcludeRule[] = [{ mode: 'prefix', string: '/tags/' }];
      expect(isUrlExcluded('http://example.com/tags/react/', rules)).toBe(true);
    });

    test('should extract path from full HTTPS URL', () => {
      const rules: ExcludeRule[] = [{ mode: 'prefix', string: '/admin/' }];
      expect(isUrlExcluded('https://example.com/admin/dashboard', rules)).toBe(true);
    });

    test('should handle URL with query parameters', () => {
      const rules: ExcludeRule[] = [{ mode: 'contains', string: 'session=' }];
      expect(isUrlExcluded('http://example.com/page?session=abc123', rules)).toBe(true);
    });

    test('should handle URL with hash', () => {
      const rules: ExcludeRule[] = [{ mode: 'suffix', string: '#section' }];
      expect(isUrlExcluded('http://example.com/page#section', rules)).toBe(true);
    });

    test('should handle path-only input', () => {
      const rules: ExcludeRule[] = [{ mode: 'prefix', string: '/tags/' }];
      expect(isUrlExcluded('/tags/react/', rules)).toBe(true);
    });

    test('should handle path with query string', () => {
      const rules: ExcludeRule[] = [{ mode: 'contains', string: 'page=' }];
      expect(isUrlExcluded('/articles?page=2', rules)).toBe(true);
    });
  });

  describe('prefix mode', () => {
    const rules: ExcludeRule[] = [{ mode: 'prefix', string: '/tags/' }];

    test('should match URLs starting with the prefix', () => {
      expect(isUrlExcluded('http://localhost:8080/tags/site/', rules)).toBe(true);
      expect(isUrlExcluded('http://localhost:8080/tags/projects/', rules)).toBe(true);
      expect(isUrlExcluded('/tags/about/', rules)).toBe(true);
    });

    test('should not match URLs not starting with the prefix', () => {
      expect(isUrlExcluded('http://localhost:8080/articles/test/', rules)).toBe(false);
      expect(isUrlExcluded('/about/', rules)).toBe(false);
      expect(isUrlExcluded('/', rules)).toBe(false);
    });

    test('should be case-sensitive', () => {
      expect(isUrlExcluded('/Tags/react/', rules)).toBe(false);
      expect(isUrlExcluded('/TAGS/react/', rules)).toBe(false);
    });

    test('should handle URLs with double slashes', () => {
      // Double slashes should still match the prefix
      expect(isUrlExcluded('http://localhost:8080/tags//', rules)).toBe(true);
      expect(isUrlExcluded('http://localhost:8080/tags//react/', rules)).toBe(true);
    });
  });

  describe('suffix mode', () => {
    const pdfRules: ExcludeRule[] = [{ mode: 'suffix', string: '.pdf' }];
    const jpgRules: ExcludeRule[] = [{ mode: 'suffix', string: '.jpg' }];

    test('should match URLs ending with the suffix', () => {
      expect(isUrlExcluded('http://example.com/document.pdf', pdfRules)).toBe(true);
      expect(isUrlExcluded('/files/cv.pdf', pdfRules)).toBe(true);
      expect(isUrlExcluded('http://example.com/image.jpg', jpgRules)).toBe(true);
    });

    test('should not match URLs not ending with the suffix', () => {
      expect(isUrlExcluded('http://example.com/document.pdf.bak', pdfRules)).toBe(false);
      expect(isUrlExcluded('/files/page.html', pdfRules)).toBe(false);
      expect(isUrlExcluded('/files/image.png', jpgRules)).toBe(false);
    });

    test('should handle query parameters before suffix', () => {
      expect(isUrlExcluded('/download.pdf?token=abc', pdfRules)).toBe(false);
    });
  });

  describe('contains mode', () => {
    const sessionRules: ExcludeRule[] = [{ mode: 'contains', string: 'session=' }];
    const apiRules: ExcludeRule[] = [{ mode: 'contains', string: '/api/' }];

    test('should match URLs containing the string', () => {
      expect(isUrlExcluded('http://example.com/page?session=abc123', sessionRules)).toBe(true);
      expect(isUrlExcluded('/api/users', apiRules)).toBe(true);
      expect(isUrlExcluded('http://example.com/api/v1/data', apiRules)).toBe(true);
    });

    test('should not match URLs not containing the string', () => {
      expect(isUrlExcluded('http://example.com/page?token=xyz', sessionRules)).toBe(false);
      expect(isUrlExcluded('/web/users', apiRules)).toBe(false);
    });

    test('should match anywhere in the path', () => {
      expect(isUrlExcluded('/old/session/active', sessionRules)).toBe(false);
      expect(isUrlExcluded('/page?token=xyz&session=abc', sessionRules)).toBe(true);
    });
  });

  describe('exact mode', () => {
    const rules: ExcludeRule[] = [
      { mode: 'exact', string: '/login' },
      { mode: 'exact', string: '/specific-page' },
    ];

    test('should match exact paths', () => {
      expect(isUrlExcluded('http://example.com/login', rules)).toBe(true);
      expect(isUrlExcluded('/login', rules)).toBe(true);
      expect(isUrlExcluded('/specific-page', rules)).toBe(true);
    });

    test('should not match if path has additional segments', () => {
      expect(isUrlExcluded('/login/', rules)).toBe(false);
      expect(isUrlExcluded('/login/redirect', rules)).toBe(false);
      expect(isUrlExcluded('/specific-page?ref=home', rules)).toBe(false);
    });

    test('should not match partial paths', () => {
      expect(isUrlExcluded('/logout', rules)).toBe(false);
      expect(isUrlExcluded('/my-specific-page', rules)).toBe(false);
    });
  });

  describe('regex mode', () => {
    const paginationRules: ExcludeRule[] = [{ mode: 'regex', string: '\\?page=\\d+' }];
    const yearRules: ExcludeRule[] = [{ mode: 'regex', string: '/\\d{4}/' }];

    test('should match URLs matching the regex pattern', () => {
      expect(isUrlExcluded('http://example.com/articles?page=1', paginationRules)).toBe(true);
      expect(isUrlExcluded('/blog?page=99', paginationRules)).toBe(true);
      expect(isUrlExcluded('/articles/2024/post', yearRules)).toBe(true);
      expect(isUrlExcluded('/posts/2025/article', yearRules)).toBe(true);
    });

    test('should not match URLs not matching the regex', () => {
      expect(isUrlExcluded('/articles?page=all', paginationRules)).toBe(false);
      expect(isUrlExcluded('/blog?sort=date', paginationRules)).toBe(false);
      expect(isUrlExcluded('/articles/24/post', yearRules)).toBe(false);
      expect(isUrlExcluded('/posts/twenty-twenty-five/article', yearRules)).toBe(false);
    });

    test('should handle complex regex patterns', () => {
      const complexRules: ExcludeRule[] = [{ mode: 'regex', string: '^/admin(/.*)?$' }];
      expect(isUrlExcluded('/admin', complexRules)).toBe(true);
      expect(isUrlExcluded('/admin/users', complexRules)).toBe(true);
      expect(isUrlExcluded('/admin/settings/profile', complexRules)).toBe(true);
      expect(isUrlExcluded('/administrator', complexRules)).toBe(false);
    });
  });

  describe('multiple rules', () => {
    const multipleRules: ExcludeRule[] = [
      { mode: 'prefix', string: '/admin/' },
      { mode: 'suffix', string: '.pdf' },
      { mode: 'contains', string: 'session=' },
    ];

    test('should exclude if any rule matches', () => {
      expect(isUrlExcluded('/admin/dashboard', multipleRules)).toBe(true);
      expect(isUrlExcluded('/files/doc.pdf', multipleRules)).toBe(true);
      expect(isUrlExcluded('/page?session=abc', multipleRules)).toBe(true);
    });

    test('should not exclude if no rules match', () => {
      expect(isUrlExcluded('/public/page', multipleRules)).toBe(false);
      expect(isUrlExcluded('/files/doc.html', multipleRules)).toBe(false);
      expect(isUrlExcluded('/page?token=xyz', multipleRules)).toBe(false);
    });

    test('should stop at first matching rule', () => {
      // All of these should be excluded by different rules
      expect(isUrlExcluded('/admin/file.pdf?session=x', multipleRules)).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('should return false for empty rules array', () => {
      expect(isUrlExcluded('http://example.com/page', [])).toBe(false);
    });

    test('should return false for null/undefined rules', () => {
      expect(isUrlExcluded('http://example.com/page', null as any)).toBe(false);
      expect(isUrlExcluded('http://example.com/page', undefined as any)).toBe(false);
    });

    test('should handle root path', () => {
      const rules: ExcludeRule[] = [{ mode: 'exact', string: '/' }];
      expect(isUrlExcluded('http://example.com/', rules)).toBe(true);
      expect(isUrlExcluded('/', rules)).toBe(true);
      expect(isUrlExcluded('/page', rules)).toBe(false);
    });

    test('should handle paths without leading slash gracefully', () => {
      const rules: ExcludeRule[] = [{ mode: 'prefix', string: '/tags/' }];
      // Path without leading slash won't match prefix rule starting with /
      expect(isUrlExcluded('tags/react/', rules)).toBe(false);
      // But full URL will work
      expect(isUrlExcluded('http://example.com/tags/react/', rules)).toBe(true);
    });

    test('should handle invalid URLs gracefully', () => {
      const rules: ExcludeRule[] = [{ mode: 'prefix', string: '/test/' }];
      // Should treat as path and add leading slash
      expect(isUrlExcluded('not-a-valid-url', rules)).toBe(false);
    });

    test('should handle URLs with double slashes correctly', () => {
      const rules: ExcludeRule[] = [{ mode: 'prefix', string: '/tags/' }];
      // URLs with double slashes should still be caught by prefix rule
      expect(isUrlExcluded('http://localhost:8080/tags//', rules)).toBe(true);
      expect(isUrlExcluded('http://localhost:8080/path//to///page', rules)).toBe(false);
    });
  });

  describe('real-world scenarios', () => {
    test('should exclude tag pages as in user example', () => {
      const tagRules: ExcludeRule[] = [{ mode: 'prefix', string: '/tags/' }];

      // These should all be excluded
      expect(isUrlExcluded('http://localhost:8080/tags/site/', tagRules)).toBe(true);
      expect(isUrlExcluded('http://localhost:8080/tags/projects/', tagRules)).toBe(true);
      expect(isUrlExcluded('http://localhost:8080/tags/about/', tagRules)).toBe(true);
      expect(isUrlExcluded('http://localhost:8080/tags/contacts/', tagRules)).toBe(true);
      expect(isUrlExcluded('http://localhost:8080/tags/2026/', tagRules)).toBe(true);
      expect(isUrlExcluded('http://localhost:8080/tags/ai/', tagRules)).toBe(true);

      // These should NOT be excluded
      expect(isUrlExcluded('http://localhost:8080/articles/', tagRules)).toBe(false);
      expect(isUrlExcluded('http://localhost:8080/projects/', tagRules)).toBe(false);
    });

    test('should exclude media files', () => {
      const mediaRules: ExcludeRule[] = [
        { mode: 'suffix', string: '.pdf' },
        { mode: 'suffix', string: '.jpg' },
        { mode: 'suffix', string: '.png' },
        { mode: 'suffix', string: '.gif' },
      ];

      expect(isUrlExcluded('http://localhost:8080/cv.pdf', mediaRules)).toBe(true);
      expect(isUrlExcluded('http://localhost:8080/cv-ru.pdf', mediaRules)).toBe(true);
      expect(isUrlExcluded('/images/photo.jpg', mediaRules)).toBe(true);
      expect(isUrlExcluded('/images/logo.png', mediaRules)).toBe(true);
      expect(isUrlExcluded('/articles/post', mediaRules)).toBe(false);
    });

    test('should exclude admin and auth pages', () => {
      const authRules: ExcludeRule[] = [
        { mode: 'prefix', string: '/admin/' },
        { mode: 'prefix', string: '/auth/' },
        { mode: 'prefix', string: '/login' },
      ];

      expect(isUrlExcluded('/admin/dashboard', authRules)).toBe(true);
      expect(isUrlExcluded('/auth/callback', authRules)).toBe(true);
      expect(isUrlExcluded('/login', authRules)).toBe(true);
      expect(isUrlExcluded('/public/page', authRules)).toBe(false);
    });

    test('should handle normalized URLs with double slashes', () => {
      const tagRules: ExcludeRule[] = [{ mode: 'prefix', string: '/tags/' }];
      
      // After normalization, double slashes should be cleaned up
      // But we should still catch them during exclusion check
      expect(isUrlExcluded('http://localhost:8080/tags//', tagRules)).toBe(true);
      expect(isUrlExcluded('http://localhost:8080/tags//projects//', tagRules)).toBe(true);
    });
  });
});
