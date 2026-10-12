import { useEffect, useState } from 'react';
import Icon from '../common/Icon.jsx';
import { resumeUrl } from '../../api/resumes.js';

function formatBytes(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* Full Resume — opens the candidate's original uploaded file in its own
   browser tab instead of previewing it inline. Loading a PDF/DOCX straight
   into this page (as a blob, or via an iframe, or via docx-preview's own
   ~175KB renderer) was making the candidate page itself heavy and slow to
   load — this panel only ever requests a lightweight signed URL, never the
   file's bytes, so the resume's size has no effect on this page at all. */
export default function ResumeViewer({ resumePath, resumeMeta }) {
  const [state, setState] = useState({ status: 'loading', url: null, downloadUrl: null, error: null });

  const fileName = resumeMeta?.name || (resumePath ? resumePath.split('/').pop() : 'Resume');

  useEffect(() => {
    let cancelled = false;
    if (!resumePath) { setState({ status: 'missing', url: null, downloadUrl: null, error: null }); return undefined; }

    setState({ status: 'loading', url: null, downloadUrl: null, error: null });
    Promise.all([resumeUrl(resumePath), resumeUrl(resumePath, true)])
      .then(([url, downloadUrl]) => { if (!cancelled) setState({ status: 'ready', url, downloadUrl, error: null }); })
      .catch((e) => { if (!cancelled) setState({ status: 'error', url: null, downloadUrl: null, error: e.message || 'Could not access this resume. You may not have permission, or the file may no longer exist.' }); });

    return () => { cancelled = true; };
  }, [resumePath]);

  const open = () => {
    if (state.url) window.open(state.url, '_blank', 'noopener');
  };

  return (
    <div className="ta-resumeview">
      <div className="ta-resumeview__bar">
        <span className="ta-resumeview__file"><Icon name="FileText" size={15} /> {fileName}{resumeMeta?.size ? <span className="ta-cell-sub"> · {formatBytes(resumeMeta.size)}</span> : null}</span>
        {state.downloadUrl && (
          <a className="ta-btn ta-btn--ghost ta-btn--sm" href={state.downloadUrl} download={fileName}>
            <Icon name="Download" size={14} /> Download resume
          </a>
        )}
      </div>

      <div className="ta-resumeview__body">
        {state.status === 'missing' && (
          <div className="ta-note ta-note--info"><Icon name="Info" size={14} /> No resume was uploaded for this candidate.</div>
        )}
        {state.status === 'loading' && (
          <div className="ta-cell-sub" style={{ padding: 16 }}>Loading resume…</div>
        )}
        {state.status === 'error' && (
          <div className="ta-note ta-note--err"><Icon name="AlertTriangle" size={14} /> {state.error}</div>
        )}
        {state.status === 'ready' && (
          <div className="ta-resumeview__open">
            <Icon name="FileText" size={32} />
            <p className="ta-cell-sub">Opens in a new browser tab — PDFs preview inline there; Word documents use whatever your browser or system has set up for them.</p>
            <button type="button" className="ta-btn ta-btn--primary" onClick={open}>
              <Icon name="ArrowRight" size={14} /> Open resume
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
