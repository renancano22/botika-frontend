import { useEffect, useRef, useState } from 'react';
import { Avatar, Modal } from './ui';
import { Svg } from './RequestCards';

/**
 * Profile picture pieces shared by every My Profile page (residents, pharmacy staff and the administrator),
 * so the picture looks and works the same for everyone.
 */

export const PHOTO_ICON = {
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
};

/** A picture change in Edit Profile: unchanged, a new picture (not saved yet) or removed (not saved yet). */
export type PhotoChange = { kind: 'keep' } | { kind: 'new'; data: string } | { kind: 'remove' };

/** One action in the profile picture menu (View / Change / Delete). */
export interface PhotoAction { key: string; icon: string; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }

/** Shrinks and crops the chosen picture to a 256×256 JPEG so it uploads fast and stays small. */
export function resizePhoto(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no canvas')); return; }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file is not a picture.')); };
    img.src = url;
  });
}

/** Profile picture with a camera button; tapping either opens the actions (View / Change / Delete). */
export function PhotoMenu({ src, name, actions, disabled = false }: { src: string | null | undefined; name: string; actions: PhotoAction[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close the menu when tapping elsewhere or pressing Esc.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="fb-avatar-wrap" ref={box}>
      <button type="button" className="fb-avatar" onClick={() => setOpen((o) => !o)} disabled={disabled}
        aria-haspopup="menu" aria-expanded={open} aria-label="Profile picture options" title="Profile picture options">
        <Avatar name={name} photo={src} size={128} />
      </button>
      <button type="button" className="fb-camera" onClick={() => setOpen((o) => !o)} disabled={disabled}
        aria-haspopup="menu" aria-expanded={open} aria-label="Profile picture options" title="Profile picture options">
        <Svg d={PHOTO_ICON.camera} size={19} width={2.2} />
      </button>
      {open && (
        <div className="pf-menu fb-photo-menu" role="menu">
          {actions.map((a) => (
            <button key={a.key} type="button" role="menuitem" className={a.danger ? 'pf-menu-danger' : ''} disabled={a.disabled}
              onClick={() => { setOpen(false); a.onClick(); }}>
              <Svg d={a.icon} size={18} /> {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Enlarged profile picture (or the first letter of the name when there is no picture). */
export function PhotoPreview({ src, name, note, emptyHint = 'No profile picture yet. You can add one in Edit Profile.', onClose }: {
  src: string | null | undefined; name: string; note?: string; emptyHint?: string; onClose: () => void;
}) {
  return (
    <Modal title="Profile Picture" onClose={onClose}>
      <div className="pf-preview">
        {src
          ? <img src={src} alt={`Profile picture of ${name}`} />
          : (
            <>
              <Avatar name={name} size={160} />
              <p className="muted small">{emptyHint}</p>
            </>
          )}
        <strong>{name}</strong>
        {note && <p className="muted small">{note}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

/** My Profile → Change Profile Picture: the chosen picture is shown for confirmation before it is saved. */
export function NewPhotoConfirm({ src, saving, onCancel, onSave }: { src: string; saving: boolean; onCancel: () => void; onSave: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={() => !saving && onCancel()}>
      <div className="modal confirm-modal pf-confirm" role="dialog" aria-modal="true" aria-labelledby="pf-photo-title" onMouseDown={(e) => e.stopPropagation()}>
        <img className="pf-new-photo" src={src} alt="New profile picture" />
        <h2 id="pf-photo-title">Change profile picture?</h2>
        <p>This picture will replace your current profile picture.</p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className="btn" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save Picture'}</button>
        </div>
      </div>
    </div>
  );
}

/** My Profile → Delete Profile Picture. */
export function DeletePhotoConfirm({ saving, onCancel, onDelete }: { saving: boolean; onCancel: () => void; onDelete: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={() => !saving && onCancel()}>
      <div className="modal confirm-modal pf-confirm" role="dialog" aria-modal="true" aria-labelledby="pf-del-title" onMouseDown={(e) => e.stopPropagation()}>
        <span className="confirm-icon"><Svg d={PHOTO_ICON.trash} size={28} /></span>
        <h2 id="pf-del-title">Delete profile picture?</h2>
        <p>Your picture will be removed and the default profile avatar will be shown instead.</p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={onDelete} disabled={saving}>{saving ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}
