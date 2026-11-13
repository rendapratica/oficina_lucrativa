// Valida o manifest.json do aplicativo instalável e a existência dos ícones.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const publico = resolve(process.cwd(), 'public');
const manifest = JSON.parse(readFileSync(resolve(publico, 'manifest.json'), 'utf8'));
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('manifest.json', () => {
  it('tem os campos exigidos para instalação', () => {
    for (const campo of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons', 'theme_color', 'background_color']) {
      expect(manifest[campo], campo).toBeTruthy();
    }
    expect(manifest.lang).toBe('pt-BR');
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(manifest.display);
  });

  it('tem ícones de 192 e 512 px, normais e maskable, e todos existem', () => {
    const png = manifest.icons.filter((i) => i.type === 'image/png');
    for (const tamanho of ['192x192', '512x512']) {
      expect(png.some((i) => i.sizes === tamanho && i.purpose === 'any'), `any ${tamanho}`).toBe(true);
      expect(png.some((i) => i.sizes === tamanho && i.purpose === 'maskable'), `maskable ${tamanho}`).toBe(true);
    }
    for (const icone of [...manifest.icons, ...manifest.shortcuts.flatMap((s) => s.icons)]) {
      expect(existsSync(resolve(publico, icone.src)), icone.src).toBe(true);
    }
  });

  it('atalhos ficam dentro do escopo do aplicativo', () => {
    for (const atalho of manifest.shortcuts) expect(atalho.url.startsWith(manifest.scope)).toBe(true);
  });

  it('está ligado no index.html com o ícone da Apple', () => {
    expect(html).toContain('<link rel="manifest" href="manifest.json" />');
    expect(html).toContain("icones/apple-touch-icon.png");
    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`);
  });
});
