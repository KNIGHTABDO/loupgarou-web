import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Typed as `any` intentionally — no generated Database types yet.
// This prevents TypeScript from inferring .from() result as `never`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createClient(): any {
  if (!_client) {
    _client = createSupabaseClient(supabaseUrl, supabaseAnonKey);
  }
  return _client;
}
