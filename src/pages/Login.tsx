import { useState, type FormEvent } from 'react';
import { CalendarDays, Check, Flame, FolderKanban } from 'lucide-react';
import { login } from '../store';
import { ApiError } from '../lib/api';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'البريد أو كلمة المرور غير صحيحة' : 'تعذّر الاتصال، جرّب مرة ثانية');
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-logo"><Check strokeWidth={3} /></span>
          <h1>أهلًا بك في مهامي</h1>
          <p>مهامك ومشاريعك وعاداتك، بمكان واحد مريح.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label className="field">
            <span>البريد الإلكتروني</span>
            <input className="input" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span>كلمة المرور</span>
            <input className="input" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary btn-block login-btn" disabled={busy}>{busy ? 'لحظة…' : 'دخول'}</button>
        </form>
        <div className="login-features">
          <span><CalendarDays color="var(--hue-red)" />تخطيط ذكي</span>
          <span><FolderKanban color="var(--hue-indigo)" />مشاريع</span>
          <span><Flame color="var(--hue-orange)" />عادات</span>
        </div>
      </div>
    </div>
  );
}
