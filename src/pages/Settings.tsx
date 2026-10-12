import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, LogOut, Plus, Trash2, UserCheck, UserX } from 'lucide-react';
import clsx from 'clsx';
import { logout, toast, updateAccount, useStore } from '../store';
import { api, ApiError } from '../lib/api';
import { confirmDialog, Modal } from '../components/ui';
import { initials } from '../components/Layout';
import { PageTitle } from '../components/PageTitle';

const ERRORS: Record<string, string> = {
  wrong_password: 'كلمة المرور الحالية غير صحيحة',
  weak_password: 'كلمة المرور لازم تكون 8 أحرف على الأقل',
  invalid_email: 'البريد الإلكتروني غير صالح',
  email_exists: 'في حساب بهذا البريد',
};
const errorText = (e: unknown) => (e instanceof ApiError && ERRORS[e.code]) || 'صار خطأ، جرّب مرة ثانية';

export function SettingsPage() {
  const user = useStore((s) => s.user)!;
  return (
    <div className="page">
      <PageTitle
        view="settings"
        title="الإعدادات"
        actions={<button className="btn btn-ghost" onClick={() => void logout()}><LogOut />تسجيل الخروج</button>}
      />
      <ProfileCard />
      <PasswordCard />
      <ShortcutsCard />
      {user.role === 'admin' && <UsersCard />}
    </div>
  );
}

function ProfileCard() {
  const user = useStore((s) => s.user)!;
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateAccount({ name });
      toast('حُفظ الاسم');
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-card">
      <div className="settings-side">
        <span className="avatar lg">{initials(user.name, user.email)}</span>
      </div>
      <form className="stack" onSubmit={save}>
        <label className="field">
          <span>الاسم</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="كيف بدك نناديك؟" maxLength={80} />
        </label>
        <label className="field">
          <span>البريد الإلكتروني</span>
          <input className="input" value={user.email} disabled dir="ltr" />
        </label>
        <div><button className="btn btn-primary" disabled={busy || name === user.name}>حفظ</button></div>
      </form>
    </section>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 8) return setError(ERRORS.weak_password);
    setBusy(true);
    try {
      await updateAccount({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      toast('تغيّرت كلمة المرور، وانطلعت الأجهزة الثانية من الحساب');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-card">
      <div className="settings-side"><h2 className="h2">كلمة المرور</h2></div>
      <form className="stack" onSubmit={save}>
        <label className="field">
          <span>الحالية</span>
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="field">
          <span>الجديدة</span>
          <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="8 أحرف على الأقل" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div><button className="btn btn-primary" disabled={busy || !current || !next}><KeyRound />تغيير كلمة المرور</button></div>
      </form>
    </section>
  );
}

function ShortcutsCard() {
  const rows: [string, string][] = [
    ['Ctrl K', 'البحث والأوامر'],
    ['Q', 'مهمة جديدة'],
    ['I', 'فكرة جديدة'],
    ['/', 'بحث'],
    ['Alt 1…7', 'التنقل بين الصفحات'],
    ['Esc', 'إغلاق'],
  ];
  return (
    <section className="settings-card">
      <div className="settings-side"><h2 className="h2">اختصارات</h2></div>
      <div className="shortcuts">
        {rows.map(([k, label]) => (
          <div key={k} className="shortcut">
            <span>{label}</span>
            <span className="row" style={{ gap: 4 }}>{k.split(' ').map((p) => <span key={p} className="kbd">{p}</span>)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  active: boolean;
  createdAt: number;
  tasksCount: number;
}

function UsersCard() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const reload = () => api.get<{ users: AdminUser[] }>('users').then((r) => setUsers(r.users)).catch(() => toast('تعذّر تحميل المستخدمين'));
  useEffect(() => { void reload(); }, []);

  const toggleActive = async (u: AdminUser) => {
    await api.patch(`users?id=${u.id}`, { active: !u.active }).catch((e) => toast(errorText(e)));
    void reload();
  };
  const remove = async (u: AdminUser) => {
    if (!await confirmDialog({ title: `حذف ${u.email}؟`, message: `رح تنحذف كل بياناته (${u.tasksCount} مهمة) نهائيًا.`, confirmLabel: 'حذف المستخدم' })) return;
    await api.del(`users?id=${u.id}`).catch((e) => toast(errorText(e)));
    void reload();
  };

  return (
    <section className="settings-card">
      <div className="settings-side">
        <h2 className="h2">المستخدمون</h2>
        <p className="faint" style={{ fontSize: 13 }}>أنت المدير. أنشئ حسابات للناس اللي بدك يستخدموا التطبيق.</p>
      </div>
      <div>
        <div className="users">
          {users.map((u) => (
            <div key={u.id} className={clsx('user-row', !u.active && 'inactive')}>
              <span className="avatar">{initials(u.name, u.email)}</span>
              <div className="user-row-meta">
                <b>{u.name || u.email.split('@')[0]} {u.role === 'admin' && <span className="chip ink">مدير</span>}{!u.active && <span className="chip">موقوف</span>}</b>
                <small dir="ltr">{u.email}</small>
              </div>
              <span className="faint num" style={{ fontSize: 12 }}>{u.tasksCount} مهمة</span>
              {u.role !== 'admin' && (
                <div className="row" style={{ gap: 2 }}>
                  <button className="icon-btn sm" aria-label="تعديل" onClick={() => setEditing(u)}><KeyRound /></button>
                  <button className="icon-btn sm" aria-label={u.active ? 'إيقاف' : 'تفعيل'} onClick={() => void toggleActive(u)}>{u.active ? <UserX /> : <UserCheck />}</button>
                  <button className="icon-btn sm" aria-label="حذف" onClick={() => void remove(u)}><Trash2 /></button>
                </div>
              )}
            </div>
          ))}
        </div>
        <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={() => setEditing('new')}><Plus />مستخدم جديد</button>
      </div>
      {editing && <UserModal user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    </section>
  );
}

function UserModal({ user, onClose, onSaved }: { user: AdminUser | null; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (user) await api.patch(`users?id=${user.id}`, { email, name, ...(password ? { password } : {}) });
      else await api.post('users', { email, name, password });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <Modal open onClose={onClose} title={user ? 'تعديل المستخدم' : 'مستخدم جديد'} width={420}>
      <form className="stack" onSubmit={save}>
        <label className="field"><span>الاسم</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label className="field"><span>البريد الإلكتروني</span><input className="input" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field">
          <span>{user ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'}</span>
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required={!user} placeholder="8 أحرف على الأقل" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="row-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary">{user ? 'حفظ' : 'إنشاء الحساب'}</button>
        </div>
      </form>
    </Modal>
  );
}
