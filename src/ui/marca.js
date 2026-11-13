import { bruto } from '../lib/dom.js';

// Símbolo da marca: um circuito integrado com o ponto de solda em destaque.
export function simboloMarca(tamanho = 36) {
  return bruto(`<svg class="simbolo-marca" width="${tamanho}" height="${tamanho}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <rect x="9" y="9" width="14" height="14" rx="2" fill="none" stroke="var(--laranja)" stroke-width="2"/>
    <path d="M13 9V5M19 9V5M13 27v-4M19 27v-4M9 13H5M9 19H5M27 13h-4M27 19h-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="16" cy="16" r="2.5" fill="var(--laranja)"/>
  </svg>`);
}

export function logotipo() {
  return bruto(`<span class="logotipo">${simboloMarca().valor}<span class="logotipo-texto"><strong>Oficina Lucrativa</strong><small>RendaPrática</small></span></span>`);
}

// Placa de circuito decorativa da tela de acesso. As trilhas acendem uma única
// vez ao carregar (desativado com prefers-reduced-motion).
export function placaCircuito() {
  const trilhas = [
    'M200 250 V170 H120 V90',
    'M220 250 V140 H300 V60',
    'M240 250 V200 H340',
    'M260 270 H360 V330 H400',
    'M260 290 H320 V410',
    'M240 330 V420 H170 V500',
    'M220 330 V380 H80',
    'M200 330 V470 H260 V560',
    'M180 290 H100 V240 H30',
    'M180 270 H130 V180 H40',
    'M120 90 H60',
    'M300 60 H380',
    'M80 380 V450 H20',
    'M320 410 H380 V480',
  ];
  const pads = [
    [120, 90], [60, 90], [300, 60], [380, 60], [340, 200], [400, 330], [320, 410],
    [380, 480], [170, 500], [80, 380], [20, 450], [260, 560], [30, 240], [40, 180],
  ];
  const vias = [[120, 170], [300, 140], [360, 270], [100, 290], [130, 270], [170, 420], [260, 470]];
  return bruto(`<svg class="placa" viewBox="0 0 420 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <g class="placa-trilhas">${trilhas.map((d, i) => `<path d="${d}" style="--i:${i}"/>`).join('')}</g>
    <g class="placa-vias">${vias.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4"/>`).join('')}</g>
    <g class="placa-pads">${pads.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7"/>`).join('')}</g>
    <g class="placa-chip">
      <rect x="170" y="240" width="100" height="100" rx="6"/>
      <circle cx="186" cy="256" r="4"/>
    </g>
  </svg>`);
}
