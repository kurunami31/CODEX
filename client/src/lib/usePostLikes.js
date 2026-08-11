import { useCallback, useMemo, useState } from 'react';
import { supabase } from './supabase';

/**
 * Post like state and toggling, shared by the Feed and Profile pages.
 */
export default function usePostLikes(user) {
  const [likes, setLikes] = useState([]);

  const loadLikes = useCallback(async () => {
    const { data } = await supabase.from('likes').select('post_id, user_id');
    if (data) setLikes(data);
  }, []);

  const likeCount = useMemo(() => {
    const m = new Map();
    for (const l of likes) m.set(l.post_id, (m.get(l.post_id) || 0) + 1);
    return m;
  }, [likes]);

  const likedByMe = useMemo(() => {
    const s = new Set();
    for (const l of likes) if (l.user_id === user?.id) s.add(l.post_id);
    return s;
  }, [likes, user]);

  const toggleLike = useCallback(async (postId) => {
    if (!user) return;
    const mine = likedByMe.has(postId);
    const { error } = mine
      ? await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id)
      : await supabase.from('likes').insert({ post_id: postId, user_id: user.id });
    if (!error) await loadLikes();
  }, [user, likedByMe, loadLikes]);

  return { likeCount, likedByMe, toggleLike, loadLikes };
}
