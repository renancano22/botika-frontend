import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * Camera QR scanner (laptop webcam or phone camera).
 * Calls onScan once with the decoded Patient ID, then the parent closes the scanner.
 *
 * The scanner draws into its own <div> that React does not manage, and every mount
 * gets a fresh one. This avoids the "removeChild" error and the duplicated camera
 * box caused by React StrictMode mounting components twice in development.
 */
export default function QrScanner({ onScan }: { onScan: (text: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [error, setError] = useState('');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const host = document.createElement('div');
    host.id = `qr-reader-${Math.random().toString(36).slice(2)}`;
    container.appendChild(host);

    const scanner = new Html5Qrcode(host.id, false);
    let cancelled = false;
    let scanned = false;

    const started = scanner
      .start(
        { facingMode: 'environment' }, // back camera on phones; the normal webcam on laptops
        { fps: 10, qrbox: 220 },
        (text) => {
          if (scanned) return; // the camera reads ~10 frames per second, only use the first result
          scanned = true;
          onScanRef.current(text.trim());
        },
        () => undefined, // "no QR code in this frame" - ignore
      )
      .then(() => true)
      .catch(() => {
        if (!cancelled) setError('Cannot open the camera. Allow camera access in the browser, or type the Patient ID instead.');
        return false;
      });

    return () => {
      cancelled = true;
      started
        .then((ok) => (ok && scanner.isScanning ? scanner.stop() : undefined))
        .catch(() => undefined)
        .finally(() => host.remove());
    };
  }, []);

  return (
    <div className="qr-reader">
      {error && <div className="msg msg-error">{error}</div>}
      <div ref={containerRef} />
    </div>
  );
}
