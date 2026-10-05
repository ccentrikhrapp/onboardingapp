import { useMemo, useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import Button from '../common/Button.jsx';
import { Field, Input, Select, Textarea, FieldGrid } from '../ta/Field.jsx';
import { generateMeetingLink } from '../../api/interviews.js';
import { emailError, notPastDateError } from '../../utils/validation.js';

const MEETING_TYPES = [
  { value: 'virtual', label: 'Virtual Interview' },
  { value: 'in_person', label: 'In-Person Interview' },
];
const PLATFORMS = [
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'google_meet', label: 'Google Meet' },
];
const DURATIONS = [15, 30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} minutes` }));
// No office-locations table exists yet — a small, easily-extended default list
// stands in for one, with "Other" always available as an escape hatch.
const OFFICE_LOCATIONS = [
  'Ccentrik Office – Ghaziabad',
  'Ccentrik Office – Noida',
  'Ccentrik Office – Delhi',
  'Other',
];

/* Business-hours time slots, 15-minute increments only (09:00–18:00) — never
   a free-text/native time input, so an interview can't land on an odd minute
   like 3:16 PM. Slots already in the past are dropped when `dateStr` is
   today, so a same-day round can't be booked for a time that's already gone. */
function buildTimeSlots(dateStr) {
  const now = new Date();
  const isToday = dateStr && new Date(`${dateStr}T00:00`).toDateString() === now.toDateString();
  const slots = [];
  for (let h = 9; h <= 18; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 18 && m > 0) continue; // stop at 06:00 PM
      if (isToday && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes()))) continue;
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const period = h < 12 ? 'AM' : 'PM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      slots.push({ value, label: `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}` });
    }
  }
  return slots;
}

function emptyPanelist() {
  return { name: '', email: '', department: '', designation: '' };
}

/* TA schedules one interview round + assigns the panel. Round names are
   free text — never a hardcoded fixed set (master prompt §38). Meeting type
   (Virtual/In-Person) drives which fields show below it: Virtual generates
   a Teams/Google Meet link (see api/interviews.js#generateMeetingLink, a
   thin wrapper over a mock-or-real service layer — never something the TA
   types by hand), In-Person asks for a physical location instead. */
export default function ScheduleInterviewModal({ open, onClose, roundNumber, plannedRound, onSchedule, busy, candidateEmail }) {
  const [name, setName] = useState('');
  const [isHrRound, setIsHrRound] = useState(false);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('45');
  const [meetingType, setMeetingType] = useState('virtual'); // 'virtual' | 'in_person'
  const [platform, setPlatform] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [location, setLocation] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [locationDetails, setLocationDetails] = useState('');
  const [instructions, setInstructions] = useState('');
  const [panelists, setPanelists] = useState([emptyPanelist()]);
  const [fieldErrors, setFieldErrors] = useState({}); // { name, date, time, meetingPlatform, meetingLink, location, panelist_0, ... }
  const [copied, setCopied] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const setPanelist = (i, patch) =>
    setPanelists((list) => list.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addPanelist = () => setPanelists((list) => [...list, emptyPanelist()]);
  const removePanelist = (i) => setPanelists((list) => list.filter((_, idx) => idx !== i));

  const pickPlatform = async (value) => {
    setPlatform(value);
    setMeetingUrl('');
    setLinkError('');
    setGeneratingLink(true);
    try {
      const result = await generateMeetingLink(value, {
        roundName: name.trim() || 'Interview',
        scheduledAt: date && time ? new Date(`${date}T${time}`).toISOString() : undefined,
        durationMinutes: duration ? Number(duration) : undefined,
      });
      setMeetingUrl(result.url);
    } catch (err) {
      setLinkError(err.message || 'Could not generate a meeting link. Try again.');
    } finally {
      setGeneratingLink(false);
    }
  };

  const pickMeetingType = (value) => {
    setMeetingType(value);
    setFieldErrors({});
    if (value === 'in_person') {
      setPlatform('');
      setMeetingUrl('');
      setLinkError('');
    } else {
      setLocation('');
      setCustomLocation('');
      setLocationDetails('');
    }
  };

  const timeSlots = useMemo(() => buildTimeSlots(date), [date]);
  const resolvedLocation = location === 'Other' ? customLocation.trim() : location;

  const copyLink = () => {
    navigator.clipboard?.writeText(meetingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const submit = () => {
    const fe = {};
    if (!(plannedRound ? plannedRound.name : name).trim()) fe.name = 'Round name is required.';
    const dateMsg = notPastDateError(date, { required: true, label: 'interview date' });
    if (dateMsg) fe.date = dateMsg;
    if (!time) fe.time = 'Please select a time.';
    if (meetingType === 'virtual') {
      if (!platform) fe.meetingPlatform = 'Choose a meeting platform.';
      else if (!meetingUrl) fe.meetingLink = linkError || 'Meeting link is still generating — please wait a moment and try again.';
    } else if (!resolvedLocation) {
      fe.location = 'Interview location is required.';
    }

    panelists.forEach((p, i) => {
      const rowFilled = p.name.trim() || p.email.trim() || p.department.trim() || p.designation.trim();
      if (!rowFilled) return; // fully-blank rows are dropped on submit
      if (!p.name.trim()) fe[`panelist_${i}_name`] = 'Panelist name is required.';
      const pMsg = emailError(p.email, { required: false });
      if (pMsg) fe[`panelist_${i}`] = pMsg;
    });

    setFieldErrors(fe);
    if (Object.keys(fe).length) return;

    onSchedule({
      name: (plannedRound ? plannedRound.name : name).trim(),
      isHrRound: plannedRound ? plannedRound.isHr : isHrRound,
      description: description.trim() || undefined,
      scheduledAt: new Date(`${date}T${time}`).toISOString(),
      durationMinutes: duration ? Number(duration) : undefined,
      meetingType,
      meetingPlatform: meetingType === 'virtual' ? platform : undefined,
      meetingUrl: meetingType === 'virtual' ? meetingUrl : undefined,
      location: meetingType === 'in_person' ? resolvedLocation : undefined,
      locationDetails: meetingType === 'in_person' ? locationDetails.trim() || undefined : undefined,
      instructions: instructions.trim() || undefined,
      panelists: panelists.filter((p) => p.name.trim()),
    });
  };

  const platformLabel = PLATFORMS.find((p) => p.value === platform)?.label || '';
  const timeLabel = timeSlots.find((s) => s.value === time)?.label || time;
  const canShowSummary = name.trim() && date && time && (meetingType === 'in_person' ? resolvedLocation : meetingUrl);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Schedule round ${roundNumber}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || generatingLink}>{busy ? 'Scheduling…' : 'Schedule interview'}</Button>
        </>
      }
    >
      <div className="ta-modalsection">INTERVIEW DETAILS</div>
      <FieldGrid>
        <Field label="Round name" required full error={fieldErrors.name}>
          <Input
            value={plannedRound ? plannedRound.name : name} error={fieldErrors.name} disabled={!!plannedRound}
            onChange={(e) => setName(e.target.value)} placeholder="e.g. Technical Evaluation"
          />
          {plannedRound && <span className="ta-cell-sub">Set by this job's interview plan.</span>}
        </Field>
        <Field label="Round type" full>
          <label className="ta-check">
            <input
              type="checkbox" checked={plannedRound ? plannedRound.isHr : isHrRound} disabled={!!plannedRound}
              onChange={(e) => setIsHrRound(e.target.checked)}
            />
            <span>
              <b>This is the HR final round.</b> HR is always the last interview. No round can be added after it.
            </span>
          </label>
        </Field>
        <Field label="Date" required error={fieldErrors.date}>
          <Input
            type="date" value={date} min={today} error={fieldErrors.date}
            onChange={(e) => { setDate(e.target.value); setTime(''); }}
          />
        </Field>
        <Field label="Time" required hint="15-minute slots only" error={fieldErrors.time}>
          <Select
            value={time} placeholder="Select a time" options={timeSlots} error={fieldErrors.time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
        <Field label="Duration" required>
          <Select value={duration} options={DURATIONS} onChange={(e) => setDuration(e.target.value)} />
        </Field>
      </FieldGrid>

      <div className="ta-modalsection">MEETING DETAILS</div>
      <FieldGrid>
        <Field label="Interview meeting type" required>
          <Select
            value={meetingType} options={MEETING_TYPES}
            onChange={(e) => pickMeetingType(e.target.value)}
          />
        </Field>
        {meetingType === 'virtual' && (
          <Field label="Meeting platform" required error={fieldErrors.meetingPlatform}>
            <Select
              value={platform} placeholder="Select a platform" options={PLATFORMS} error={fieldErrors.meetingPlatform}
              onChange={(e) => pickPlatform(e.target.value)}
            />
          </Field>
        )}
      </FieldGrid>

      {meetingType === 'virtual' ? (
        platform && (
          <Field label="Meeting link" hint={`Automatically generated — ${platformLabel}`} error={linkError || fieldErrors.meetingLink}>
            {generatingLink ? (
              <div className="ta-cell-sub"><span className="ta-spinner" /> Generating link…</div>
            ) : linkError ? null : (
              <div className="ta-copyrow">
                <input className="ta-copyrow__input" readOnly value={meetingUrl} onFocus={(e) => e.target.select()} />
                <Button variant="ghost" icon="Copy" onClick={copyLink}>{copied ? 'Copied' : 'Copy Link'}</Button>
              </div>
            )}
          </Field>
        )
      ) : (
        <FieldGrid>
          <Field label="Interview location" required full error={fieldErrors.location}>
            <Select value={location} placeholder="Select an office" options={OFFICE_LOCATIONS} error={fieldErrors.location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          {location === 'Other' && (
            <Field label="Location" required full>
              <Input
                value={customLocation} onChange={(e) => setCustomLocation(e.target.value)}
                placeholder="e.g. Client office, co-working space, etc."
              />
            </Field>
          )}
          <Field label="Location details" hint="Optional" full>
            <Textarea
              rows={2} value={locationDetails} onChange={(e) => setLocationDetails(e.target.value)}
              placeholder="Add room number, floor, building instructions, reception details, etc."
            />
          </Field>
        </FieldGrid>
      )}

      <Field label="Instructions for the candidate" hint="Optional" full>
        <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </Field>

      <div className="ta-modalsection">CANDIDATE NOTIFICATION</div>
      <div className="ta-info__item" style={{ marginBottom: 4 }}>
        <span className="ta-info__label">Candidate email</span>
        <span className="ta-info__value">{candidateEmail || '— not on file —'}</span>
      </div>
      <p className="ta-cell-sub" style={{ marginTop: 4 }}>
        {candidateEmail
          ? "An interview invitation will be emailed to this address as soon as you schedule."
          : 'This candidate has no email on file — the invitation cannot be sent automatically.'}
      </p>

      {canShowSummary && (
        <div className="ta-summarybox">
          <div className="ta-summarybox__row"><span>Interview Round</span><b>{name}</b></div>
          <div className="ta-summarybox__row"><span>Date</span><b>{new Date(`${date}T${time || '00:00'}`).toLocaleDateString('en-IN', { dateStyle: 'long' })}</b></div>
          <div className="ta-summarybox__row"><span>Time</span><b>{timeLabel}</b></div>
          <div className="ta-summarybox__row"><span>Duration</span><b>{duration} minutes</b></div>
          <div className="ta-summarybox__row"><span>Meeting Type</span><b>{meetingType === 'virtual' ? 'Virtual Interview' : 'In-Person Interview'}</b></div>
          {meetingType === 'virtual' ? (
            <>
              <div className="ta-summarybox__row"><span>Platform</span><b>{platformLabel}</b></div>
              <div className="ta-summarybox__row"><span>Meeting Link</span><b style={{ wordBreak: 'break-all' }}>{meetingUrl}</b></div>
            </>
          ) : (
            <div className="ta-summarybox__row"><span>Location</span><b>{resolvedLocation}</b></div>
          )}
          <div className="ta-summarybox__row"><span>Candidate Email</span><b>{candidateEmail || '—'}</b></div>
        </div>
      )}

      <div className="ta-field__labelrow" style={{ marginTop: 14, marginBottom: 8 }}>
        <label className="ta-field__label">Interview Panel</label>
        <button type="button" className="ta-link" onClick={addPanelist}>+ Add panelist</button>
      </div>
      {panelists.map((p, i) => (
        <FieldGrid key={i}>
          <Field label="Name" error={fieldErrors[`panelist_${i}_name`]}>
            <Input value={p.name} error={fieldErrors[`panelist_${i}_name`]} onChange={(e) => setPanelist(i, { name: e.target.value })} />
          </Field>
          <Field label="Email" hint="For their invite" error={fieldErrors[`panelist_${i}`]}>
            <Input value={p.email} onChange={(e) => setPanelist(i, { email: e.target.value })} error={fieldErrors[`panelist_${i}`]} />
          </Field>
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
