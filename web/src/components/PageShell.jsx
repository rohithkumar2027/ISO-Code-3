import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useSession } from '../lib/SessionContext';
import { LANGS, LANG_LABEL } from '../i18n';
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

export function Header({ loggedIn, onLogout }) {
  return (
    <header className="shell-header">
      <div className="container shell-header-in">
        <Link to="/" className="brand">Company A Diagnostics</Link>
        <div className="shell-header-right">
          <LanguageSwitcher />
          {loggedIn && (
            <button type="button" className="btn quiet" onClick={onLogout}>Log out</button>
          )}
        </div>
      </div>
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
