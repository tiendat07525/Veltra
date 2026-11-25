'use client';

import React, { useState } from 'react';
import { Radio, Mail, Lock, User, ArrowRight, ArrowLeft, ShieldCheck, KeyRound, Loader2, CheckCircle2 } from 'lucide-react';
import { authService } from '@/services/api/auth.service';
import { InlineError } from '@/components/ui/InlineError';
import { apiErrorText } from '@/lib/api-error';

interface AuthViewProps {
  initialMode?: 'login' | 'register';
  onLoginSuccess: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ initialMode = 'login', onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  // 2FA step: the challenge from POST /auth/login (5 minutes, 5 attempts)
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const backToPassword = (message: string | null = null) => {
    setChallengeToken(null);
    setCode('');
    setPassword('');
    setErrorMsg(message);
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeToken) return;
    if (!code.trim()) {
      setErrorMsg('Nhập mã xác thực');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      await authService.loginTwoFactor(challengeToken, code.trim());
      onLoginSuccess();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg = apiErrorText(err, 'Đã xảy ra lỗi. Vui lòng thử lại.');
      if (status === 429) {
        setErrorMsg(msg);
      } else if (status === 401 && msg !== 'Mã xác thực không đúng') {
        // Challenge expired or too many wrong codes: start again from the password
        backToPassword(msg);
      } else {
        setErrorMsg(msg);
        setCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (mode === 'login') {
        if (!username.trim() || !password.trim()) {
          setErrorMsg('Vui lòng nhập tên đăng nhập và mật khẩu');
          return;
        }
        const result = await authService.login({ username: username.trim(), password });
        if (result.twoFactorRequired) {
          setChallengeToken(result.challengeToken);
          setCode('');
          return;
        }
        onLoginSuccess();
      } else {
        if (!username.trim() || !email.trim() || !password.trim()) {
          setErrorMsg('Vui lòng điền đầy đủ thông tin');
          return;
        }
        if (password.length < 6) {
          setErrorMsg('Mật khẩu phải có ít nhất 6 ký tự');
          return;
        }
        await authService.register({
          username: username.trim(),
          email: email.trim(),
          password,
        });
        // After register, user needs to login
        setSuccessMsg('Đăng ký thành công! Vui lòng đăng nhập.');
        setMode('login');
        setPassword('');
      }
    } catch (err: unknown) {
      setErrorMsg(apiErrorText(err, 'Đã xảy ra lỗi. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-app text-fg">
      <div className="min-h-full flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-surface border border-line rounded-3xl p-5 sm:p-8 shadow-sm">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6 sm:mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mb-3">
            <Radio className="w-6 h-6 text-on-primary stroke-[2.5]" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-fg">VELTRA</h1>
          <p className="text-sm text-fg-muted mt-1">
            {challengeToken
              ? 'Xác thực 2 bước'
              : mode === 'login'
                ? 'Chào mừng trở lại. Đăng nhập để tiếp tục.'
                : 'Tạo tài khoản để bắt đầu trò chuyện.'}
          </p>
        </div>

        {/* Tab Switch */}
        {!challengeToken && (
        <div className="grid grid-cols-2 p-1 bg-surface-2 rounded-xl mb-6 text-sm font-semibold" role="tablist" aria-label="Đăng nhập hoặc đăng ký">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => {
              setMode('login');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`min-h-9 rounded-lg transition-colors ${
              mode === 'login' ? 'bg-surface text-accent shadow-xs' : 'text-fg-muted hover:text-fg'
            }`}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            onClick={() => {
              setMode('register');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`min-h-9 rounded-lg transition-colors ${
              mode === 'register' ? 'bg-surface text-accent shadow-xs' : 'text-fg-muted hover:text-fg'
            }`}
          >
            Đăng ký
          </button>
        </div>
        )}

        {/* Messages */}
        <InlineError message={errorMsg} onDismiss={() => setErrorMsg(null)} className="mb-4" />
        {successMsg && (
          <div
            role="status"
            className="mb-4 flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <p className="flex-1 leading-4">{successMsg}</p>
          </div>
        )}

        {/* 2FA step */}
        {challengeToken && (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <div>
              <label htmlFor="two-factor-code" className="block text-xs font-semibold text-fg mb-1.5">
                Mã xác thực
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                  id="two-factor-code"
                  type="text"
                  inputMode="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  aria-describedby="two-factor-hint"
                  className="w-full min-h-11 pl-9 pr-3 py-2.5 bg-surface-2 border border-line rounded-xl text-sm text-fg placeholder:text-fg-muted focus:outline-hidden focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 tracking-widest"
                  placeholder="123456"
                  maxLength={20}
                  disabled={loading}
                  autoFocus
                  autoComplete="one-time-code"
                  spellCheck={false}
                />
              </div>
              <p id="two-factor-hint" className="mt-1.5 text-xs text-fg-muted">
                Nhập mã 6 số trong ứng dụng xác thực, hoặc một mã dự phòng (xxxxx-xxxxx).
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 min-h-11 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed text-on-primary text-sm font-semibold transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="w-4 h-4" aria-hidden="true" />}
              <span>Xác nhận</span>
            </button>
            <button
              type="button"
              onClick={() => backToPassword()}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 min-h-10 rounded-xl text-sm text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Quay lại
            </button>
          </form>
        )}

        {/* Form */}
        {!challengeToken && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="auth-username" className="block text-xs font-semibold text-fg mb-1.5">
              Tên đăng nhập
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                id="auth-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full min-h-11 pl-9 pr-3 py-2.5 bg-surface-2 border border-line rounded-xl text-sm text-fg placeholder:text-fg-muted focus:outline-hidden focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                placeholder="username"
                required
                disabled={loading}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label htmlFor="auth-email" className="block text-xs font-semibold text-fg mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-11 pl-9 pr-3 py-2.5 bg-surface-2 border border-line rounded-xl text-sm text-fg placeholder:text-fg-muted focus:outline-hidden focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  placeholder="name@email.com"
                  required
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="auth-password" className="block text-xs font-semibold text-fg mb-1.5">
              Mật khẩu
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-11 pl-9 pr-3 py-2.5 bg-surface-2 border border-line rounded-xl text-sm text-fg placeholder:text-fg-muted focus:outline-hidden focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                placeholder="••••••••"
                required
                disabled={loading}
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
            {mode === 'register' && <p className="mt-1.5 text-xs text-fg-muted">Ít nhất 6 ký tự.</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 min-h-11 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed text-on-primary text-sm font-semibold transition-colors mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <span>{mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </>
            )}
          </button>
        </form>
        )}

        {/* Footer */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-fg-muted text-center">
          <ShieldCheck className="w-4 h-4 shrink-0 text-accent" aria-hidden="true" />
          <span>Hỗ trợ xác thực 2 bước để bảo vệ tài khoản</span>
        </div>
      </div>
      </div>
    </div>
  );
};
