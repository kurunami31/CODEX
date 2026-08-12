import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from './Avatar';
import { formatEventDate, timeAgo } from '../lib/format';
import { roleLabel } from '../lib/roles';
import { HeartIcon, ShareIcon, PencilIcon, TrashIcon, ArchiveIcon, MenuDotsIcon, CommentIcon, XIcon } from './icons/Icons';

const LIMIT = 2000;
const COMMENT_LIMIT = 500;

export default function PostCard({
  post, liked, likeCount, onLike, onShare, mine, manage,
  editing, editDraft, onEditStart, onEditCancel, onEditChange, onEditSave, saving, onArchive, onDelete,
  commentCount = 0, commentsOpen = false, onCommentsToggle, comments = null, onAddComment, onDeleteComment,
  commentsBusy = false, currentUserId, canModerate = false,
}) {
  const author = post.profiles;
  const when = formatEventDate(post.created_at);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [lightbox, setLightbox] = useState(false);
  const menuRef = useRef(null);
  const menuBtnRef = useRef(null);
  const commentInputRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector('.menu-item')?.focus();
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const goProfile = () => {
    const id = author?.id || post.author_id;
    if (id) navigate(`/app/profile/${id}`);
  };

  const run = (fn) => () => {
    setMenuOpen(false);
    menuBtnRef.current?.focus();
    fn();
  };

  const submitComment = async () => {
    if (!commentDraft.trim() || commentsBusy || !onAddComment) return;
    const { error } = await onAddComment(post.id, commentDraft);
    if (!error) setCommentDraft('');
    else commentInputRef.current?.focus();
  };

  return (
    <article className="post-card panel">
      <div className="post-head">
        <button type="button" className="post-author" onClick={goProfile} title="View profile">
          <Avatar name={author?.full_name} seed={author?.id} size={40} url={author?.avatar_url} />
          <span className="who">
            <b>{author?.full_name || 'Member'}</b>
            <span>{when.day} · {when.time}</span>
          </span>
        </button>
        <span className={`role-pill post-role role-pill--${author?.role || 'student'}`}>{roleLabel(author?.role)}</span>
        {(mine || manage) && (
          <div className="post-menu" ref={menuRef}>
            <button
              type="button"
              ref={menuBtnRef}
              className={`post-menu-btn${menuOpen ? ' post-menu-btn--open' : ''}`}
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Post options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MenuDotsIcon width={18} height={18} />
            </button>
            {menuOpen && (
              <div className="post-menu-drop" role="menu">
                {!manage && (
                  <button type="button" className="menu-item" role="menuitem" onClick={run(onEditStart)}>
                    <PencilIcon width={16} height={16} />
                    Edit
                  </button>
                )}
                <button type="button" className="menu-item" role="menuitem" onClick={run(onArchive)}>
                  <ArchiveIcon width={16} height={16} />
                  {manage ? 'Restore' : 'Archive'}
                </button>
                <button type="button" className="menu-item menu-item--danger" role="menuitem" onClick={run(onDelete)}>
                  <TrashIcon width={16} height={16} />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {editing ? (
        <div className="post-edit">
          <textarea
            className="textarea"
            value={editDraft}
            maxLength={LIMIT}
            onChange={(e) => onEditChange(e.target.value)}
            autoFocus
          />
          <div className="foot">
            <span className="count">{editDraft.length}/{LIMIT}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={onEditCancel} disabled={saving}>Cancel</button>
              <button className="btn btn-accent btn-sm" onClick={onEditSave} disabled={!editDraft.trim() || saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="post-body">{post.content}</p>
          {post.image_url && (
            <button
              type="button"
              className="post-image-btn"
              onClick={() => setLightbox(true)}
              aria-label="View post image"
            >
              <img src={post.image_url} alt="" className="post-image" loading="lazy" />
            </button>
          )}
          <div className="post-actions">
            <button className={liked ? 'button--liked' : ''} onClick={onLike}>
              <HeartIcon width={17} height={17} fill={liked ? 'currentColor' : 'none'} />
              {likeCount > 0 ? likeCount : 'Like'}
            </button>
            <button onClick={onCommentsToggle} className={commentsOpen ? 'button--active' : ''}>
              <CommentIcon width={17} height={17} />
              {commentCount > 0 ? commentCount : 'Comment'}
            </button>
            <button onClick={onShare}>
              <ShareIcon width={17} height={17} />
              Share
            </button>
          </div>
        </>
      )}

      {commentsOpen && !editing && (
        <div className="post-comments">
          {comments === null ? (
            <div className="skeleton" style={{ height: 44 }} />
          ) : comments.length === 0 ? (
            <div className="post-comments-empty">No comments yet — start the convo.</div>
          ) : (
            comments.map((c) => (
              <div className="comment" key={c.id}>
                <Avatar name={c.profiles?.full_name} seed={c.author_id} size={30} url={c.profiles?.avatar_url} />
                <div className="comment-body">
                  <div className="comment-meta">
                    <b>{c.profiles?.full_name || 'Member'}</b>
                    <span>{timeAgo(c.created_at)}</span>
                    {(c.author_id === currentUserId || canModerate) && (
                      <button
                        type="button"
                        className="comment-del"
                        onClick={() => onDeleteComment?.(post.id, c.id)}
                        aria-label="Delete comment"
                        title="Delete comment"
                      >
                        <XIcon width={12} height={12} />
                      </button>
                    )}
                  </div>
                  <p>{c.content}</p>
                </div>
              </div>
            ))
          )}
          {onAddComment && (
            <div className="comment-form">
              <input
                ref={commentInputRef}
                className="input"
                placeholder="Write a comment…"
                value={commentDraft}
                maxLength={COMMENT_LIMIT}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitComment();
                }}
              />
              <button
                className="btn btn-accent btn-sm"
                onClick={submitComment}
                disabled={!commentDraft.trim() || commentsBusy}
              >
                {commentsBusy ? '…' : 'Post'}
              </button>
            </div>
          )}
        </div>
      )}

      {lightbox && post.image_url && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setLightbox(false)}>
          <div className="lightbox">
            <button className="icon-btn lightbox-close" onClick={() => setLightbox(false)} aria-label="Close">
              <XIcon width={18} height={18} />
            </button>
            <img src={post.image_url} alt="Post" />
          </div>
        </div>
      )}
    </article>
  );
}
