import { useMemo, useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import Button from '../common/Button.jsx';
import { Field, Input, Select, Textarea, FieldGrid } from '../ta/Field.jsx';
import { generateMeetingLink } from '../../api/interviews.js';
import { notPastDateError } from '../../utils/validation.js';

const MEETING_TYPES = [
  { value: 'virtual', label: 'Virtual Interview' },
  { value: 'in_person', label: 'In-Person Interview' },
];
const PLATFORMS = [
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'google_meet', label: 'Google Meet' },
];
const DURATIONS = [15, 30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} minutes` }));
const OFFICE_LOCATIONS = ['Ccentrik Office – Ghaziabad', 'Ccentrik Office – Noida', 'Ccentrik Office – Delhi', 'Other'];

// Same 15-minute business-hours slots as scheduling a new round — see
// ScheduleInterviewModal for why (never a free-text time input).
function buildTimeSlots(dateStr) {
  const now = new Date();
  const isToday = dateStr && new Date(`${dateStr}T00:00`).toDateString() === now.toDateString();
  const slots = [];
  for (let h = 9; h <= 18; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 18 && m > 0) continue;
      if (isToday && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes()))) continue;
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const period = h < 12 ? 'AM' : 'PM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      slots.push({ value, label: `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}` });
    }
  }
  return slots;
}

/* Picks a new time for a round the candidate declined — same round, so it
   only asks for what changes (when and where/how), not the round's name or
   panel again. See reschedule-interview-round. */
export default function RescheduleInterviewModal({ open, onClose, round, busy, onReschedule }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('45');
  const [meetingType, setMeetingType] = useState('virtual');
  const [platform, setPlatform] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [location, setLocation] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [locationDetails, setLocationDetails] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const today = new Date().toISOString().slice(0, 10);
  const timeSlots = useMemo(() => buildTimeSlots(date), [date]);
  const resolvedLocation = location === 'Other' ? customLocation.trim() : location;

  const pickPlatform = async (value) => {
    setPlatform(value);
    setMeetingUrl('');
    setLinkError('');
    setGeneratingLink(true);
    try {
      const result = await generateMeetingLink(value, {
        roundName: round?.name || 'Interview',
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
    if (value === 'in_person') { setPlatform(''); setMeetingUrl(''); setLinkError(''); }
    else { setLocation(''); setCustomLocation(''); setLocationDetails(''); }
  };

  const submit = () => {
    const fe = {};
    const dateMsg = notPastDateError(date, { required: true, label: 'interview date' });
    if (dateMsg) fe.date = dateMsg;
    if (!time) fe.time = 'Please select a time.';
    if (meetingType === 'virtual') {
      if (!platform) fe.meetingPlatform = 'Choose a meeting platform.';
      else if (!meetingUrl) fe.meetingLink = linkError || 'Meeting link is still generating — please wait a moment and try again.';
    } else if (!resolvedLocation) {
      fe.location = 'Interview location is required.';
    }
    setFieldErrors(fe);
    if (Object.keys(fe).length) return;

    onReschedule({
      roundId: round.id,
      scheduledAt: new Date(`${date}T${time}`).toISOString(),
      durationMinutes: duration ? Number(duration) : undefined,
      meetingType,
      meetingPlatform: meetingType === 'virtual' ? platform : undefined,
      meetingUrl: meetingType === 'virtual' ? meetingUrl : undefined,
      location: meetingType === 'in_person' ? resolvedLocation : undefined,
      locationDetails: meetingType === 'in_person' ? locationDetails.trim() || undefined : undefined,
    });
  };

  const platformLabel = PLATFORMS.find((p) => p.value === platform)?.label || '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={round ? `Reschedule ${round.name}` : 'Reschedule interview'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || generatingLink}>{busy ? 'Rescheduling…' : 'Send new invitation'}</Button>
        </>
      }
    >
      <p className="ta-cell-sub" style={{ marginBottom: 10 }}>
        The candidate declined the current time. Picking a new one sends them a fresh invitation — the old email's links stop working.
      </p>
      <div className="ta-modalsection">NEW TIME</div>
      <FieldGrid>
        <Field label="Date" required error={fieldErrors.date}>
          <Input type="date" value={date} min={today} error={fieldErrors.date} onChange={(e) => { setDate(e.target.value); setTime(''); }} />
        </Field>
        <Field label="Time" required hint="15-minute slots only" error={fieldErrors.time}>
          <Select value={time} placeholder="Select a time" options={timeSlots} error={fieldErrors.time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Duration" required>
          <Select value={duration} options={DURATIONS} onChange={(e) => setDuration(e.target.value)} />
        </Field>
      </FieldGrid>

      <div className="ta-modalsection">MEETING DETAILS</div>
      <FieldGrid>
        <Field label="Interview meeting type" required>
          <Select value={meetingType} options={MEETING_TYPES} onChange={(e) => pickMeetingType(e.target.value)} />
        </Field>
        {meetingType === 'virtual' && (
          <Field label="Meeting platform" required error={fieldErrors.meetingPlatform}>
            <Select value={platform} placeholder="Select a platform" options={PLATFORMS} error={fieldErrors.meetingPlatform} onChange={(e) => pickPlatform(e.target.value)} />
          </Field>
        )}
      </FieldGrid>

      {meetingType === 'virtual' ? (
        platform && (
          <Field label="Meeting link" hint={`Automatically generated — ${platformLabel}`} error={linkError || fieldErrors.meetingLink}>
            {generatingLink ? (
              <div className="ta-cell-sub"><span className="ta-spinner" /> Generating link…</div>
            ) : linkError ? null : (
              <input className="ta-copyrow__input" readOnly value={meetingUrl} onFocus={(e) => e.target.select()} />
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
              <Input value={customLocation} onChange={(e) => setCustomLocation(e.target.value)} placeholder="e.g. Client office, co-working space, etc." />
            </Field>
          )}
          <Field label="Location details" hint="Optional" full>
            <Textarea rows={2} value={locationDetails} onChange={(e) => setLocationDetails(e.target.value)} placeholder="Add room number, floor, building instructions, reception details, etc." />
          </Field>
        </FieldGrid>
      )}
    </Modal>
  );
}
