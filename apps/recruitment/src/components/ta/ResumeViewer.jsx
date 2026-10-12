import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import Icon from '../common/Icon.jsx';
import { resumeUrl } from '../../api/resumes.js';

function extOf(name = '') {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

const MIME_EXT = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
};
/** The MIME type recorded at upload time (resumeMeta.type) is what the
    browser's own file picker reported for the actual file content — more
    authoritative than guessing from the filename, which falls back to only
    when MIME type is missing or unrecognised (older records, or a browser
    that didn't set `file.type`). */
function fileKind(fileName, mimeType) {
  return MIME_EXT[mimeType] || extOf(fileName);
}

function formatBytes(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* Full in-app resume preview — the candidate's original uploaded file, not
   the fields extracted from it.

   Both PDF and DOCX are fetched as a blob up front and verified before
   anything is shown, instead of pointing an <iframe> straight at the signed
   URL: a signed URL handed to an <iframe> gives no error signal at all if
   the load fails for any reason (an expired URL, a permission error, a
   network hiccup) — it just renders blank, which reads exactly like "no
   resume" even though one was uploaded. Fetching first means a real failure
   becomes a real, specific message, and a blob: URL renders the PDF inline
   reliably regardless of how the storage response's headers come back.
   DOCX itself is rendered by docx-preview (client-side, so the file never
   leaves the browser), preserving headings/tables/bullets/layout. Legacy
   .doc has no reliable in-browser renderer, so it — and anything else that
   fails — falls back to a clear message plus the download link, never a
   blank preview. */
export default function ResumeViewer({ resumePath, resumeMeta }) {
  const [state, setState] = useState({ status: 'loading', url: null, downloadUrl: null, error: null });
  const docxHost = useRef(null);
  const docxStyleHost = useRef(null);
  const blobUrlRef = useRef(null); // revoked on cleanup/re-run, not left to leak

  const fileName = resumeMeta?.name || (resumePath ? resumePath.split('/').pop() : 'Resume');
  const ext = fileKind(fileName, resumeMeta?.type);

  useEffect(() => {
    let cancelled = false;
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }

    if (!resumePath) { setState({ status: 'missing', url: null, downloadUrl: null, error: null }); return undefined; }

    setState({ status: 'loading', url: null, downloadUrl: null, error: null });

    const run = async () => {
      let signed, downloadUrl;
      try {
        [signed, downloadUrl] = await Promise.all([resumeUrl(resumePath), resumeUrl(resumePath, true)]);
      } catch (e) {
        // signedUrl() itself failed — an RLS/permission error, or the
        // object genuinely doesn't exist in storage even though the
        // database row does.
        if (!cancelled) setState({ status: 'error', url: null, downloadUrl: null, error: e.message || 'Could not access this resume. You may not have permission, or the file may no longer exist.' });
        return;
      }
      if (cancelled) return;

      if (ext !== 'pdf' && ext !== 'docx') {
        // .doc (legacy binary format) and anything else: no reliable
        // in-browser renderer — still a real, accessible file, so the
        // download link is kept working.
        setState({
          status: 'unsupported', url: null, downloadUrl,
          error: ext === 'doc'
            ? 'Legacy .doc files can’t be previewed in-browser — download it to view the original.'
            : "This file type can't be previewed here.",
        });
        return;
      }

      let blob;
      try {
        const res = await fetch(signed);
        if (!res.ok) throw new Error(res.status === 403 ? 'permission denied' : `HTTP ${res.status}`);
        blob = await res.blob();
      } catch (e) {
        if (!cancelled) setState({ status: 'error', url: null, downloadUrl, error: 'Could not load this resume file. The link may have expired — try reopening this tab.' });
        return;
      }
      if (cancelled) return;

      if (ext === 'pdf') {
        const objectUrl = URL.createObjectURL(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }));
        blobUrlRef.current = objectUrl;
        setState({ status: 'pdf', url: objectUrl, downloadUrl, error: null });
        return;
      }

      // docx
      setState({ status: 'rendering-docx', url: null, downloadUrl, error: null });
      try {
        if (docxHost.current) docxHost.current.innerHTML = '';
        await renderAsync(blob, docxHost.current, docxStyleHost.current, {
          inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true,
        });
        if (!cancelled) setState({ status: 'docx', url: null, downloadUrl, error: null });
      } catch {
        if (!cancelled) setState({ status: 'unsupported', url: null, downloadUrl, error: "This Word document couldn't be previewed." });
      }
    };
    run();
    return () => {
      cancelled = true;
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    };
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
