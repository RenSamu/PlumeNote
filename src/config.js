// Clés publiques du projet Supabase (la clé « anon » est faite pour être dans l'application :
// ce sont les règles RLS de supabase/schema.sql qui protègent les données).
const DEFAULTS = {
  url: 'https://bkdebigzdyljqdwpbwgc.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZGViaWd6ZHlsanFkd3Bid2djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1MzU4MDAsImV4cCI6MjEwNzExMTgwMH0.8ItxUtTaC9BO5yxSfXxk3I0RP8NXT4w_wEFUC2oqxE8',
};
export const SUPABASE = { ...DEFAULTS, ...(globalThis.__PLUME_CFG__ || {}) };
