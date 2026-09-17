import { Link, NavLink } from 'react-router-dom';
import Icon from '../components/common/Icon.jsx';
import logo from '../assets/ccentrik-logo.png';
import '../styles/welcome.css';

const FEATURES = [
  { icon: 'Target', tone: 'blue', title: 'Better Opportunities', desc: 'Find roles that match your skills and goals.' },
  { icon: 'Zap', tone: 'green', title: 'Simplified Hiring', desc: 'Seamless process for candidates and TA teams.' },
  { icon: 'ShieldCheck', tone: 'violet', title: 'Secure & Reliable', desc: 'Your data and privacy are always protected.' },
  { icon: 'TrendingUp', tone: 'amber', title: 'Build Your Future', desc: 'Grow, learn and make a bigger impact.' },
];

/* A simple flat-style "person at a laptop" illustration, not a stock photo
   (none is available in this project's assets) — recolored per journey via
   the `accent`/`accent2` props so the candidate and TA panels stay visually
   distinct while sharing the same illustration language. */
function PersonIllustration({ accent, accent2 }) {
  return (
    <svg viewBox="0 0 220 200" className="lp-illustration" aria-hidden="true">
      <ellipse cx="110" cy="176" rx="88" ry="14" fill={accent} opacity="0.12" />
      <path d="M20 150 Q10 90 55 70 Q90 50 130 65 Q175 82 170 130 Q165 160 120 165 Q60 170 20 150 Z" fill={accent} opacity="0.14" />
      <rect x="70" y="118" width="66" height="42" rx="8" fill="#fff" stroke={accent2} strokeWidth="2" />
      <rect x="78" y="126" width="50" height="26" rx="3" fill={accent} opacity="0.18" />
      <circle cx="103" cy="72" r="22" fill={accent2} />
      <path d="M75 150 Q78 108 103 100 Q128 108 131 150 Z" fill={accent} />
      <path d="M40 118 Q30 100 42 90" stroke={accent2} strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M166 112 Q178 96 166 82" stroke={accent2} strokeWidth="6" strokeLinecap="round" fill="none" />
      <circle cx="182" cy="48" r="7" fill={accent} opacity="0.5" />
      <circle cx="26" cy="60" r="5" fill={accent2} opacity="0.5" />
    </svg>
  );
}

/* The shared front door for this app. Candidate CTA -> /candidate/jobs
   (existing public job browsing route); TA CTA -> /ta/login (existing TA
   sign-in). Direct job links still skip this page entirely and land on
   /candidate/jobs/:id — this is only for a visitor with no specific
   destination in mind. "About Us" has no dedicated route, so it scrolls to
   the Why Choose Us section instead of linking to a page that doesn't exist. */
export default function WelcomePage() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-nav__inner">
          <Link to="/" className="lp-nav__brand">
            <img src={logo} alt="Ccentrik" />
          </Link>

          <nav className="lp-nav__links">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <Icon name="Home" size={14} /> Home
            </NavLink>
            <Link to="/candidate/jobs"><Icon name="Briefcase" size={14} /> Jobs</Link>
            <a href="#why-us"><Icon name="Info" size={14} /> About Us</a>
          </nav>

          <div className="lp-nav__right">
            <button type="button" className="lp-lang">
              <Icon name="Globe" size={14} /> EN <Icon name="ChevronDown" size={12} />
            </button>
            <Link to="/candidate/login" className="lp-nav__cta">
              <Icon name="CircleUserRound" size={16} /> Login / Sign Up <Icon name="ArrowRight" size={14} />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero__text">
            <p className="lp-eyebrow"><span className="lp-eyebrow__line" /> WELCOME TO CCENTRIK</p>
            <h1 className="lp-hero__title">
              Your Next Opportunity<br /><span>Starts Here</span>
            </h1>
            <p className="lp-hero__sub">
              Explore exciting career opportunities and join a team that builds tomorrow, together.
            </p>
          </div>

          <div className="lp-hero__visual" aria-hidden="true">
            <p className="lp-annotation">Build Your Future<br />with Us</p>
            <span className="lp-blob lp-blob--1" />
            <span className="lp-blob lp-blob--2" />
            <div className="lp-visual-card lp-visual-card--main">
              <div className="lp-visual-row">
                <span className="lp-avatar-stack">
                  <span className="lp-avatar" style={{ '--c': '#60a5fa' }} />
                  <span className="lp-avatar" style={{ '--c': '#a78bfa' }} />
                  <span className="lp-avatar" style={{ '--c': '#34d399' }} />
                </span>
                <span className="lp-visual-badge">+128 hired</span>
              </div>
              <div className="lp-visual-bars">
                <span style={{ height: '46%' }} />
                <span style={{ height: '68%' }} />
                <span style={{ height: '52%' }} />
                <span style={{ height: '84%' }} />
                <span style={{ height: '64%' }} />
              </div>
              <p className="lp-visual-caption">Applications trending up this quarter</p>
            </div>
            <div className="lp-visual-card lp-visual-card--float">
              <span className="lp-visual-check"><Icon name="Check" size={12} /></span>
              <div>
                <b>Application submitted</b>
                <span>Senior Frontend Engineer</span>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-journeys" id="journeys">
          <Link to="/candidate/jobs" className="lp-journey lp-journey--candidate">
            <div className="lp-journey__body">
              <span className="lp-journey__icon"><Icon name="UserRoundCheck" size={22} /></span>
              <span className="lp-journey__label">FOR CANDIDATES</span>
              <h2>Find Your Dream Job</h2>
              <p>Search for open positions, apply, track your application status and take the next step in your career journey.</p>
              <span className="lp-journey__cta">Explore Jobs <Icon name="ArrowRight" size={15} /></span>
            </div>
            <PersonIllustration accent="#3b6ef5" accent2="#1d3fae" />
          </Link>

          <Link to="/ta/login" className="lp-journey lp-journey--ta">
            <div className="lp-journey__body">
              <span className="lp-journey__icon"><Icon name="LayoutDashboard" size={22} /></span>
              <span className="lp-journey__label">FOR TALENT ACQUISITION</span>
              <h2>Manage Your Recruitment</h2>
              <p>Sign in to access your TA dashboard, manage candidates, review applications and drive hiring success.</p>
              <span className="lp-journey__cta">Sign In <Icon name="ArrowRight" size={15} /></span>
            </div>
            <PersonIllustration accent="#6b46d9" accent2="#4c2f9e" />
          </Link>
        </section>

        <section className="lp-features" id="why-us">
          <h2><span className="lp-eyebrow__line" /> Why Choose Us?</h2>
          <div className="lp-features__grid">
            {FEATURES.map((f) => (
              <div className="lp-feature" key={f.title}>
                <span className={`lp-feature__icon lp-feature__icon--${f.tone}`}><Icon name={f.icon} size={17} /></span>
                <div>
                  <b>{f.title}</b>
                  <p>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <span>© 2025 Ccentrik. All rights reserved.</span>
        <span className="lp-footer__brand">People · Process · Progress</span>
      </footer>
    </div>
  );
}
