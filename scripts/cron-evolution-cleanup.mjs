import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const days = Number(process.env.MEDIA_RETENTION_DAYS ?? "90");
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "evolution-media";

const supabase = createClient(supabaseUrl, supabaseKey);

const { data: oldEvents, error } = await supabase
  .from("evolution_eventos")
  .select("id, media_path")
  .not("media_path", "is", null)
  .lt("criado_em", cutoff)
  .limit(500);

if (error) {
  console.error("Failed to fetch old events:", error.message);
  process.exit(1);
}

if (!oldEvents || oldEvents.length === 0) {
  console.log(JSON.stringify({ deleted: 0 }));
  process.exit(0);
}

const paths = oldEvents.map((item) => item.media_path).filter(Boolean);
if (paths.length > 0) {
  const { error: storageError } = await supabase.storage.from(bucket).remove(paths);
  if (storageError) {
    console.error("Failed to remove media:", storageError.message);
  }
}

const ids = oldEvents.map((item) => item.id);
const { error: deleteError } = await supabase
  .from("evolution_eventos")
  .delete()
  .in("id", ids);

if (deleteError) {
  console.error("Failed to delete events:", deleteError.message);
  process.exit(1);
}

console.log(JSON.stringify({ deleted: ids.length }));
