export function isSupabaseStorage(): boolean {
  return import.meta.env.VITE_STORAGE_PROVIDER === "supabase";
}

export function getSupabaseStoragePath(): string {
  return import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "fileit";
}

export function getFileUrl(storagePath: string): string {
  if (isSupabaseStorage() && import.meta.env.VITE_SUPABASE_URL) {
    return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${getSupabaseStoragePath()}/${storagePath}`;
  }
  return `/api/storage/${encodeURIComponent(storagePath)}`;
}

export function getFileDownloadUrl(storagePath: string): string {
  return `/api/storage/${encodeURIComponent(storagePath)}?download=1`;
}
