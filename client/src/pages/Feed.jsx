import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import { fetchFeedHn, fetchFeedGitHub } from '../lib/api';
import { timeAgo, formatEventDate } from '../lib/format';
import { HeartIcon, ShareIcon, ExternalIcon, StarIcon, GithubIcon, RssIcon, BoxIcon } from '../components/icons/Icons';

const LIMIT = 2000;

export default function Feed() {
  const { user, profile } = useAuth();
  const toast = useToast();

  const [posts, setPosts] = useState([]);
  const [likes, setLikes] = useState([]);
  const [learn, setLearn] = useState({ hn: [], gh: [] });
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const loadedRef = useRef(false);

  const loadLikes = useCallback(async () => {
    const { data } = await supabase.from('likes').select('post_id, user_id');
    if (data) setLikes(data);
  }, []);

  const loadPosts = useCallback(async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('id, content, created_at, profiles(full_name, role, year_level)')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Feed error', error.message);
      return;
    }
    setPosts(data || []);
  }, [toast]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadPosts();
    loadLikes();
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
  }, [loadPosts, loadLikes]);

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

  const toggleLike = async (postId) => {
    if (!user) return;
    const mine = likedByMe.has(postId);
    const { error } = mine
      ? await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id)
      : await supabase.from('likes').insert({ post_id: postId, user_id: user.id });
    if (!error) await loadLikes();
  };

  const sharePost = async (post) => {
    try {
      await navigator.clipboard.writeText(`${post.profiles?.full_name || 'Member'} on CODEX: ${post.content.slice(0, 100)}`);
      toast.ok('Copied', 'Post link copied to clipboard — share it!');
    } catch {
      toast.info('Share', 'Clipboard unavailable on this device.');
    }
  };

  const submitPost = async () => {
    const content = draft.trim();
    if (!content || posting) return;
    setPosting(true);
    const { error } = await supabase.from('posts').insert({ author_id: user.id, content });
    setPosting(false);
    if (error) return toast.error('Could not post', error.message);
    setDraft('');
    toast.ok('Posted', 'Your message is live on the feed.');
    loadPosts();
  };

  const learningItems = useMemo(() => {
    const items = learn.hn.map((h) => ({ kind: 'hn', ts: h.published, data: h }));
    const ghItems = learn.gh.map((g) => ({ kind: 'gh', ts: g.updated, data: g }));
    return [...items, ...ghItems].sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  }, [learn]);

  const feedItems = useMemo(() => {
    const ps = posts.map((p) => ({ kind: 'post', ts: p.created_at, data: p }));
    return [...ps, ...learningItems].sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  }, [posts, learningItems]);

  return (
    <div className="feed-cols">
      <div className="feed-main">
        <div className="composer panel">
          <div className="row">
            <Avatar name={profile?.full_name} seed={user?.id} size={42} ring />
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
          <div className="foot">
            <span className="count">{draft.length}/{LIMIT}</span>
            <button className="btn btn-accent btn-sm" onClick={submitPost} disabled={!draft.trim() || posting}>
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>

        {feedError && (
          <div className="portal-config" style={{ marginBottom: 0 }}>{feedError}</div>
        )}

        {loading ? (
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
              <PostCard key={`p-${item.data.id}`} post={item.data} liked={likedByMe.has(item.data.id)} likeCount={likeCount.get(item.data.id) || 0} onLike={() => toggleLike(item.data.id)} onShare={() => sharePost(item.data)} />
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
              <b style={{ fontSize: 14 }}>CODEBYTERS</b>
              <div className="ocr-label">bsit · dorsu</div>
            </div>
          </div>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '0 0 12px' }}>
            The org that codes, builds, and ships. Questions, collabs and memes — all welcome here.
          </p>
          <div className="chip chip--teal">● members online</div>
        </div>

        <div className="panel" style={{ padding: 18 }}>
          <div className="ocr-label" style={{ marginBottom: 12 }}>// trending now</div>
          {learn.hn.slice(0, 4).map((h, i) => (
            <a key={h.id} href={h.link} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '9px 0', borderBottom: i < 3 ? '1px solid var(--bg-2)' : 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: 'var(--ink)' }}>{h.title}</div>
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

function PostCard({ post, liked, likeCount, onLike, onShare }) {
  const author = post.profiles;
  const when = formatEventDate(post.created_at);
  return (
    <article className="post-card panel">
      <div className="post-head">
        <Avatar name={author?.full_name} seed={author?.id} size={40} />
        <div className="who">
          <b>{author?.full_name || 'Member'}</b>
          <span>{when.day} · {when.time}</span>
        </div>
        <span className={`role-pill post-role role-pill--${author?.role || 'student'}`}>{author?.role || 'student'}</span>
      </div>
      <p className="post-body">{post.content}</p>
      <div className="post-actions">
        <button className={liked ? 'button--liked' : ''} onClick={onLike}>
          <HeartIcon width={17} height={17} fill={liked ? 'currentColor' : 'none'} />
          {likeCount > 0 ? likeCount : 'Like'}
        </button>
        <button onClick={onShare}>
          <ShareIcon width={17} height={17} />
          Share
        </button>
      </div>
    </article>
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
