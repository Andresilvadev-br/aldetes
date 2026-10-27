import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, setSessionToken } from '@/lib/api';
import { Logo } from '@/components/common/Icon';
import { bootSession } from '@/App';
import { isDesktop } from '@/lib/desktop';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-gradient-to-br from-[#2b2263] via-bg-rail to-[#123b46] p-4">
      <div className="w-full max-w-[480px] animate-pop rounded-lg bg-bg-main p-8 shadow-2xl">
        <div className="mb-4 flex justify-center text-brand">
          <Logo size={44} />
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, error, ...props }: { label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="mb-4 block">
      <span className={`label ${error ? 'text-danger' : ''}`}>
        {label}
        {error && <span className="font-normal normal-case italic"> — {error}</span>}
      </span>
      <input className="input" {...props} />
    </label>
  );
}

function useAuthSubmit() {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.details) setFieldErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? ''])));
      } else setError('Erro inesperado');
    } finally {
      setBusy(false);
    }
  }
  return { error, fieldErrors, busy, run };
}

export function LoginPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const { error, busy, run } = useAuthSubmit();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await api<{ token: string }>('POST', '/auth/login', { login, password });
      await setSessionToken(r.token);
      await bootSession();
      nav(params.get('next') || '/channels/@me', { replace: true });
    });
  };
  return (
    <Shell>
      <h1 className="text-center text-2xl font-bold text-fg-strong">Boas-vindas de volta!</h1>
      <p className="mb-6 text-center text-fg-muted">Que bom te ver de novo no Aldetes.</p>
      <form onSubmit={submit}>
        <Field label="E-mail ou nome de usuário" value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus autoComplete="username" />
        <Field label="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        <Link to="/forgot" className="-mt-2 mb-4 block text-sm text-brand hover:underline">
          Esqueceu sua senha?
        </Link>
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full py-2.5" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="mt-3 text-sm text-fg-muted">
          Precisa de uma conta?{' '}
          <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="text-brand hover:underline">
            Cadastre-se
          </Link>
        </p>
        {isDesktop && (
          <Link to="/server-setup" className="mt-2 block text-xs text-fg-faint hover:underline">
            Alterar servidor Aldetes
          </Link>
        )}
      </form>
    </Shell>
  );
}

export function RegisterPage() {
  const [form, setForm] = useState({ email: '', displayName: '', username: '', password: '' });
  const { error, fieldErrors, busy, run } = useAuthSubmit();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await api<{ token: string }>('POST', '/auth/register', {
        ...form,
        username: form.username.toLowerCase(),
        displayName: form.displayName || undefined,
      });
      await setSessionToken(r.token);
      await bootSession();
      nav(params.get('next') || '/channels/@me', { replace: true });
    });
  };
  return (
    <Shell>
      <h1 className="mb-6 text-center text-2xl font-bold text-fg-strong">Criar uma conta</h1>
      <form onSubmit={submit}>
        <Field label="E-mail" type="email" value={form.email} onChange={upd('email')} required error={fieldErrors.email} autoComplete="email" />
        <Field label="Nome de exibição" value={form.displayName} onChange={upd('displayName')} maxLength={32} error={fieldErrors.displayName} />
        <Field
          label="Nome de usuário"
          value={form.username}
          onChange={upd('username')}
          required
          minLength={2}
          maxLength={32}
          pattern="[a-zA-Z0-9_.]+"
          title="Letras, números, _ e ."
          error={fieldErrors.username}
          autoComplete="username"
        />
        <Field label="Senha" type="password" value={form.password} onChange={upd('password')} required minLength={8} error={fieldErrors.password} autoComplete="new-password" />
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full py-2.5" disabled={busy}>
          {busy ? 'Criando…' : 'Continuar'}
        </button>
        <Link to="/login" className="mt-3 block text-sm text-brand hover:underline">
          Já tem uma conta?
        </Link>
      </form>
    </Shell>
  );
}

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { error, busy, run } = useAuthSubmit();
  return (
    <Shell>
      <h1 className="mb-2 text-center text-2xl font-bold text-fg-strong">Redefinir senha</h1>
      {sent ? (
        <p className="text-center text-fg-muted">Se existir uma conta com esse e-mail, enviamos um link de redefinição válido por 1 hora.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('POST', '/auth/forgot-password', { email });
              setSent(true);
            });
          }}
        >
          <p className="mb-6 text-center text-fg-muted">Informe seu e-mail para receber o link.</p>
          <Field label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          {error && <p className="mb-3 text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            Enviar link
          </button>
        </form>
      )}
      <Link to="/login" className="mt-4 block text-center text-sm text-brand hover:underline">
        Voltar ao login
      </Link>
    </Shell>
  );
}

export function ResetPage() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const { error, busy, run } = useAuthSubmit();
  return (
    <Shell>
      <h1 className="mb-6 text-center text-2xl font-bold text-fg-strong">Nova senha</h1>
      {done ? (
        <p className="text-center text-fg-muted">Senha alterada. Todas as sessões foram encerradas por segurança.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('POST', '/auth/reset-password', { token: params.get('token') ?? '', password });
              setDone(true);
            });
          }}
        >
          <Field label="Nova senha" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          {error && <p className="mb-3 text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            Alterar senha
          </button>
        </form>
      )}
      <Link to="/login" className="mt-4 block text-center text-sm text-brand hover:underline">
        Ir para o login
      </Link>
    </Shell>
  );
}
