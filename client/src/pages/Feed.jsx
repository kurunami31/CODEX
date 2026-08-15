import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import PostCard from '../components/PostCard';
import usePostActions from '../lib/usePostActions';
import usePostLikes from '../lib/usePostLikes';
import usePostComments from '../lib/usePostComments';
import { postsSelect, supportsImages } from '../lib/columns';
import { fetchFeedHn, fetchFeedGitHub } from '../lib/api';
import { timeAgo } from '../lib/format';
import { ExternalIcon, StarIcon, GithubIcon, RssIcon, BoxIcon, ArchiveIcon, ImageIcon, XIcon } from '../components/icons/Icons';

const LIMIT = 2000;
const POST_IMAGE_MAX = 5 * 1024 * 1024;
const POST_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_IMAGES = 5;

export default function Feed() {
  const { user, profile } = useAuth();
  const toast = useToast();

  const [posts, setPosts] = useState([]);
  const [hasImages, setHasImages] = useState(true);
  const [learn, setLearn] = useState({ hn: [], gh: [] });
  const [draft, setDraft] = useState('');
  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [view, setView] = useState('feed');
  const [archivedPosts, setArchivedPosts] = useState([]);
  const loadedRef = useRef(false);
  const fileRef = useRef(null);

  const { likeCount, likedByMe, toggleLike, loadLikes } = usePostLikes(user);
  const comments = usePostComments(user);

  // Databases without the latest schema lack posts.images — drop it from the
  // projection so the feed still loads (single-photo mode until migration).
  useEffect(() => {
    supportsImages().then(setHasImages);
  }, []);

  const loadPosts = useCallback(async () => {
    const { data, error } = await supabase
      .from('posts')
      .select(await postsSelect())
      .eq('archived', false)
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Feed error', error.message);
      return;
    }
    setPosts(data || []);
  }, [toast]);

  const loadArchived = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('posts')
      .select(await postsSelect())
      .eq('author_id', user.id)
      .eq('archived', true)
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Archive error', error.message);
      return;
    }
    setArchivedPosts(data || []);
  }, [user, toast]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadPosts();
    loadLikes();
    comments.loadCounts();
    Promise.allSettled([fetchFeedHn(), fetchFeedGitHub()])
      .then(([hn, gh]) => {
        setLearn({
          hn: hn.status === 'fulfilled' ? hn.value.items : [],
          gh: gh.status === 'fulfilled' ? gh.value.items : [],
        });
        if (hn.status === 'rejected' && gh.status === 'rejected') {
          setFeedError('Learning feeds are unreachable right now — check the server or try again later.');
        }
      })
      .finally(() => setLoading(false));
  }, [loadPosts, loadLikes, comments.loadCounts]);

  const sharePost = async (post) => {
    try {
      await navigator.clipboard.writeText(`${post.profiles?.full_name || 'Member'} on CODEX: ${post.content.slice(0, 100)}`);
      toast.ok('Copied', 'Post link copied to clipboard — share it!');
    } catch {
      toast.info('Share', 'Clipboard unavailable on this device.');
    }
  };

  const imageCap = hasImages ? MAX_IMAGES : 1;

  const pickImages = (files) => {
    if (!files || files.length === 0) return;
    const incoming = [...files];
    const room = imageCap - imageFiles.length;      if (incoming.length > room) {
        toast.error('Too many photos', `You can attach up to ${imageCap} image${imageCap === 1 ? '' : 's'} per post.`);
        incoming.length = room;
      }
    const next = [];
    for (const file of incoming) {
      if (!POST_IMAGE_TYPES.includes(file.type)) {
        toast.error('Unsupported file', 'Use PNG, JPEG, WebP or GIF.');
        continue;
      }
      if (file.size > POST_IMAGE_MAX) {
        toast.error('Image too large', 'Keep each photo under 5 MB.');
        continue;
      }
      next.push(file);
    }
    if (next.length === 0) return;
    setImageFiles((prev) => [...prev, ...next]);
    setImagePreviews((prev) => [...prev, ...next.map((f) => URL.createObjectURL(f))]);
  };

  const removeImageAt = (i) => {
    URL.revokeObjectURL(imagePreviews[i]);
    setImageFiles((prev) => prev.filter((_, idx) => idx !== i));
    setImagePreviews((prev) => prev.filter((_, idx) => idx !== i));
  };

  const uploadImages = async () => {
    const urls = [];
    for (const file of imageFiles) {
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '.png';
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const { error: upErr } = await supabase.storage
        .from('post-images')
        .upload(path, file, { cacheControl: '31536000' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path);
      urls.push(publicUrl);
    }
    return urls;
  };

  const submitPost = async () => {
    const content = draft.trim();
    if ((!content && imageFiles.length === 0) || posting) return;
    setPosting(true);
    let uploaded = [];
    try {
      if (imageFiles.length > 0) {
        uploaded = await uploadImages();
        imagePreviews.forEach((p) => URL.revokeObjectURL(p));
        setImageFiles([]);
        setImagePreviews([]);
      }
      const payload = {
        author_id: user.id,
        content,
        image_url: uploaded.length > 0 ? uploaded[0] : null,
      };
      // Only write the images column when the database actually has it.
      if (hasImages) payload.images = uploaded.length > 0 ? uploaded : null;
      const { error } = await supabase.from('posts').insert(payload);
      if (error) throw error;
      setDraft('');
      toast.ok('Posted', 'Your message is live on the feed.');
      loadPosts();
      comments.loadCounts();
    } catch (err) {
      // If the insert failed after the upload, remove the orphaned files.
      if (uploaded.length > 0) {
        const paths = uploaded.map((u) => u.split('/storage/v1/object/public/post-images/')[1]).filter(Boolean);
        await supabase.storage.from('post-images').remove(paths);
      }
      toast.error('Could not post', err.message);
    } finally {
      setPosting(false);
    }
  };

  const refreshPosts = useCallback(async () => {
    await Promise.all([loadPosts(), loadArchived()]);
    comments.loadCounts();
  }, [loadPosts, loadArchived, comments]);

  const actions = usePostActions({ user, toast, refresh: refreshPosts });

  const learningItems = useMemo(() => {
    const items = learn.hn.map((h) => ({ kind: 'hn', ts: h.published, data: h }));
    const ghItems = learn.gh.map((g) => ({ kind: 'gh', ts: g.updated, data: g }));
    return [...items, ...ghItems].sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  }, [learn]);

  const feedItems = useMemo(() => {
    const ps = posts.map((p) => ({ kind: 'post', ts: p.created_at, data: p }));
    return [...ps, ...learningItems].sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  }, [posts, learningItems]);

  const cardProps = (post, extra = {}) => ({
    key: `p-${post.id}`,
    post,
    mine: post.author_id === user?.id,
    liked: likedByMe.has(post.id),
    likeCount: likeCount.get(post.id) || 0,
    commentCount: comments.commentCount.get(post.id) || 0,
    commentsOpen: comments.isOpen(post.id),
    comments: comments.comments(post.id),
    commentsBusy: comments.loading,
    currentUserId: user?.id,
    canModerate: profile?.role === 'superadmin',
    onLike: () => toggleLike(post.id),
    onShare: () => sharePost(post),
    onCommentsToggle: () => comments.toggle(post.id),
    threadError: comments.threadError(post.id),
    onAddComment: async (pid, text, imageFile, parentId) => {
      const res = await comments.addComment(pid, text, imageFile, parentId);
      if (res.error) toast.error('Could not comment', res.error.message);
      return res;
    },
    onEditComment: async (pid, cid, text, imageFile) => {
      const res = await comments.updateComment(pid, cid, text, imageFile);
      if (res.error) toast.error('Could not update comment', res.error.message);
      return res;
    },
    onDeleteComment: async (pid, cid) => {
      const err = await comments.deleteComment(pid, cid);
      if (err) toast.error('Could not delete comment', err.message);
      return err;
    },
    onEditStart: () => actions.startEdit(post),
    onEditCancel: actions.cancelEdit,
    onEditChange: actions.setEditDraft,
    onEditSave: actions.saveEdit,
    editDraft: actions.editDraft,
    editing: actions.editingId === post.id,
    saving: actions.saving,
    ...extra,
  });

  return (
    <div className="feed-cols">
      <div className="feed-main">
        <div className="composer panel">
          <div className="row">
            <Avatar name={profile?.full_name} seed={user?.id} size={42} ring url={profile?.avatar_url} />
            <textarea
              className="textarea"
              placeholder="Drop some knowledge for the squad… what did you build or learn today?"
              value={draft}
              maxLength={LIMIT}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitPost();
              }}
            />
          </div>
          {imagePreviews.length > 0 && (
            <div className="composer-images">
              {imagePreviews.map((src, i) => (
                <div className="composer-image" key={`${src}-${i}`}>
                  <img src={src} alt={`Preview ${i + 1}`} />
                  <button
                    type="button"
                    className="icon-btn composer-image-x"
                    onClick={() => removeImageAt(i)}
                    aria-label="Remove image"
                  >
                    <XIcon width={14} height={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="foot">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => fileRef.current?.click()}
                title="Attach photos"
              >
                <ImageIcon width={15} height={15} /> Photo{imageFiles.length > 0 ? ` ${imageFiles.length}/${imageCap}` : ''}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={POST_IMAGE_TYPES.join(',')}
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  pickImages(e.target.files);
                  e.target.value = '';
                }}
              />
              <span className="count">{draft.length}/{LIMIT}</span>
            </div>
            <button
              className="btn btn-accent btn-sm"
              onClick={submitPost}
              disabled={(!draft.trim() && imageFiles.length === 0) || posting}
            >
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>

        {feedError && (
          <div className="portal-config" style={{ marginBottom: 0 }}>{feedError}</div>
        )}

        <div className="feed-tabs">
          <button className={`feed-tab${view === 'feed' ? ' feed-tab--active' : ''}`} onClick={() => setView('feed')}>
            Feed
          </button>
          <button
            className={`feed-tab${view === 'archived' ? ' feed-tab--active' : ''}`}
            onClick={() => {
              setView('archived');
              loadArchived();
            }}
          >
            My archived{archivedPosts.length > 0 && <span className="feed-tab-count">{archivedPosts.length}</span>}
          </button>
        </div>

        {view === 'archived' ? (
          archivedPosts.length === 0 ? (
            <div className="empty-state panel">
              <span className="ico"><ArchiveIcon width={26} height={26} /></span>
              <b>Nothing archived</b>
              <p>Posts you archive are parked here — restore or delete them anytime.</p>
            </div>
          ) : (
            archivedPosts.map((post) => (
              <PostCard
                {...cardProps(post, {
                  manage: true,
                  liked: false,
                  onArchive: () => actions.restorePost(post),
                  onDelete: () => actions.deletePost(post),
                })}
              />
            ))
          )
        ) : loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 90 }} /></div>
            <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 70 }} /></div>
            <div className="panel" style={{ padding: 20 }}><div className="skeleton" style={{ height: 90 }} /></div>
          </div>
        ) : feedItems.length === 0 ? (
          <div className="empty-state panel">
            <span className="ico"><RssIcon width={26} height={26} /></span>
            <b>Feed is empty</b>
            <p>Be the first to post — or wait for the learning feeds to spin up.</p>
          </div>
        ) : (
          feedItems.map((item) =>
            item.kind === 'post' ? (
              <PostCard
                {...cardProps(item.data, {
                  onArchive: () => actions.archivePost(item.data),
                  onDelete: () => actions.deletePost(item.data),
                })}
              />
            ) : item.kind === 'hn' ? (
              <HnCard key={item.data.id} item={item.data} />
            ) : (
              <GhCard key={item.data.id} item={item.data} />
            )
          )
        )}
      </div>

      <aside className="feed-rail">
        <div className="panel grid-bg" style={{ padding: 18, border: '1px solid rgba(14,208,182,0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <img src="/assets/codebyterts-logo.gif" alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
            <div>
              <b style={{ fontSize: 15 }}>CODEBYTERS</b>
              <div className="ocr-label">bsit · dorsu</div>
            </div>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '0 0 12px' }}>
            The org that codes, builds, and ships. Questions, collabs and memes — all welcome here.
          </p>
          <div className="chip chip--teal">● members online</div>
        </div>

        <div className="panel" style={{ padding: 18 }}>
          <div className="ocr-label" style={{ marginBottom: 12 }}>// trending now</div>
          {learn.hn.slice(0, 4).map((h, i) => (
            <a key={h.id} href={h.link} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '9px 0', borderBottom: i < 3 ? '1px solid var(--bg-2)' : 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.45, color: 'var(--ink)' }}>{h.title}</div>
              <div className="ocr-label" style={{ marginTop: 3 }}>{timeAgo(h.published)}</div>
            </a>
          ))}
          {learn.hn.length === 0 && <div className="skeleton" style={{ height: 40 }} />}
        </div>

        <div className="panel" style={{ padding: 18, textAlign: 'center' }}>
          <img src="/assets/dorsu-logo.png" alt="DOrSU" style={{ width: 52, height: 52, objectFit: 'contain', margin: '0 auto 8px' }} />
          <div className="ocr-label" style={{ lineHeight: 1.9 }}>
            davao oriental state university<br />excellence · innovation · inclusion
          </div>
        </div>
      </aside>
    </div>
  );
}

function HnCard({ item }) {
  return (
    <article className="learn-card learn-card--hn panel">
      <div className="learn-head">
        <span className="src-icon src-icon--hn"><RssIcon width={16} height={16} /></span>
        <div>
          <b>Hacker News</b>
          <div className="meta">front page · rss feed</div>
        </div>
        <span className="chip chip--hn" style={{ marginLeft: 'auto' }}>HN</span>
      </div>
      <h3 className="learn-title"><a href={item.link} target="_blank" rel="noreferrer">{item.title}</a></h3>
      <div className="learn-foot">
        <span className="stat-l"><StarIcon width={13} height={13} />trending</span>
        <span className="stat-l"><ExternalIcon width={13} height={13} />{item.author}</span>
        <a href={item.link} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>Read</a>
      </div>
    </article>
  );
}

function GhCard({ item }) {
  return (
    <article className="learn-card learn-card--gh panel">
      <div className="learn-head">
        <span className="src-icon src-icon--gh"><GithubIcon width={16} height={16} /></span>
        <div>
          <b>GitHub</b>
          <div className="meta">open source · rest api</div>
        </div>
        <span className="chip chip--gh" style={{ marginLeft: 'auto' }}>GH</span>
      </div>
      <h3 className="learn-title"><a href={item.url} target="_blank" rel="noreferrer">{item.name}</a></h3>
      <p className="learn-desc">{item.description || 'A repository worth digging into — explore the source and learn something new.'}</p>
      <div className="learn-foot">
        <span className="stat-l"><StarIcon width={13} height={13} />{item.stars?.toLocaleString()}</span>
        <span className="stat-l"><BoxIcon width={13} height={13} />{item.language || '—'}</span>
        <a href={item.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}>
          Explore repo <ExternalIcon width={13} height={13} />
        </a>
      </div>
    </article>
  );
}
