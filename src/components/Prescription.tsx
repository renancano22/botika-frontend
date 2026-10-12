import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api';
import type { MedicineRequest } from '../types';
import { Message, Modal } from './ui';
import { ICONS, Svg } from './RequestCards';

/** A prescription file ready to send: { name, data: "data:<type>;base64,..." }. */
export interface PrescriptionFile { name: string; data: string; type: string; size: number }

const MAX_BYTES = 4 * 1024 * 1024;
export const RX_ICON = 'M6 3h6a4 4 0 0 1 0 8H6zM6 11v10M10 11l9 10M19 13l-7 8';

/** Does this request include a medicine that needs a doctor's prescription? */
export function requiresPrescription(r: Pick<MedicineRequest, 'items' | 'request_type'>): boolean {
  return r.request_type === 'medicine' && r.items.some((i) => i.medicine.requires_prescription);
}

export function RxBadge({ small = false }: { small?: boolean }) {
  return (
    <span className={`rx-badge ${small ? 'rx-badge-sm' : ''}`} title="Requires a doctor's prescription">
      <Svg d={RX_ICON} size={small ? 12 : 14} width={2.4} /> Requires Prescription
    </span>
  );
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsDataURL(file);
  });
}

/** Photos are shrunk (longest side 1800 px, JPEG) so they upload fast but stay readable. */
async function prepareFile(file: File): Promise<PrescriptionFile> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_BYTES) throw new Error('The PDF is too large (4 MB at most).');
    return { name: file.name, type: file.type, size: file.size, data: await readAsDataUrl(file) };
  }
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error('Please choose a photo (JPG or PNG) or a PDF of the prescription.');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('This photo could not be opened. Please take a JPG photo instead.'));
      i.src = url;
    });
    const scale = Math.min(1, 1800 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This photo could not be processed.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.85);
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return { name, type: 'image/jpeg', data, size: Math.round((data.length - 23) * 0.75) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "Tap to upload" box for the prescription photo or PDF, with a preview once chosen. */
export function PrescriptionUpload({ value, onChange }: { value: PrescriptionFile | null; onChange: (f: PrescriptionFile | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const choose = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try { onChange(await prepareFile(file)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="rx-upload">
      <input ref={input} type="file" accept="image/*,application/pdf" hidden
        onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
      {value ? (
        <div className="rx-file">
          {value.type.startsWith('image/')
            ? <img src={value.data} alt="Prescription preview" />
            : <span className="rx-file-icon"><Svg d={ICONS.note} size={28} /></span>}
          <div className="rx-file-info">
            <strong>{value.name}</strong>
            <span className="muted small">{(value.size / 1024).toFixed(0)} KB · ready to send</span>
            <button type="button" className="link-button" onClick={() => input.current?.click()}>Change file</button>
          </div>
        </div>
      ) : (
        <button type="button" className="rx-drop" onClick={() => input.current?.click()} disabled={busy}>
          <Svg d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" size={34} width={2} />
          <strong>{busy ? 'Preparing…' : 'Tap to upload'}</strong>
          <span>Take a photo or choose a file (JPG, PNG, PDF)</span>
        </button>
      )}
      {error && <Message>{error}</Message>}
    </div>
  );
}

/** Opens the uploaded prescription of a request (image shown inside, PDF opened in a new tab). */
export function PrescriptionViewer({ requestId, local, onClose }: { requestId?: number; local?: PrescriptionFile; onClose: () => void }) {
  const [file, setFile] = useState<{ file_name: string; mime_type: string; data: string } | null>(
    local ? { file_name: local.name, mime_type: local.type, data: local.data } : null,
  );
  const [error, setError] = useState('');

  useEffect(() => {
    if (local || !requestId) return;
    api.get(`/requests/${requestId}/prescription`).then((res) => setFile(res.data)).catch((e) => setError(errorMessage(e)));
  }, [requestId, local]);

  const openPdf = async () => {
    if (!file) return;
    const blob = await (await fetch(file.data)).blob();
    window.open(URL.createObjectURL(blob), '_blank');
  };

  return (
    <Modal title="Prescription" onClose={onClose}>
      {error ? <Message>{error}</Message> : !file ? <p className="empty">Loading…</p> : file.mime_type.startsWith('image/') ? (
        <div className="rx-view">
          <img src={file.data} alt={file.file_name} />
          <a className="link-button" href={file.data} download={file.file_name}>Download</a>
        </div>
      ) : (
        <div className="rx-view">
          <p><strong>{file.file_name}</strong> (PDF)</p>
          <button className="btn" onClick={openPdf}>Open PDF</button>
        </div>
      )}
    </Modal>
  );
}
