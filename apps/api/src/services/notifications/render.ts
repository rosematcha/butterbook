import Handlebars from 'handlebars';

// Compile templates with strict mode so a missing variable throws rather than
// silently rendering empty. Subscribers rely on that to fail loudly when the
// event payload shape drifts away from what a template expects.
const compileOpts: CompileOptions = { strict: true, noEscape: false };

// Text bodies skip escaping — HTML-escaped copy in a plain-text email is noise.
const compileOptsText: CompileOptions = { strict: true, noEscape: true };

// Isolated Handlebars environment so helper registration doesn't leak into the
// global Handlebars singleton (or get overwritten by other callers).
const hb = Handlebars.create();

hb.registerHelper('uppercase', (s: unknown) => (typeof s === 'string' ? s.toUpperCase() : ''));
// ISO → locale-formatted datetime in the supplied zone; unknown zones fall back
// to UTC. Used by templates that want "scheduledAtLocal" style output.
hb.registerHelper('formatDateTime', (iso: unknown, tz: unknown) => {
  if (typeof iso !== 'string') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const zone = typeof tz === 'string' && tz.length > 0 ? tz : 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: zone,
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(d);
  }
});

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface TemplateSource {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export function renderTemplate(src: TemplateSource, vars: Record<string, unknown>): RenderedTemplate {
  const subject = hb.compile(src.subject, compileOptsText)(vars);
  const html = hb.compile(src.bodyHtml, compileOpts)(vars);
  const text = hb.compile(src.bodyText, compileOptsText)(vars);
  return { subject, html, text };
}
