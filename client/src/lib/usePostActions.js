import { useCallback, useState } from 'react';
import { supabase } from './supabase';

/**
 * Post management actions (edit / archive / restore / delete) shared by
 * the Feed and Profile pages. `refresh` is called after any mutation so the
 * caller can reload its post lists.
 */
export default function usePostActions({ user, toast, refresh }) {
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = useCallback((post) => {
    setEditingId(post.id);
    setEditDraft(post.content);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft('');
  }, []);

  const saveEdit = useCallback(async () => {
    const content = editDraft.trim();
    if (!content || saving || !editingId) return;
    setSaving(true);
    const { error } = await supabase.from('posts').update({ content }).eq('id', editingId).eq('author_id', user.id);
    setSaving(false);
    if (error) return toast.error('Could not save', error.message);
    cancelEdit();
    toast.ok('Saved', 'Your post was updated.');
    refresh();
  }, [editDraft, saving, editingId, user, toast, refresh, cancelEdit]);

  const deletePost = useCallback(async (post) => {
    if (!window.confirm('Delete this post permanently? Likes on it are removed too.')) return;
    const { error } = await supabase.from('posts').delete().eq('id', post.id).eq('author_id', user.id);
    if (error) return toast.error('Could not delete', error.message);
    // Clean up the uploaded image so the bucket doesn't fill with orphans.
    if (post.image_url) {
      const path = post.image_url.split('/storage/v1/object/public/post-images/')[1];
      if (path) await supabase.storage.from('post-images').remove([path]);
    }
    toast.ok('Deleted', 'Post removed permanently.');
    refresh();
  }, [user, toast, refresh]);

  const archivePost = useCallback(async (post) => {
    const { error } = await supabase.from('posts').update({ archived: true }).eq('id', post.id).eq('author_id', user.id);
    if (error) return toast.error('Could not archive', error.message);
    toast.ok('Archived', 'Post hidden from the feed — restore it anytime.');
    refresh();
  }, [user, toast, refresh]);

  const restorePost = useCallback(async (post) => {
    const { error } = await supabase.from('posts').update({ archived: false }).eq('id', post.id).eq('author_id', user.id);
    if (error) return toast.error('Could not restore', error.message);
    toast.ok('Restored', 'Post is back on the feed.');
    refresh();
  }, [user, toast, refresh]);

  return {
    editingId,
    editDraft,
    setEditDraft,
    saving,
    startEdit,
    cancelEdit,
    saveEdit,
    deletePost,
    archivePost,
    restorePost,
  };
}
