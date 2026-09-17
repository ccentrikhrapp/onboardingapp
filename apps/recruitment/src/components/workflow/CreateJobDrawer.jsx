import { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import Button from '../common/Button.jsx';
import { Field, Input, Select, Textarea } from '../common/Field.jsx';
import ChipsInput from '../common/ChipsInput.jsx';
import { todayISO } from '../../utils/format.js';
import { notPastDateError, numberError } from '../../utils/validation.js';

const DEPARTMENTS = ['Sales', 'Human Resource', 'Talent Acquisition', 'SAP ABAP', 'SAP Functional'];
const WORK_MODES = ['Hybrid', 'Remote', 'On-site'];
const EMP_TYPES = ['Full-time', 'Contract', 'Internship'];

const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export default function CreateJobDrawer({ open, onClose, onCreate }) {
  const [f, setF] = useState({
    title: '', department: DEPARTMENTS[0], location: '', workMode: 'Hybrid',
    employmentType: 'Full-time', experience: '', deadline: '', applicationLimit: '',
    description: '', responsibilities: '', qualifications: '',
    requiredSkills: [], preferredSkills: [], benefits: [],
  });
  const [errors, setErrors] = useState({});
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));

  const submit = () => {
    const e = {};
    if (!f.title.trim()) e.title = 'Job title is required.';
    if (!f.location.trim()) e.location = 'Location is required.';
    if (!f.experience.trim()) e.experience = 'Experience range is required.';
    if (f.requiredSkills.length === 0) e.requiredSkills = 'Add at least one required skill.';
    const deadlineMsg = notPastDateError(f.deadline, { required: false, label: 'deadline' });
    if (deadlineMsg) e.deadline = deadlineMsg;
    const limitMsg = numberError(f.applicationLimit, { required: false, label: 'application limit', min: 1, integer: true });
    if (limitMsg) e.applicationLimit = limitMsg;
    setErrors(e);
    if (Object.keys(e).length) return;

    onCreate({
      title: f.title.trim(),
      department: f.department,
      location: f.location.trim(),
      workMode: f.workMode,
      employmentType: f.employmentType,
      experience: f.experience.trim(),
      deadline: f.deadline || todayISO(),
      applicationLimit: f.applicationLimit ? Number(f.applicationLimit) : null,
      description: f.description.trim() || `We are hiring a ${f.title.trim()} to join the ${f.department} team.`,
      responsibilities: lines(f.responsibilities),
      qualifications: lines(f.qualifications),
      requiredSkills: f.requiredSkills,
      preferredSkills: f.preferredSkills,
      benefits: f.benefits,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a new job"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon="Plus" onClick={submit}>Publish Job</Button>
        </>
      }
    >
      <Field label="Job Title" required error={errors.title}>
        <Input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Senior Backend Engineer" error={errors.title} />
      </Field>
      <div className="form-grid">
        <Field label="Department">
          <Select value={f.department} onChange={(e) => set({ department: e.target.value })} options={DEPARTMENTS} />
        </Field>
        <Field label="Location" required error={errors.location}>
          <Input value={f.location} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Bengaluru, India" error={errors.location} />
        </Field>
        <Field label="Work Mode">
          <Select value={f.workMode} onChange={(e) => set({ workMode: e.target.value })} options={WORK_MODES} />
        </Field>
        <Field label="Employment Type">
          <Select value={f.employmentType} onChange={(e) => set({ employmentType: e.target.value })} options={EMP_TYPES} />
        </Field>
        <Field label="Experience" required error={errors.experience}>
          <Input value={f.experience} onChange={(e) => set({ experience: e.target.value })} placeholder="e.g. 4–7 years" error={errors.experience} />
        </Field>
        <Field label="Application Deadline" hint="The job auto-closes and stops accepting applications after this date." error={errors.deadline}>
          <Input type="date" value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} error={errors.deadline} />
        </Field>
        <Field label="Application Limit" hint="The job stops accepting applications once this many have been submitted. Leave blank for unlimited." error={errors.applicationLimit}>
          <Input type="number" min="1" value={f.applicationLimit} onChange={(e) => set({ applicationLimit: e.target.value })} error={errors.applicationLimit} />
        </Field>
      </div>

      <Field label="Job Description">
        <Textarea rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="A short overview of the role" />
      </Field>
      <Field label="Responsibilities" hint="One per line">
        <Textarea rows={4} value={f.responsibilities} onChange={(e) => set({ responsibilities: e.target.value })} placeholder={'Design and build services\nOwn delivery for your area'} />
      </Field>
      <Field label="Required Skills" required error={errors.requiredSkills}>
        <ChipsInput value={f.requiredSkills} onChange={(v) => set({ requiredSkills: v })} placeholder="Add a skill and press Enter" />
      </Field>
      <Field label="Preferred Skills">
        <ChipsInput value={f.preferredSkills} onChange={(v) => set({ preferredSkills: v })} placeholder="Add a skill" />
      </Field>
      <Field label="Qualifications" hint="One per line">
        <Textarea rows={2} value={f.qualifications} onChange={(e) => set({ qualifications: e.target.value })} placeholder={"Bachelor's degree in a related field"} />
      </Field>
      <Field label="Benefits">
        <ChipsInput value={f.benefits} onChange={(v) => set({ benefits: v })} placeholder="Add a benefit" />
      </Field>
    </Modal>
  );
}
