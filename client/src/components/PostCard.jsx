import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from './Avatar';
import { formatEventDate } from '../lib/format';
import { HeartIcon, ShareIcon, PencilIcon, TrashIcon, ArchiveIcon, MenuDotsIcon } from './icons/Icons';

const LIMIT = 2000;

export default function PostCard({ post, liked, likeCount, onLike, onShare, mine, manage, editing, editDraft, onEditStart, onEditCancel, onEditChange, onEditSave, saving, onArchive, onDelete }) {
  const author = post.profiles;
  const when = formatEventDate(post.created_at);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const menuBtnRef = useRef(null);

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

  const goProfile = () => {
    const id = author?.id || post.author_id;
    if (id) navigate(`/app/profile/${id}`);
  };

  const run = (fn) => () => {
    setMenuOpen(false);
    menuBtnRef.current?.focus();
    fn();
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
        <span className={`role-pill post-role role-pill--${author?.role || 'student'}`}>{author?.role || 'student'}</span>
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
        </>
      )}
    </article>
  );
}
