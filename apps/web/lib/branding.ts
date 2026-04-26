'use client';
import { useEffect } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiGet } from './api';

export type BrandingFont = 'system' | 'serif' | 'sans' | 'mono';
export type BrandingRadius = 'none' | 'small' | 'medium' | 'large' | 'full';
export type BrandingCardRadius = 'none' | 'small' | 'medium' | 'large';
export type BrandingCardShadow = 'none' | 'small' | 'medium' | 'large';

export interface ThemeTokens {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: BrandingFont;
  buttonRadius?: BrandingRadius;
  cardRadius?: BrandingCardRadius;
  cardShadow?: BrandingCardShadow;
}

export interface BrandingPayload {
  data: {
    id: string;
    name: string;
    publicSlug: string;
    logoUrl: string | null;
    theme: ThemeTokens;
  };
}

export function useBrandingQuery(orgId: string | null): UseQueryResult<BrandingPayload> {
  return useQuery({
    queryKey: ['branding', orgId],
    queryFn: () => apiGet<BrandingPayload>(`/api/v1/orgs/${orgId}/branding`),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
}

/** "#da4599" → "218 69 153" (space-separated RGB for use with rgb(var()/<a>)). */
function hexToRgbTuple(hex: string | undefined | null): string | null {
  if (!hex) return null;
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Relative luminance (WCAG). Used to pick readable text on a colored bg. */
function luminanceFromTuple(rgb: string): number {
  const [r, g, b] = rgb.split(' ').map(Number) as [number, number, number];
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const FONT_STACK: Record<BrandingFont, string> = {
  system: 'ui-sans-serif, system-ui, sans-serif',
  sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
  serif: 'Fraunces, ui-serif, Georgia, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const BUTTON_RADIUS: Record<BrandingRadius, string> = {
  none: '0',
  small: '4px',
  medium: '8px',
  large: '14px',
  full: '9999px',
};

const CARD_RADIUS: Record<BrandingCardRadius, string> = {
  none: '0',
  small: '4px',
  medium: '8px',
  large: '16px',
};

const CARD_SHADOW: Record<BrandingCardShadow, string> = {
  none: 'none',
  small: '0 1px 2px rgba(0,0,0,0.05)',
  medium: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
  large: '0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)',
};

/**
 * Apply theme tokens as CSS custom properties on an element (default: <html>).
 * Can be called from any context — hook-based or imperative.
 */
export function applyThemeVars(theme: ThemeTokens, el?: HTMLElement): void {
  const root = el ?? document.documentElement;

  const applyColor = (varName: string, onVar: string | null, hex?: string) => {
    const rgb = hexToRgbTuple(hex);
    if (!rgb) {
      root.style.removeProperty(varName);
      if (onVar) root.style.removeProperty(onVar);
      return;
    }
    root.style.setProperty(varName, rgb);
    if (onVar) {
      root.style.setProperty(onVar, luminanceFromTuple(rgb) > 0.55 ? '26 23 20' : '255 255 255');
    }
  };

  applyColor('--brand-primary', '--brand-on-primary', theme.primaryColor);
  applyColor('--brand-secondary', null, theme.secondaryColor);
  applyColor('--brand-accent', '--brand-on-accent', theme.accentColor);

  if (theme.fontFamily) {
    root.style.setProperty('--brand-font', FONT_STACK[theme.fontFamily]);
  } else {
    root.style.removeProperty('--brand-font');
  }

  if (theme.buttonRadius) {
    root.style.setProperty('--brand-btn-radius', BUTTON_RADIUS[theme.buttonRadius]);
  } else {
    root.style.removeProperty('--brand-btn-radius');
  }

  if (theme.cardRadius) {
    root.style.setProperty('--brand-card-radius', CARD_RADIUS[theme.cardRadius]);
  } else {
    root.style.removeProperty('--brand-card-radius');
  }

  if (theme.cardShadow) {
    root.style.setProperty('--brand-card-shadow', CARD_SHADOW[theme.cardShadow]);
  } else {
    root.style.removeProperty('--brand-card-shadow');
  }
}

/**
 * Reads branding for the active org and applies theme tokens as CSS custom
 * properties on <html>.
 */
export function useApplyBranding(orgId: string | null): void {
  const q = useBrandingQuery(orgId);

  useEffect(() => {
    applyThemeVars(q.data?.data.theme ?? {});
  }, [q.data]);
}
