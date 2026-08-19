import { supabase } from './supabase';

let imagesOk = null; // null = not checked yet

/**
 * Does the `posts.images` column exist in this database? The latest schema
 * adds it for multi-photo posts; databases that haven't applied the
 * migration only have `image_url`. Detected once and cached for the session.
 */
export async function supportsImages() {
  if (imagesOk !== null) return imagesOk;
  try {
    const { error } = await supabase.from('posts').select('images', { head: true }).limit(1);
    imagesOk = !error;
  } catch {
    imagesOk = false;
  }
  return imagesOk;
}

/**
 * Build the posts select projection, dropping the `images` column when the
 * database doesn't have it yet so the feed keeps working pre-migration.
 */
export async function postsSelect(profileSelect = 'id, full_name, role, year_level, avatar_url') {
  const images = await supportsImages();
  const cols = images ? 'image_url, images' : 'image_url';
  return profileSelect
    ? `id, author_id, content, created_at, archived, status, approved_by, approved_at, ${cols}, profiles!posts_author_id_fkey(${profileSelect})`
    : `id, author_id, content, created_at, archived, status, approved_by, approved_at, ${cols}`;
}
