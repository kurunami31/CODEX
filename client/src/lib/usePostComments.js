import { useCallback, useMemo, useState } from 'react';
import { supabase } from './supabase';

const COMMENT_MAX = 500;
export const COMMENT_IMAGE_MAX = 5 * 1024 * 1024;
export const COMMENT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const COMMENT_SELECT = 'id, post_id, author_id, content, image_url, parent_id, created_at, updated_at, profiles!post_comments_author_id_fkey(id, full_name, role, avatar_url)';

/**
 * Post comment state — counts, per-post lists, add/edit/delete + replies.
 * Counts load in one grouped query (like likes); the actual comment
 * threads are fetched lazily the first time a post is expanded.
 * Comments may carry one optional image (stored in the post-images bucket)
 * and may be replies to another comment (`parent_id`).
 */
export default function usePostComments(user) {
  const [counts, setCounts] = useState([]); // [{ post_id, count }]
  const [byPost, setByPost] = useState({}); // { [postId]: comment[] }
  const [open, setOpen] = useState({}); // { [postId]: true } once expanded
  const [busy, setBusy] = useState(false);

  const loadCounts = useCallback(async () => {
    const { data } = await supabase
      .from('post_comments')
      .select('post_id')
      .order('created_at', { ascending: true });
    if (!data) return;
    const map = new Map();
    for (const c of data) map.set(c.post_id, (map.get(c.post_id) || 0) + 1);
    setCounts([...map.entries()].map(([post_id, count]) => ({ post_id, count })));
  }, []);

  const commentCount = useMemo(() => {
    const m = new Map();
    for (const { post_id, count } of counts) m.set(post_id, count);
    // If a thread is open and longer than the count, trust the thread.
    for (const [pid, list] of Object.entries(byPost)) m.set(pid, list.length);
    return m;
  }, [counts, byPost]);

  const loadThread = useCallback(async (postId) => {
    const { data } = await supabase
      .from('post_comments')
      .select(COMMENT_SELECT)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (data) {
      setByPost((prev) => ({ ...prev, [postId]: data }));
      setOpen((prev) => ({ ...prev, [postId]: true }));
    }
  }, []);

  const toggle = useCallback(
    (postId) => {
      if (open[postId]) setOpen((prev) => ({ ...prev, [postId]: false }));
      else loadThread(postId);
    },
    [open, loadThread]
  );

  const imagePathFromUrl = (url) => url?.split('/storage/v1/object/public/post-images/')[1] || null;

  const uploadCommentImage = useCallback(
    async (file) => {
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '.png';
      const path = `${user.id}/comments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const { error: upErr } = await supabase.storage
        .from('post-images')
        .upload(path, file, { cacheControl: '31536000' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path);
      return { publicUrl, path };
    },
    [user]
  );

  const addComment = useCallback(
    async (postId, content, imageFile = null, parentId = null) => {
      const text = content.trim();
      if ((!text && !imageFile) || !user) return { error: null };
      setBusy(true);
      let uploadedPath = null;
      try {
        let imageUrl = null;
        if (imageFile) {
          const up = await uploadCommentImage(imageFile);
          imageUrl = up.publicUrl;
          uploadedPath = up.path;
        }
        const { error } = await supabase
          .from('post_comments')
          .insert({
            post_id: postId,
            author_id: user.id,
            content: text.slice(0, COMMENT_MAX),
            image_url: imageUrl,
            parent_id: parentId || null,
          });
        if (error) {
          if (uploadedPath) await supabase.storage.from('post-images').remove([uploadedPath]);
          return { error };
        }
        await loadThread(postId); // refetch so the new row (with author join) appears
        return { error: null };
      } catch (err) {
        if (uploadedPath) await supabase.storage.from('post-images').remove([uploadedPath]);
        return { error: err };
      } finally {
        setBusy(false);
      }
    },
    [user, uploadCommentImage, loadThread]
  );

  const updateComment = useCallback(
    async (postId, commentId, content, imageFile = null) => {
      const text = content.trim();
      if (!text || !user) return { error: null };
      setBusy(true);
      let uploadedPath = null;
      let oldPath = null;
      try {
        const patch = { content: text.slice(0, COMMENT_MAX), updated_at: new Date().toISOString() };
        if (imageFile) {
          const up = await uploadCommentImage(imageFile);
          patch.image_url = up.publicUrl;
          uploadedPath = up.path;
          const { data: existing } = await supabase
            .from('post_comments')
            .select('image_url')
            .eq('id', commentId)
            .maybeSingle();
          oldPath = existing?.image_url ? imagePathFromUrl(existing.image_url) : null;
        }
        const { error } = await supabase
          .from('post_comments')
          .update(patch)
          .eq('id', commentId)
          .eq('author_id', user.id);
        if (error) {
          if (uploadedPath) await supabase.storage.from('post-images').remove([uploadedPath]);
          return { error };
        }
        // Free the replaced image so the bucket doesn't fill with orphans.
        if (uploadedPath && oldPath && oldPath !== uploadedPath) {
          await supabase.storage.from('post-images').remove([oldPath]).catch(() => {});
        }
        await loadThread(postId);
        return { error: null };
      } catch (err) {
        if (uploadedPath) await supabase.storage.from('post-images').remove([uploadedPath]);
        return { error: err };
      } finally {
        setBusy(false);
      }
    },
    [user, uploadCommentImage, loadThread]
  );

  const deleteComment = useCallback(
    async (postId, commentId) => {
      setBusy(true);
      const { data: existing } = await supabase
        .from('post_comments')
        .select('image_url')
        .eq('id', commentId)
        .maybeSingle();
      const { error } = await supabase.from('post_comments').delete().eq('id', commentId);
      setBusy(false);
      if (error) return error;
      const path = existing?.image_url ? imagePathFromUrl(existing.image_url) : null;
      if (path) await supabase.storage.from('post-images').remove([path]).catch(() => {});
      setByPost((prev) => ({
        ...prev,
        [postId]: (prev[postId] || []).filter((c) => c.id !== commentId),
      }));
      return null;
    },
    []
  );

  return {
    commentCount,
    comments: (postId) => byPost[postId] || null, // null = not loaded yet
    isOpen: (postId) => Boolean(open[postId]),
    loading: busy,
    loadCounts,
    toggle,
    addComment,
    updateComment,
    deleteComment,
  };
}