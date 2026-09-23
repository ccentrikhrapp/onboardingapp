import { Link } from 'react-router-dom';
import logo from '../assets/ccentrik-logo.png';

const CONTACT = 'ccentrikhrapp@gmail.com';

const PRIVACY = [
  ['Who we are', 'This Ccentrik Recruitment Portal is used by Ccentrik to receive job applications, run interviews and hand accepted candidates over to onboarding.'],
  ['What we collect', 'Candidates: the details and documents you submit with an application. Staff: name, work email and role. When you sign in with Google we receive your name, email address and profile picture.'],
  ['How we use Google access', 'When Ccentrik staff sign in with Google they may grant permission to send email (gmail.send) and to create calendar events with a Google Meet link (calendar.events). We use these only to send workflow emails such as interview invitations, offers and document requests from the staff member\'s own account, and to create the interview meeting they scheduled. We never read, list, search or delete your emails or calendar, and we do not use this access for advertising.'],
  ['Google API Limited Use', 'Our use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.'],
  ['Storage and sharing', 'Data is stored in Supabase (database and file storage) with access limited by role. A staff member\'s Google refresh token is stored encrypted-at-rest by the database provider, is used only to perform the actions above, and is deleted when the member is removed. We do not sell your data. Candidate details are shared between Ccentrik\'s recruitment and HR teams only to carry out hiring and onboarding.'],
  ['Your choices', 'You can revoke Ccentrik\'s Google access at any time at myaccount.google.com/permissions. Candidates can ask for their data to be corrected or deleted.'],
  ['Contact', `Questions or requests: ${CONTACT}.`],
];

const TERMS = [
  ['Use of the portal', 'This portal is provided by Ccentrik for job applications and internal recruitment and onboarding. Staff accounts are created by invitation from an administrator and may be disabled or removed at any time.'],
  ['Your responsibilities', 'Provide accurate information, keep your password confidential, and use the portal only for its intended purpose. Do not attempt to access data you are not authorised to see.'],
  ['Google features', 'Sending email and creating meetings through your Google account is optional and governed by the permissions you grant. You can revoke them at any time.'],
  ['Availability', 'The portal is provided as is, and features may change or be unavailable from time to time.'],
  ['Contact', `Questions: ${CONTACT}.`],
];

export default function LegalPage({ kind }) {
  const isPrivacy = kind === 'privacy';
  const sections = isPrivacy ? PRIVACY : TERMS;
  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7', padding: '32px 16px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 16, padding: '32px 36px', boxShadow: '0 8px 30px rgba(15,23,41,.08)', color: '#1f2430', lineHeight: 1.6 }}>
        <Link to="/"><img src={logo} alt="Ccentrik" style={{ height: 40 }} /></Link>
        <h1 style={{ margin: '18px 0 4px' }}>{isPrivacy ? 'Privacy Policy' : 'Terms of Service'}</h1>
        <p style={{ color: '#6b7280', marginTop: 0 }}>Ccentrik Recruitment Portal · Last updated 20 September 2026</p>
        {sections.map(([title, body]) => (
          <section key={title}>
            <h2 style={{ fontSize: 18, marginBottom: 4 }}>{title}</h2>
            <p style={{ marginTop: 0 }}>{body}</p>
          </section>
        ))}
        <p style={{ marginTop: 28, fontSize: 14 }}>
          <Link to="/privacy">Privacy Policy</Link> · <Link to="/terms">Terms of Service</Link>
        </p>
      </div>
    </div>
  );
}
