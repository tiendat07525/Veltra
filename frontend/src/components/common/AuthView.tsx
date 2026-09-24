'use client';

import React, { useState } from 'react';
import { Radio, Mail, Lock, User, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';
import { authService } from '@/services/api/auth.service';

interface AuthViewProps {
  onLoginSuccess: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
        await authService.login({ username: username.trim(), password });
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
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.message)
          ? err.response.data.message[0]
          : null) ||
        'Đã xảy ra lỗi. Vui lòng thử lại.';
      setErrorMsg(typeof msg === 'string' ? msg : 'Đã xảy ra lỗi. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 p-4 overflow-y-auto">
      {/* Ambient background decoration */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-sky-500/30 mb-3">
            <Radio className="w-6 h-6 text-white stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">VELTRA</h1>
          <p className="text-xs text-slate-400 mt-1">
            {mode === 'login'
              ? 'Chào mừng trở lại. Đăng nhập vào hệ thống.'
              : 'Tạo tài khoản để bắt đầu trò chuyện.'}
          </p>
        </div>

        {/* Tab Switch */}
        <div className="grid grid-cols-2 p-1 bg-slate-800/80 rounded-xl mb-6 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`py-2 rounded-lg transition-all ${
              mode === 'login' ? 'bg-sky-500 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`py-2 rounded-lg transition-all ${
              mode === 'register' ? 'bg-sky-500 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Đăng ký
          </button>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mb-4 px-3 py-2 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 px-3 py-2 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs">
            {successMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Tên đăng nhập
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                placeholder="username"
                required
                disabled={loading}
                autoComplete="username"
              />
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  placeholder="name@email.com"
                  required
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Mật khẩu
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                placeholder="••••••••"
                required
                disabled={loading}
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-sky-500/25 transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <span>{mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Security badge footer */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
          <span>Đăng nhập bảo mật qua JWT Token</span>
        </div>
      </div>
    </div>
  );
};
