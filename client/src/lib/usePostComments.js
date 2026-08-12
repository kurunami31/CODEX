import { useCallback, useMemo, useState } from 'react';
import { supabase } from './supabase';

/**
 * Post comment state — counts, per-post lists, add/delete.
 * Counts load in one grouped query (like likes); the actual comment
 * threads are fetched lazily the first time a post is expanded.
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
      .select('id, post_id, author_id, content, created_at, profiles!post_comments_author_id_fkey(id, full_name, role, avatar_url)')
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

  const addComment = useCallback(
    async (postId, content) => {
      const text = content.trim();
      if (!text || !user) return { error: null };
      setBusy(true);
      const { error } = await supabase
        .from('post_comments')
        .insert({ post_id: postId, author_id: user.id, content: text.slice(0, 500) });
      setBusy(false);
      if (error) return { error };
      await loadThread(postId); // refetch so the new row (with author join) appears
      return { error: null };
    },
    [user, loadThread]
  );

  const deleteComment = useCallback(
    async (postId, commentId) => {
      setBusy(true);
      const { error } = await supabase.from('post_comments').delete().eq('id', commentId);
      setBusy(false);
      if (error) return error;
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
    deleteComment,
  };
}
