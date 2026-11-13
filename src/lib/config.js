// Configuração pública do frontend. Apenas a URL e a chave PUBLICÁVEL (anon)
// do Supabase chegam ao navegador; a segurança real está no RLS do banco.
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const chave = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

function chaveSecreta(valor) {
  if (valor.startsWith('sb_secret_')) return true;
  // Chaves JWT legadas: a service_role traz "role":"service_role" no payload.
  const partes = valor.split('.');
  if (partes.length === 3) {
    try {
      const payload = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.role === 'service_role';
    } catch {
      return false;
    }
  }
  return false;
}

export const config = {
  supabaseUrl: url,
  supabaseChave: chave,
  urlApp: window.location.origin,
};

export function problemaDeConfiguracao() {
  if (!url || !chave) {
    return 'Faltam as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY. Crie o arquivo .env.local (veja .env.example) e reinicie com npm run dev; em hospedagem, defina-as antes de rodar npm run build.';
  }
  if (chaveSecreta(chave)) {
    return 'A chave configurada é SECRETA (service_role). Remova-a do frontend imediatamente e use a chave publicável.';
  }
  return null;
}
