import { supabase } from "./src/lib/supabase.ts"; async function run() { const { data } = await supabase.from("transactions").select("date").limit(10); console.log(data); } run();
