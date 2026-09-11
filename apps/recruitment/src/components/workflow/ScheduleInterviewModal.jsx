import { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import Button from '../common/Button.jsx';
import { Field, Input, Textarea, FieldGrid } from '../ta/Field.jsx';

function emptyPanelist() {
  return { name: '', email: '', department: '', designation: '' };
}

/* TA schedules one interview round + assigns the panel. Round names are
   free text — never a hardcoded fixed set (master prompt §38). */
export default function ScheduleInterviewModal({ open, onClose, roundNumber, onSchedule, busy }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('45');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [location, setLocation] = useState('');
  const [instructions, setInstructions] = useState('');
  const [panelists, setPanelists] = useState([emptyPanelist()]);
  const [error, setError] = useState('');

  const setPanelist = (i, patch) =>
    setPanelists((list) => list.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addPanelist = () => setPanelists((list) => [...list, emptyPanelist()]);
  const removePanelist = (i) => setPanelists((list) => list.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!name.trim() || !date || !time) {
      setError('Round name, date and time are required.');
      return;
    }
    setError('');
    onSchedule({
      name: name.trim(),
      description: description.trim() || undefined,
      scheduledAt: new Date(`${date}T${time}`).toISOString(),
      durationMinutes: duration ? Number(duration) : undefined,
      meetingUrl: meetingUrl.trim() || undefined,
      location: location.trim() || undefined,
      instructions: instructions.trim() || undefined,
      panelists: panelists.filter((p) => p.name.trim()),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Schedule round ${roundNumber}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Scheduling…' : 'Schedule interview'}</Button>
        </>
      }
    >
      {error && <p className="ta-field__error" style={{ marginBottom: 10 }}>{error}</p>}
      <FieldGrid>
        <Field label="Round name" required full>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Technical Evaluation" />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time" required>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Duration (minutes)">
          <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>
        <Field label="Meeting link">
          <Input value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://" />
        </Field>
        <Field label="Location" hint="If in-person" full>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label="Instructions for the candidate" hint="Optional" full>
          <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </Field>
      </FieldGrid>

      <div className="ta-field__labelrow" style={{ marginTop: 14, marginBottom: 8 }}>
        <label className="ta-field__label">Interview Panel</label>
        <button type="button" className="ta-link" onClick={addPanelist}>+ Add panelist</button>
      </div>
      {panelists.map((p, i) => (
        <FieldGrid key={i}>
          <Field label="Name"><Input value={p.name} onChange={(e) => setPanelist(i, { name: e.target.value })} /></Field>
          <Field label="Email" hint="For their invite"><Input value={p.email} onChange={(e) => setPanelist(i, { email: e.target.value })} /></Field>
          <Field label="Department"><Input value={p.department} onChange={(e) => setPanelist(i, { department: e.target.value })} /></Field>
          <Field label="Designation">
            <div style={{ display: 'flex', gap: 8 }}>
              <Input value={p.designation} onChange={(e) => setPanelist(i, { designation: e.target.value })} />
              {panelists.length > 1 && (
                <button type="button" className="ta-iconbtn" onClick={() => removePanelist(i)} aria-label="Remove panelist">×</button>
              )}
            </div>
          </Field>
        </FieldGrid>
      ))}
    </Modal>
  );
}
