import Icon from '../common/Icon.jsx';
import markWhite from '../../assets/centrik-logo-white.png';
import markColor from '../../assets/ccentrik-logo.png';

/**
 * The two-pane sign-in shell (animated brand panel + journey + form card),
 * shared by the candidate and TA login pages so they stay visually related
 * but each page supplies its own copy/journey/colour theme via props.
 */
export default function AuthHeroLayout({
  theme, // 'candidate' | 'ta' — controls the --wsauth color scheme (see home.css)
  floatIn, floatOut, // { icon, label } for the two floating corner cards
  title, // JSX — the big pitch heading
  subtitle,
  journey, // [{ label, icon, desc, c, c2 }]
  tags, // small caption under the journey card
  panelTitle,
  panelLede,
  error,
  notConfigured,
  configured,
  signing,
  authLoading,
  onGoogleClick,
  footer,
  crossLink,
  children, // optional extra content in the panel, above the Google button (e.g. a password form)
}) {
  return (
    <div className={`wsauth${theme === 'ta' ? ' wsauth--ta' : ''}`}>
      <aside className="wsauth__aside">
        <span className="wsauth__blob wsauth__blob--1" aria-hidden="true" />
        <span className="wsauth__blob wsauth__blob--2" aria-hidden="true" />
        <span className="wsauth__blob wsauth__blob--3" aria-hidden="true" />

        <figure className="wsfloat wsfloat--in" aria-hidden="true">
          <span className="wsfloat__avatar"><Icon name={floatIn.icon} size={17} /></span>
          <span className="wsfloat__body"><b>{floatIn.label}</b><i /><i /></span>
        </figure>
        <figure className="wsfloat wsfloat--out" aria-hidden="true">
          <span className="wsfloat__avatar"><Icon name={floatOut.icon} size={17} /></span>
          <span className="wsfloat__body"><b>{floatOut.label}</b></span>
          <span className="wsfloat__check"><Icon name="Check" size={11} /></span>
        </figure>

        <img className="wsauth__logo wsauth__logo--lg" src={markWhite} alt="Ccentrik" />

        <div className="wsauth__pitch">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        <span className="wsauth__tick" aria-hidden="true" />

        <ol className="wsjourney" aria-hidden="true">
          <span className="wsjourney__rail"><span className="wsjourney__pulse" /></span>
          {journey.map((s, i) => (
            <li className="wsjourney__step" key={s.label} style={{ '--i': i, '--c': s.c, '--c2': s.c2 }}>
              <span className="wsjourney__node"><Icon name={s.icon} size={19} /></span>
              <span className="wsjourney__label">{s.label}</span>
              <span className="wsjourney__desc">{s.desc}</span>
              {i < journey.length - 1 && (
                <span className="wsjourney__sep"><Icon name="ChevronRight" size={13} /></span>
              )}
            </li>
          ))}
        </ol>

        <p className="wsauth__tags" aria-hidden="true">{tags}</p>
      </aside>

      <main className="wsauth__main">
        <div className="wsauth__panel">
          <img className="wsauth__logo wsauth__logo--sm" src={markColor} alt="Ccentrik" />
          <h2>{panelTitle}</h2>
          <p className="wsauth__lede">{panelLede}</p>

          {error && (
            <div className="wsauth__alert" role="alert">
              <Icon name="AlertCircle" size={15} /> {error}
            </div>
          )}
          {notConfigured && (
            <div className="wsauth__alert" role="alert">
              <Icon name="AlertCircle" size={15} /> Sign-in is temporarily unavailable. Please try again shortly.
            </div>
          )}

          {children}
          {children && <div className="wsauth__or"><span>or</span></div>}

          <button type="button" className="wsauth__google" onClick={onGoogleClick} disabled={!configured || signing || authLoading}>
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
              <path fill="#FBBC05" d="M5.85 14.1a6.6 6.6 0 0 1 0-4.22V7.04H2.18a11 11 0 0 0 0 9.9l3.67-2.84Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.67 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
            </svg>
            {signing ? 'Signing in…' : 'Continue with Google'}
          </button>

          <p className="wsauth__foot">{footer}</p>
          {crossLink}
        </div>
      </main>
    </div>
  );
}
