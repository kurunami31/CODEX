import { useRef, useState } from 'react';
import Avatar from './Avatar';
import { useToast } from '../context/ToastContext';
import { timeAgo } from '../lib/format';
import { COMMENT_IMAGE_MAX, COMMENT_IMAGE_TYPES } from '../lib/usePostComments';
import { ReplyIcon, PencilIcon, TrashIcon, ImageIcon, XIcon } from './icons/Icons';

const COMMENT_LIMIT = 500;

export function pickCommentImage(file) {
  if (!file) return { file: null };
  if (!COMMENT_IMAGE_TYPES.includes(file.type)) return { error: 'Use PNG, JPEG, WebP or GIF.' };
  if (file.size > COMMENT_IMAGE_MAX) return { error: 'Keep it under 5 MB.' };
  return { file };
}

export default function CommentItem({
  comment,
  depth = 0,
  currentUserId,
  canModerate = false,
  busy = false,
  onReply,
  onEdit,
  onDelete,
  replies = [],
}) {
  const toast = useToast();
  const author = comment.profiles;
  const mine = comment.author_id === currentUserId;
  const edited = comment.updated_at && comment.updated_at !== comment.created_at;

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyImageFile, setReplyImageFile] = useState(null);
  const [replyImagePreview, setReplyImagePreview] = useState('');
  const replyFileRef = useRef(null);

  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(comment.content);
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState(comment.image_url || '');
  const editFileRef = useRef(null);

  const [lightbox, setLightbox] = useState(false);

  const clearReply = () => {
    if (replyImagePreview) URL.revokeObjectURL(replyImagePreview);
    setReplyDraft('');
    setReplyImageFile(null);
    setReplyImagePreview('');
    setReplyOpen(false);
  };

  const submitReply = async () => {
    if ((!replyDraft.trim() && !replyImageFile) || busy || !onReply) return;
    const { error } = await onReply(comment, replyDraft, replyImageFile);
    if (!error) clearReply();
  };

  const startEdit = () => {
    setEditDraft(comment.content);
    setEditImagePreview(comment.image_url || '');
    setEditImageFile(null);
    setEditing(true);
  };

  const clearEdit = () => {
    if (editImagePreview && editImagePreview !== comment.image_url) URL.revokeObjectURL(editImagePreview);
    setEditDraft(comment.content);
    setEditImagePreview(comment.image_url || '');
    setEditImageFile(null);
    setEditing(false);
  };

  const submitEdit = async () => {
    if (!editDraft.trim() || busy || !onEdit) return;
    const { error } = await onEdit(comment, editDraft, editImageFile);
    if (!error) clearEdit();
  };

  const handleDelete = () => {
    if (!onDelete) return;
    if (!window.confirm('Delete this comment permanently?')) return;
    onDelete(comment);
  };

  const attachImage = (file, setFile, setPreview) => {
    const res = pickCommentImage(file);
    if (res.error) {
      toast.error('Image', res.error);
      return;
    }
    setFile(res.file);
    if (res.file) setPreview(URL.createObjectURL(res.file));
  };

  return (
    <div className={`comment${depth > 0 ? ' comment--reply' : ''}`}>
      <Avatar name={author?.full_name} seed={comment.author_id} size={depth > 0 ? 26 : 30} url={author?.avatar_url} />
      <div className="comment-body">
        <div className="comment-meta">
          <b>{author?.full_name || 'Member'}</b>
          <span>{timeAgo(comment.created_at)}{edited ? ' · edited' : ''}</span>
        </div>
        {editing ? (
          <div className="comment-edit">
            <textarea
              className="textarea"
              value={editDraft}
              maxLength={COMMENT_LIMIT}
              onChange={(e) => setEditDraft(e.target.value)}
              autoFocus
            />
            {editImagePreview && (
              <div className="comment-form-image">
                <img src={editImagePreview} alt="Preview" />
                <button
                  type="button"
                  className="icon-btn composer-image-x"
                  onClick={() => {
                    if (editImagePreview !== comment.image_url) URL.revokeObjectURL(editImagePreview);
                    setEditImagePreview('');
                    setEditImageFile(null);
                  }}
                  aria-label="Remove image"
                >
                  <XIcon width={14} height={14} />
                </button>
              </div>
            )}
            <div className="comment-edit-foot">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => editFileRef.current?.click()} title="Attach an image">
                <ImageIcon width={14} height={14} /> Photo
              </button>
              <input
                ref={editFileRef}
                type="file"
                accept={COMMENT_IMAGE_TYPES.join(',')}
                style={{ display: 'none' }}
                onChange={(e) => {
                  attachImage(e.target.files?.[0], setEditImageFile, setEditImagePreview);
                  e.target.value = '';
                }}
              />
              <button className="btn btn-ghost btn-sm" onClick={clearEdit} disabled={busy}>Cancel</button>
              <button className="btn btn-accent btn-sm" onClick={submitEdit} disabled={!editDraft.trim() || busy}>
                {busy ? '…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p>{comment.content}</p>
            {comment.image_url && (
              <button
                type="button"
                className="comment-image-btn"
                onClick={() => setLightbox(true)}
                aria-label="View comment image"
              >
                <img src={comment.image_url} alt="" className="comment-image" loading="lazy" />
              </button>
            )}
          </>
        )}

        <div className="comment-actions">
          {onReply && (
            <button
              type="button"
              className={`comment-act${replyOpen ? ' comment-act--active' : ''}`}
              onClick={() => setReplyOpen((o) => !o)}
              aria-expanded={replyOpen}
            >
              <ReplyIcon width={13} height={13} /> Reply
            </button>
          )}
          {mine && onEdit && (
            <button type="button" className="comment-act" onClick={startEdit}>
              <PencilIcon width={13} height={13} /> Edit
            </button>
          )}
          {(mine || canModerate) && onDelete && (
            <button type="button" className="comment-act comment-act--danger" onClick={handleDelete}>
              <TrashIcon width={13} height={13} /> Delete
            </button>
          )}
        </div>

        {replyOpen && (
          <>
            <div className="comment-form">
              <input
                className="input"
                placeholder="Write a reply…"
                value={replyDraft}
                maxLength={COMMENT_LIMIT}
                onChange={(e) => setReplyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitReply();
                }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => replyFileRef.current?.click()}
                title="Attach an image"
              >
                <ImageIcon width={14} height={14} /> Photo
              </button>
              <input
                ref={replyFileRef}
                type="file"
                accept={COMMENT_IMAGE_TYPES.join(',')}
                style={{ display: 'none' }}
                onChange={(e) => {
                  attachImage(e.target.files?.[0], setReplyImageFile, setReplyImagePreview);
                  e.target.value = '';
                }}
              />
              <button
                className="btn btn-accent btn-sm"
                onClick={submitReply}
                disabled={(!replyDraft.trim() && !replyImageFile) || busy}
              >
                {busy ? '…' : 'Reply'}
              </button>
            </div>
            {replyImagePreview && (
              <div className="comment-form-image">
                <img src={replyImagePreview} alt="Preview" />
                <button
                  type="button"
                  className="icon-btn composer-image-x"
                  onClick={() => {
                    URL.revokeObjectURL(replyImagePreview);
                    setReplyImagePreview('');
                    setReplyImageFile(null);
                  }}
                  aria-label="Remove image"
                >
                  <XIcon width={14} height={14} />
                </button>
              </div>
            )}
          </>
        )}

        {replies.length > 0 && (
          <div className="comment-thread">
            {replies.map((r) => (
              <CommentItem
                key={r.id}
                comment={r}
                depth={depth + 1}
                currentUserId={currentUserId}
                canModerate={canModerate}
                busy={busy}
                onReply={onReply}
                onEdit={onEdit}
                onDelete={onDelete}
                replies={[]}
              />
            ))}
          </div>
        )}
      </div>

      {lightbox && comment.image_url && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setLightbox(false)}>
          <div className="lightbox">
            <button className="icon-btn lightbox-close" onClick={() => setLightbox(false)} aria-label="Close">
              <XIcon width={18} height={18} />
            </button>
            <img src={comment.image_url} alt="Comment" />
          </div>
        </div>
      )}
    </div>
  );
}