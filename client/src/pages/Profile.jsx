import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import PostCard from '../components/PostCard';
import usePostActions from '../lib/usePostActions';
import usePostLikes from '../lib/usePostLikes';
import { formatEventDate } from '../lib/format';
import { roleLabel } from '../lib/roles';
import { ChevronLeftIcon, RssIcon, ArchiveIcon, GearIcon, UsersIcon } from '../components/icons/Icons';

export default function Profile() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const isMe = user?.id === id;

  const [author, setAuthor] = useState(null);
  const [posts, setPosts] = useState([]);
  const [archived, setArchived] = useState([]);
  const [view, setView] = useState('posts');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const { likeCount, likedByMe, toggleLike, loadLikes } = usePostLikes(user);

  const loadAuthor = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error || !data) setNotFound(true);
    setAuthor(data || null);
  }, [id]);

  const loadPosts = useCallback(async () => {
    const { data } = await supabase
      .from('posts')
      .select('id, author_id, content, created_at, archived, profiles!posts_author_id_fkey(id, full_name, role, year_level, avatar_url)')
      .eq('author_id', id)
      .eq('archived', false)
      .order('created_at', { ascending: false });
    setPosts(data || []);
  }, [id]);

  const loadArchived = useCallback(async () => {
    if (!isMe) return;
    const { data } = await supabase
      .from('posts')
      .select('id, author_id, content, created_at, archived, profiles!posts_author_id_fkey(id, full_name, role, year_level, avatar_url)')
      .eq('author_id', id)
      .eq('archived', true)
      .order('created_at', { ascending: false });
    setArchived(data || []);
  }, [isMe, id]);

  const refresh = useCallback(async () => {
    await Promise.all([loadPosts(), loadArchived()]);
  }, [loadPosts, loadArchived]);

  const actions = usePostActions({ user, toast, refresh });

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setView('posts');
    Promise.all([loadAuthor(), loadPosts(), loadArchived(), loadLikes()]).finally(() => setLoading(false));
  }, [id, loadAuthor, loadPosts, loadArchived, loadLikes]);

  const sharePost = async (post) => {
    try {
      await navigator.clipboard.writeText(`${post.profiles?.full_name || 'Member'} on CODEX: ${post.content.slice(0, 100)}`);
      toast.ok('Copied', 'Post link copied to clipboard — share it!');
    } catch {
      toast.info('Share', 'Clipboard unavailable on this device.');
    }
  };

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/app/feed');
  };

  const renderPosts = (list, manage = false) =>
    list.map((post) => (
      <PostCard
        key={post.id}
        post={post}
        mine={post.author_id === user?.id}
        manage={manage}
        liked={likedByMe.has(post.id)}
        likeCount={likeCount.get(post.id) || 0}
        onLike={() => toggleLike(post.id)}
        onShare={() => sharePost(post)}
        onEditStart={() => actions.startEdit(post)}
        onEditCancel={actions.cancelEdit}
        onEditChange={actions.setEditDraft}
        onEditSave={actions.saveEdit}
        editDraft={actions.editDraft}
        editing={actions.editingId === post.id}
        saving={actions.saving}
        onArchive={() => (manage ? actions.restorePost(post) : actions.archivePost(post))}
        onDelete={() => actions.deletePost(post)}
      />
    ));

  if (notFound) {
    return (
      <div className="empty-state panel">
        <span className="ico"><UsersIcon width={26} height={26} /></span>
        <b>Member not found</b>
        <p>This profile doesn't exist or was removed.</p>
        <button className="btn btn-outline btn-sm" onClick={() => navigate('/app/feed')}>
          <ChevronLeftIcon width={15} height={15} /> Back to feed
        </button>
      </div>
    );
  }

  return (
    <div>
      <button className="btn btn-ghost btn-sm profile-back" onClick={goBack}>
        <ChevronLeftIcon width={15} height={15} /> Back
      </button>

      <div className="profile-head panel grid-bg" style={{ border: '1px solid rgba(14,208,182,0.35)' }}>
        <Avatar name={author?.full_name} seed={author?.id} size={84} url={author?.avatar_url} />
        <div className="profile-meta">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="profile-name">{author?.full_name || '…'}</h1>
            <span className={`role-pill role-pill--${author?.role || 'student'}`}>{roleLabel(author?.role)}</span>
          </div>
          <div className="ocr-label profile-sub">
            DOrSU · {author?.course || 'BSIT'} · {author?.year_level || '—'} · Section {author?.section || '—'}
          </div>
          <div className="profile-stats">
            <div className="stat"><b>{posts.length + archived.length}</b><span>posts</span></div>
            <div className="stat"><b>{author?.student_id || '—'}</b><span>student id</span></div>
            {author?.created_at && (
              <div className="stat"><b>{formatEventDate(author.created_at).day}</b><span>joined</span></div>
            )}
          </div>
          {isMe && (
            <Link to="/app/settings" className="btn btn-outline btn-sm profile-edit">
              <GearIcon width={15} height={15} /> Edit profile
            </Link>
          )}
        </div>
      </div>

      {isMe && (
        <div className="feed-tabs">
          <button className={`feed-tab${view === 'posts' ? ' feed-tab--active' : ''}`} onClick={() => setView('posts')}>
            Posts{posts.length > 0 && <span className="feed-tab-count">{posts.length}</span>}
          </button>
          <button className={`feed-tab${view === 'archived' ? ' feed-tab--active' : ''}`} onClick={() => setView('archived')}>
            Archived{archived.length > 0 && <span className="feed-tab-count">{archived.length}</span>}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 90 }} /></div>
          <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 70 }} /></div>
        </div>
      ) : view === 'archived' ? (
        archived.length === 0 ? (
          <div className="empty-state panel">
            <span className="ico"><ArchiveIcon width={26} height={26} /></span>
            <b>Nothing archived</b>
            <p>Posts you archive are parked here — restore or delete them anytime.</p>
          </div>
        ) : (
          renderPosts(archived, true)
        )
      ) : posts.length === 0 ? (
        <div className="empty-state panel">
          <span className="ico"><RssIcon width={26} height={26} /></span>
          <b>No posts yet</b>
          <p>{isMe ? 'Share something with the community — your posts will show up here.' : `${author?.full_name || 'This member'} hasn't posted anything yet.`}</p>
        </div>
      ) : (
        renderPosts(posts)
      )}
    </div>
  );
}
