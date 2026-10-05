import { Modal } from './Modal.jsx';
import Icon from './Icon.jsx';
import { SkeletonBlock } from './States.jsx';

function fileKind(fileName) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
  return 'other';
}

/** Pre-offer/onboarding documents are only ever PDF or image (enforced at
    upload) — a reviewer needs to actually look at one to verify it, not just
    trust a filename, so this renders it inline instead of a new-tab link. */
export default function DocumentPreviewModal({ open, onClose, url, fileName, title }) {
  const kind = fileKind(fileName);
  return (
    <Modal open={open} onClose={onClose} title={title || fileName || 'Document'} size="xl">
      {!url ? (
        <SkeletonBlock lines={4} />
      ) : kind === 'pdf' ? (
        <iframe src={url} title={fileName || 'Document preview'} style={{ width: '100%', height: '75vh', border: 0, borderRadius: 8 }} />
      ) : kind === 'image' ? (
        <img src={url} alt={fileName || 'Document preview'} style={{ maxWidth: '100%', maxHeight: '75vh', display: 'block', margin: '0 auto', borderRadius: 8 }} />
      ) : (
        <p className="text-secondary">
          <Icon name="FileText" size={16} /> Can't preview this file type in the browser.{' '}
          <a href={url} target="_blank" rel="noopener noreferrer">Open in a new tab</a> instead.
        </p>
      )}
    </Modal>
  );
}
