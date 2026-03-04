/**
 * Unit tests for html-builder utilities.
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import { buildHelperUrl } from '../src/html-builder';
import { DEFAULT_SETTINGS } from '../src/settings';

describe('buildHelperUrl.wrapDocument', () => {
  it('produces a complete HTML document', () => {
    const html = buildHelperUrl.wrapDocument('<p>Hello</p>', 'Test Note', DEFAULT_SETTINGS);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<p>Hello</p>');
    expect(html).toContain('Test Note');
  });

  it('escapes special characters in the title', () => {
    const html = buildHelperUrl.wrapDocument('', '<script>alert(1)</script>', DEFAULT_SETTINGS);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('hides frontmatter when includeYamlFrontmatter is false', () => {
    const settings = { ...DEFAULT_SETTINGS, includeYamlFrontmatter: false };
    const html = buildHelperUrl.wrapDocument('', 'Note', settings);
    expect(html).toContain('display: none');
  });
});

describe('buildHelperUrl.toIntentUrl', () => {
  it('produces a valid obsidian-print-helper URL', () => {
    const url = buildHelperUrl.toIntentUrl('base64data==', DEFAULT_SETTINGS);
    expect(url).toMatch(/^obsidian-print-helper:\/\/print/);
    expect(url).toContain('html=');
    expect(url).toContain('settings=');
  });
});
