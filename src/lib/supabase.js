import { createClient } from '@supabase/supabase-js';
import { config, problemaDeConfiguracao } from './config.js';

export const supabase = problemaDeConfiguracao()
  ? null
  : createClient(config.supabaseUrl, config.supabaseChave, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

export const BUCKET_ARQUIVOS = 'empresa-arquivos';
