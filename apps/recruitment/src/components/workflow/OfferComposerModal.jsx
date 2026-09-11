import { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import Button from '../common/Button.jsx';
import { Field, Input, Textarea, FieldGrid } from '../ta/Field.jsx';
import { uploadOfferLetter } from '../../api/offers.js';

const DEFAULT_BODY = (jobTitle) =>
  `Dear Candidate,\n\nWe are pleased to share your offer for the position of ${jobTitle || '[Role]'}.\n\n` +
  `Please review the attached offer letter. To review and respond, use the secure link in this email.\n\n` +
  `Regards,\nC-Centrik Talent Acquisition Team`;

/* A professional business-email composer, not a generic form — matches the
   existing offer-letter workflow language (master prompt §46-48). */
export default function OfferComposerModal({ open, onClose, applicationId, candidateName, jobTitle, onSend, busy }) {
  const [subject, setSubject] = useState(`Your Offer from C-Centrik — ${jobTitle || ''}`);
  const [body, setBody] = useState(DEFAULT_BODY(jobTitle));
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [employmentType, setEmploymentType] = useState('Full-time');
  const [location, setLocation] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and message are required.');
      return;
    }
    setError('');
    let offerLetterPath;
    if (file) {
      setUploading(true);
      try {
        offerLetterPath = await uploadOfferLetter(applicationId, file);
      } catch (e) {
        setUploading(false);
        setError(e.message || 'Could not upload the offer letter.');
        return;
      }
      setUploading(false);
    }
    onSend({
      subject: subject.trim(), body: body.trim(), offerLetterPath,
      department: department.trim() || undefined, designation: designation.trim() || undefined,
      employmentType: employmentType.trim() || undefined, location: location.trim() || undefined,
      joiningDate: joiningDate || undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Offer — ${candidateName || 'Candidate'}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || uploading}>{busy || uploading ? 'Sending…' : 'Send offer'}</Button>
        </>
      }
    >
      {error && <p className="ta-field__error" style={{ marginBottom: 10 }}>{error}</p>}
      <Field label="Subject" required full>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Message" required full>
        <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <FieldGrid>
        <Field label="Department"><Input value={department} onChange={(e) => setDepartment(e.target.value)} /></Field>
        <Field label="Designation"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></Field>
        <Field label="Employment type"><Input value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} /></Field>
        <Field label="Location"><Input value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
        <Field label="Expected joining date">
          <Input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
        </Field>
        <Field label="Offer letter" hint="PDF/DOC/DOCX, optional">
          <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </Field>
      </FieldGrid>
    </Modal>
  );
}
