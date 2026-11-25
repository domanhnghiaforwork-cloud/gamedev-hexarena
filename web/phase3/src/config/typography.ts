export const FONT_PRIMARY_NAME = 'Be Vietnam Pro';
export const FONT_MONO_NAME = 'JetBrains Mono';

export const FONT_STACK_UI = `'Be Vietnam Pro', 'Segoe UI', Roboto, 'Noto Sans', Arial, sans-serif`;
export const FONT_STACK_MONO = `'JetBrains Mono', 'Cascadia Code', Consolas, monospace`;

export type FontWeight = 400 | 500 | 600 | 700 | 800 | 900;

/**
 * Builds a consistent CSS/Canvas 2D font string guaranteed to support Vietnamese diacritics.
 */
export function canvasFont(weight: FontWeight, sizePx: number, family: 'ui' | 'mono' = 'ui'): string {
  const stack = family === 'mono' ? FONT_STACK_MONO : FONT_STACK_UI;
  return `${weight} ${sizePx}px ${stack}`;
}

/**
 * Syncs global font CSS variables onto documentElement so DOM and Canvas stay aligned.
 */
export function applyTypographyToDocument(): void {
  if (typeof document === 'undefined') return;
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--font-ui', FONT_STACK_UI);
  rootStyle.setProperty('--font-mono', FONT_STACK_MONO);
}

/**
 * Preloads Vietnamese glyphs for Be Vietnam Pro & JetBrains Mono before/during Canvas rendering.
 */
export async function ensureFontsLoaded(onReady?: () => void): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    onReady?.();
    return;
  }

  const sampleText = 'Đấu trường Lục giác PHẢN TƯỚC 0123456789';
  const weights: FontWeight[] = [400, 700, 800, 900];
  try {
    await Promise.all([
      ...weights.map((w) => document.fonts.load(`${w} 16px "${FONT_PRIMARY_NAME}"`, sampleText)),
      document.fonts.load(`700 14px "${FONT_MONO_NAME}"`, '0123456789'),
    ]);
    await document.fonts.ready;
  } catch {
    // Fallback fonts in FONT_STACK_UI remain active offline
  }
  onReady?.();
}
