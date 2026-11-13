// Ícones Lucide importados individualmente (somente os usados entram no bundle).
import {
  Building2, Check, CircleAlert, Copy, Cpu, House, LogOut, Mail, Menu,
  Palette, Plus, ShieldCheck, Upload, UserPlus, Users, X, Trash2, RotateCcw,
  Eye, EyeOff, CircleCheck, Circle, ChevronDown, KeyRound, MapPin,
} from 'lucide';

const ICONES = {
  'building-2': Building2, check: Check, 'circle-alert': CircleAlert, copy: Copy, cpu: Cpu,
  house: House, 'log-out': LogOut, mail: Mail, menu: Menu, palette: Palette, plus: Plus,
  'shield-check': ShieldCheck, upload: Upload, 'user-plus': UserPlus, users: Users, x: X,
  'trash-2': Trash2, 'rotate-ccw': RotateCcw, eye: Eye, 'eye-off': EyeOff,
  'circle-check': CircleCheck, circle: Circle, 'chevron-down': ChevronDown,
  'key-round': KeyRound, 'map-pin': MapPin,
};

function atributos(obj) {
  return Object.entries(obj).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
}

export function icone(nome, classe = '') {
  const no = ICONES[nome];
  if (!no) throw new Error(`Ícone não registrado: ${nome}`);
  const filhos = no.map(([tag, attrs]) => `<${tag} ${atributos(attrs)}/>`).join('');
  return `<svg class="ic ${classe}" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${filhos}</svg>`;
}
