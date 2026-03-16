import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase environment variables are missing! Check your .env.local file.");
    throw new Error("Missing Supabase environment variables. NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be defined.");
}

// Log safely (only the URL, never the API key) to confirm it is loaded
console.log("Supabase Client initialized with URL:", supabaseUrl);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
