import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import Icon from '../common/Icon.jsx';
import { resumeUrl } from '../../api/resumes.js';

function extOf(name = '') {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function formatBytes(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* Full in-app resume preview — the candidate's original uploaded file,
   not the fields extracted from it. PDFs use the browser's own embedded
   viewer (an <iframe> already gets zoom, page navigation and scrolling for
   free — the same technique TADocumentVerifyPage.jsx uses for documents).
   DOCX is rendered client-side with docx-preview, which keeps the file
   private (nothing is uploaded to a third-party viewer) and preserves
   headings/tables/bullets/layout. Legacy .doc has no reliable in-browser
   renderer, so it — and anything else that fails to render — falls back
   to a clear message plus the download link, never a blank preview. */
export default function ResumeViewer({ resumePath, resumeMeta }) {
  const [state, setState] = useState({ status: 'loading', url: null, downloadUrl: null, error: null });
  const docxHost = useRef(null);
  const docxStyleHost = useRef(null);

  const fileName = resumeMeta?.name || (resumePath ? resumePath.split('/').pop() : 'Resume');
  const ext = extOf(fileName);

  useEffect(() => {
    let cancelled = false;
    if (!resumePath) { setState({ status: 'missing', url: null, downloadUrl: null, error: null }); return undefined; }

    setState({ status: 'loading', url: null, downloadUrl: null, error: null });

    const run = async () => {
      let url, downloadUrl;
      try {
        [url, downloadUrl] = await Promise.all([resumeUrl(resumePath), resumeUrl(resumePath, true)]);
      } catch (e) {
        if (!cancelled) setState({ status: 'error', url: null, downloadUrl: null, error: e.message || 'Could not open this resume.' });
        return;
      }
      if (cancelled) return;

      if (ext === 'pdf') {
        setState({ status: 'pdf', url, downloadUrl, error: null });
        return;
      }
      if (ext === 'docx') {
        setState({ status: 'rendering-docx', url, downloadUrl, error: null });
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error('download failed');
          const blob = await res.blob();
          if (cancelled) return;
          if (docxHost.current) docxHost.current.innerHTML = '';
          await renderAsync(blob, docxHost.current, docxStyleHost.current, {
            inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true,
          });
          if (!cancelled) setState({ status: 'docx', url, downloadUrl, error: null });
        } catch {
          if (!cancelled) setState({ status: 'unsupported', url, downloadUrl, error: "This Word document couldn't be previewed." });
        }
        return;
      }
      // .doc (legacy binary format) and anything else: no reliable in-browser renderer.
      setState({
        status: 'unsupported', url, downloadUrl,
        error: ext === 'doc'
          ? 'Legacy .doc files can’t be previewed in-browser — download it to view the original.'
          : "This file type can't be previewed here.",
      });
    };
    run();
    return () => { cancelled = true; };
  }, [resumePath, ext]);

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
        {(state.status === 'loading' || state.status === 'rendering-docx') && (
          <div className="ta-cell-sub" style={{ padding: 16 }}>Loading resume…</div>
        )}
        {state.status === 'error' && (
          <div className="ta-note ta-note--err"><Icon name="AlertTriangle" size={14} /> {state.error}</div>
        )}
        {state.status === 'pdf' && (
          <iframe className="ta-resumeview__frame" src={state.url} title={fileName} />
        )}
        {/* Kept mounted (just hidden) while rendering-docx, since docx-preview renders into it. */}
        <div style={{ display: state.status === 'docx' ? 'block' : 'none' }}>
          {/* docx-preview appends its own generated <style> elements in here. */}
          <div ref={docxStyleHost} style={{ display: 'none' }} />
          <div className="ta-resumeview__docx" ref={docxHost} />
        </div>
        {state.status === 'unsupported' && (
          <div className="ta-note ta-note--warn">
            <Icon name="AlertTriangle" size={14} />
            <span>
              {state.error} {state.downloadUrl && <a className="ta-link" href={state.downloadUrl} download={fileName}>Download the original file</a>}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
