import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { LANGS } from '../i18n';

const Ctx = createContext(null);

function readLangCookie() {
  const m = document.cookie.match(/(?:^|;\s*)lang=([^;]+)/);
  return m && LANGS.includes(decodeURIComponent(m[1])) ? decodeURIComponent(m[1]) : 'en';
}

function getInitialTheme() {
  const saved = typeof window !== 'undefined' ? localStorage.getItem('portal_theme') : null;
  if (saved === 'dark' || saved === 'light') return saved;
  return 'light';
}

export function SessionProvider({ children }) {
  const [lang, setLangState] = useState(readLangCookie);
  // patient / doctor: null = signed out, undefined = still checking, object = signed in
  const [patient, setPatient] = useState(undefined);
  const [doctor, setDoctor] = useState(undefined);
  const [theme, setTheme] = useState(getInitialTheme);
  const [activeModal, setActiveModal] = useState(null); // 'profile' | 'support' | 'help' | null

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('portal_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { patient: p } = await api.session();
      setPatient(p ?? null);
    } catch {
      setPatient(null);
    }
  }, []);

  // A doctor session lives server-side (the same staff "stf" cookie the HTML
  // staff console uses), not in localStorage — localStorage can't be trusted
  // to gate access to patient data, and the backend enforces this regardless
  // of what the client believes.
  const refreshDoctor = useCallback(async () => {
    try {
      const { doctor: d } = await api.doctorSession();
      setDoctor(d ?? null);
    } catch {
      setDoctor(null);
    }
  }, []);

  useEffect(() => { refresh(); refreshDoctor(); }, [refresh, refreshDoctor]);

  const setLang = useCallback(async (l) => {
    setLangState(l);
    document.documentElement.lang = l;
    try { await api.setLang(l); } catch { /* cookie fallback still applies */ }
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const logout = useCallback(async () => {
    if (patient?.csrf) { try { await api.logout(patient.csrf); } catch { /* already gone */ } }
    setPatient(null);
  }, [patient]);

  const doctorLogout = useCallback(async () => {
    if (doctor?.csrf) { try { await api.doctorLogout(doctor.csrf); } catch { /* already gone */ } }
    setDoctor(null);
  }, [doctor]);

  return (
    <Ctx.Provider
      value={{
        lang, setLang,
        patient, refresh, logout,
        doctor, refreshDoctor, doctorLogout,
        theme, toggleTheme,
        activeModal, setActiveModal,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useSession = () => useContext(Ctx);
