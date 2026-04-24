import { describe, expect, it } from 'vitest';
import { renderTemplate, validateTemplateSource } from '../../src/services/notifications/render.js';

describe('notification renderer', () => {
  it('substitutes variables', () => {
    const out = renderTemplate(
      { subject: 'Hi {{name}}', bodyHtml: '<p>{{name}}</p>', bodyText: '{{name}}' },
      { name: 'Ada' },
    );
    expect(out.subject).toBe('Hi Ada');
    expect(out.html).toBe('<p>Ada</p>');
    expect(out.text).toBe('Ada');
  });

  it('fails closed on missing variable', () => {
    expect(() =>
      renderTemplate(
        { subject: 'Hi {{name}}', bodyHtml: '', bodyText: '' },
        {},
      ),
    ).toThrow();
  });

  it('html-escapes variables in body_html but not body_text', () => {
    const out = renderTemplate(
      { subject: 's', bodyHtml: '<p>{{x}}</p>', bodyText: '{{x}}' },
      { x: '<script>alert(1)</script>' },
    );
    expect(out.html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(out.text).toBe('<script>alert(1)</script>');
  });

  it('supports formatDateTime helper', () => {
    const out = renderTemplate(
      { subject: '{{formatDateTime iso "America/New_York"}}', bodyHtml: '', bodyText: '' },
      { iso: '2026-04-13T18:00:00Z' },
    );
    expect(out.subject).toMatch(/2026/);
    expect(out.subject).toMatch(/2:00/); // 18:00Z is 14:00 America/New_York
  });

  it('uppercase helper works', () => {
    const out = renderTemplate(
      { subject: '{{uppercase name}}', bodyHtml: '', bodyText: '' },
      { name: 'ada' },
    );
    expect(out.subject).toBe('ADA');
  });

  it('validates editable templates with strict rendering', () => {
    expect(() =>
      validateTemplateSource(
        { subject: 'Hi {{name}}', bodyHtml: '<p>{{name}}</p>', bodyText: '{{name}}' },
        { name: 'Ada' },
      ),
    ).not.toThrow();

    expect(() =>
      validateTemplateSource(
        { subject: 'Hi {{missing}}', bodyHtml: '<p>{{name}}</p>', bodyText: '{{name}}' },
        { name: 'Ada' },
      ),
    ).toThrow();
  });
});
