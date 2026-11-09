import { motion } from 'framer-motion';
import { Link, NavLink } from 'react-router-dom';
import { useSession } from '../lib/SessionContext';
import { LANGS, LANG_LABEL } from '../i18n';
import { HeaderMenu } from './HeaderMenu';
import { MenuModals } from './MenuModals';
import './shell.css';

export function LanguageSwitcher() {
  const { lang, setLang } = useSession();
  return (
    <nav className="langs" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l} type="button" className="lang-chip" lang={l} aria-current={l === lang} onClick={() => setLang(l)}>
          {LANG_LABEL[l]}
        </button>
      ))}
    </nav>
  );
}

export function Header({ loggedIn }) {
  const { theme, toggleTheme, doctor } = useSession();

  return (
    <header className="shell-header">
      <div className="container shell-header-in">
        <div className="brand-group">
          <Link to="/" className="brand">
            <span className="brand-cross">✚</span>
            <span className="brand-text">
              Company A <span className="brand-tag">Pharmacy & Diagnostics</span>
            </span>
          </Link>

          <nav className="portal-nav" aria-label="Portal Navigation">
            <NavLink
              to="/"
              className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`}
              end
            >
              Home
            </NavLink>
            <NavLink
              to={loggedIn ? "/reports" : "/login"}
              className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`}
            >
              Patient Portal
            </NavLink>
            <NavLink
              to={doctor ? "/doctor" : "/doctor/login"}
              className={({ isActive }) => `nav-pill doctor-nav-pill ${isActive ? 'active' : ''}`}
            >
              <span className="live-dot" /> 🩺 Doctor Portal
            </NavLink>
            <a
              href="/dev/outbox"
              target="_blank"
              rel="noreferrer"
              className="nav-pill outbox-pill"
              title="View simulated WhatsApp and SMS messages dispatched to patients"
            >
              Outbox ↗
            </a>
          </nav>
        </div>

        <div className="shell-header-right">
          {/* Quick theme toggle */}
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle light/dark theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <LanguageSwitcher />

          {/* Three-dots menu with Profile photo */}
          <HeaderMenu />
        </div>
      </div>

      <MenuModals />
    </header>
  );
}

/** Fades + rises the page content in, and fades it out between routes. */
export function Page({ children, narrow }) {
  return (
    <motion.main
      className={`container page ${narrow ? 'page-narrow' : ''}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.main>
  );
}
