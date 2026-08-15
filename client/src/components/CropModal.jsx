import { useEffect, useRef, useState } from 'react';
import { XIcon, CheckIcon } from './icons/Icons';

const VIEWPORT = 300; // px — matches the .crop-stage box
const OUTPUT = 512; // square avatar size

/**
 * Square crop tool for profile photos. Loads the picked file into a fixed
 * square viewport; the user drags to pan and uses the slider to zoom. On
 * confirm the visible square is rendered to a 512×512 PNG File and passed
 * to `onConfirm` (the caller then uploads it as the avatar).
 */
export default function CropModal({ file, onCancel, onConfirm }) {
  const [img, setImg] = useState(null); // { el, w, h } decoded image
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const stageRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => setImg({ el, w: el.naturalWidth, h: el.naturalHeight });
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const fitScale = img ? Math.max(VIEWPORT / img.w, VIEWPORT / img.h) : 1;
  const scale = fitScale * zoom;
  const imgW = img ? img.w * scale : VIEWPORT;
  const imgH = img ? img.h * scale : VIEWPORT;

  const clampOffset = (x, y) => {
    const minX = Math.min(0, VIEWPORT - imgW);
    const minY = Math.min(0, VIEWPORT - imgH);
    return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
  };

  // Keep the image covering the square whenever zoom / size changes.
  useEffect(() => {
    setOffset((o) => clampOffset(o.x, o.y));
  }, [imgW, imgH]);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: e.pointerId, sx: e.clientX - offset.x, sy: e.clientY - offset.y };
  };
  const onPointerMove = (e) => {
    if (!dragRef.current || dragRef.current.id !== e.pointerId) return;
    setOffset(clampOffset(e.clientX - dragRef.current.sx, e.clientY - dragRef.current.sy));
  };
  const onPointerUp = (e) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  };

  const confirm = async () => {
    if (!img || !stageRef.current || !imgRef.current) return;
    // Derive the visible crop from the actual rendered boxes, so the math
    // stays correct even if the stage is smaller on narrow phones.
    const stageRect = stageRef.current.getBoundingClientRect();
    const imgRect = imgRef.current.getBoundingClientRect();
    const toNatural = img.el.naturalWidth / imgRect.width;
    const sx = (stageRect.left - imgRect.left) * toNatural;
    const sy = (stageRect.top - imgRect.top) * toNatural;
    const sw = stageRect.width * toNatural;
    const sh = stageRect.height * toNatural;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img.el, sx, sy, sw, sh, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const out = new File([blob], `avatar-${Date.now()}.png`, { type: 'image/png' });
      onConfirm(out);
    }, 'image/png');
  };

  const previewScale = 96 / VIEWPORT;

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <div className="modal-head">
          <h3>Crop your photo</h3>
          <button className="icon-btn" onClick={onCancel} aria-label="Close"><XIcon width={16} height={16} /></button>
        </div>
        <div className="modal-body crop-modal-body">
          {img ? (
            <>
              <div
                className="crop-stage"
                ref={stageRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <img
                  ref={imgRef}
                  className="crop-img"
                  src={img.el.src}
                  alt=""
                  draggable={false}
                  style={{ width: imgW, height: imgH, transform: `translate(${offset.x}px, ${offset.y}px)` }}
                />
              </div>
              <div className="crop-tools">
                <div
                  className="crop-preview"
                  aria-hidden="true"
                  style={{
                    backgroundImage: `url(${img.el.src})`,
                    backgroundSize: `${imgW * previewScale}px ${imgH * previewScale}px`,
                    backgroundPosition: `${offset.x * previewScale}px ${offset.y * previewScale}px`,
                  }}
                />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                  <span className="ocr-label">drag to frame · zoom to fit</span>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.01"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    aria-label="Zoom"
                    className="crop-range"
                  />
                  <span className="ocr-label" style={{ fontSize: 8.5 }}>saves as a 512 × 512 png</span>
                </div>
              </div>
            </>
          ) : (
            <div className="skeleton" style={{ width: 300, height: 300 }} />
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button className="btn btn-accent" onClick={confirm} disabled={!img}>
              <CheckIcon width={15} height={15} /> Use photo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
