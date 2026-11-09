import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { LANGS } from '../i18n';

const Ctx = createContext(null);

function readLangCookie() {
  const m = document.cookie.match(/(?:^|;\s*)lang=([^;]+)/);
  return m && LANGS.includes(decodeURIComponent(m[1])) ? decodeURIComponent(m[1]) : 'en';
}

export function SessionProvider({ children }) {
  const [lang, setLangState] = useState(readLangCookie);
  // patient: null = signed out, undefined = still checking, object = signed in
  const [patient, setPatient] = useState(undefined);

  const refresh = useCallback(async () => {
    try {
      const { patient: p } = await api.session();
      setPatient(p ?? null);
    } catch {
      setPatient(null);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setLang = useCallback(async (l) => {
    setLangState(l);
    document.documentElement.lang = l;
    try { await api.setLang(l); } catch { /* cookie fallback still applies next request */ }
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const logout = useCallback(async () => {
    if (patient?.csrf) { try { await api.logout(patient.csrf); } catch { /* already gone */ } }
    setPatient(null);
  }, [patient]);

  return <Ctx.Provider value={{ lang, setLang, patient, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
