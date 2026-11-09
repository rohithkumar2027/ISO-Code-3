import { Page } from '../components/PageShell';
import { useSession } from '../lib/SessionContext';
import { t } from '../i18n';

export default function NotFound() {
  const { lang } = useSession();
  return (
    <Page narrow>
      <h1 className="display-lg">{t(lang, 'nf_title')}</h1>
      <p className="lede">{t(lang, 'nf_body')}</p>
      <div className="actions"><a className="btn" href="/login">{t(lang, 'go_login')}</a></div>
    </Page>
  );
}
