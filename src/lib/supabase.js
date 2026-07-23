import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, isConfigured } from '../config.js';

export const db = isConfigured() ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
