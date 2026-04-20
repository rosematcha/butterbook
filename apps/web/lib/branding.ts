'use client';
import { useEffect } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiGet } from './api';

export type BrandingFont = 'system' | 'serif' | 'sans' | 'mono';
export type BrandingRadius = 'none' | 'small' | 'medium' | 'large' | 'full';

export interface BrandingPayload {
  data: {
    id: string;
    name: string;
    publicSlug: string;
    logoUrl: string | null;
    theme: {
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      fontFamily?: BrandingFont;
      buttonRadius?: BrandingRadius;
    };
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

/**
 * Reads branding for the active org and applies the three brand colors as CSS
 * custom properties on <html>, so Tailwind classes like `bg-brand-primary`,
 * `text-brand-accent`, and `bg-brand-accent/10` resolve to the org's palette.
 *
 * Also sets `--brand-on-primary` / `--brand-on-accent` to white or ink so text
 * on those surfaces stays readable regardless of hue.
 */
export function useApplyBranding(orgId: string | null): void {
  const q = useBrandingQuery(orgId);

  useEffect(() => {
    const root = document.documentElement;
    const theme = q.data?.data.theme ?? {};

    const apply = (varName: string, onVar: string | null, hex?: string) => {
      const rgb = hexToRgbTuple(hex);
      if (!rgb) {
        root.style.removeProperty(varName);
        if (onVar) root.style.removeProperty(onVar);
        return;
      }
      root.style.setProperty(varName, rgb);
      if (onVar) {
        // Pick white or near-black for text on this surface, based on luminance.
        root.style.setProperty(onVar, luminanceFromTuple(rgb) > 0.55 ? '26 23 20' : '255 255 255');
      }
    };

    apply('--brand-primary', '--brand-on-primary', theme.primaryColor);
    apply('--brand-secondary', null, theme.secondaryColor);
    apply('--brand-accent', '--brand-on-accent', theme.accentColor);
  }, [q.data]);
}
