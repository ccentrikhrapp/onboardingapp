import { useEffect, useState } from 'react';
import Icon from '../common/Icon.jsx';
import Button from './Button.jsx';
import { listApplicationNotes, addApplicationNote, deleteApplicationNote } from '../../api/notes.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { initialsOf, avatarToneOf, formatDateTime } from '../../utils/format.js';

/* Internal TA/HR notes thread for one application — the Tiimi "stage notes"
   feature. Staff-only (candidates never load this). */
export default function NotesPanel({ applicationId }) {
  const toast = useToast();
  const { profile } = useApp();
  const [notes, setNotes] = useState(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const load = () => listApplicationNotes(applicationId).then(setNotes).catch(() => setNotes([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [applicationId]);

  const post = async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      await addApplicationNote(applicationId, body);
      setDraft('');
      load();
    } catch (e) {
      toast.error(e.message || 'Could not post this note.');
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this note?')) return;
    try {
      await deleteApplicationNote(id);
      load();
    } catch (e) {
      toast.error(e.message || 'Could not delete this note.');
    }
  };

  return (
    <div className="ta-notes">
      <div className="ta-notes__composer">
        <textarea
          className="ta-notes__input"
          placeholder="Add a note for the team…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
        />
        <Button onClick={post} disabled={!draft.trim() || posting} icon="Send">
          {posting ? 'Posting…' : 'Post'}
        </Button>
      </div>

      {notes === null && <p className="ta-cell-sub">Loading notes…</p>}
      {notes?.length === 0 && <p className="ta-cell-mute">No notes yet — the first one shows here.</p>}

      <div className="ta-notes__list">
        {notes?.map((n) => {
          const authorName = n.author?.full_name || n.author?.email || 'Someone';
          const mine = n.author?.id === profile?.id;
          return (
            <div className="ta-notes__item" key={n.id}>
              <span className={`ta-avatar ta-avatar--${avatarToneOf(authorName)}`}>{initialsOf(authorName)}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="ta-notes__itemhead">
                  <span className="ta-cell-strong">{authorName}</span>
                  <span className="ta-cell-sub">{formatDateTime(n.created_at)}</span>
                  {mine && (
                    <button className="ta-iconbtn ta-notes__del" onClick={() => remove(n.id)} aria-label="Delete note" title="Delete">
                      <Icon name="Trash2" size={13} />
                    </button>
                  )}
                </div>
                <p className="ta-notes__body">{n.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
