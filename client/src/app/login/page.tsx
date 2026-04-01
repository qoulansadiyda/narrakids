'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJSON } from '@/lib/api';
import { useDialog } from '@/components/DialogProvider';

export default function LoginPage() {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { showAlert } = useDialog();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      showAlert('Isi dulu username dan password-nya ya!');
      return;
    }
    setLoading(true);
    try {
      const data = await postJSON<{ token: string }>('/auth/login', { username, password });
      localStorage.setItem('token', data.token);
      router.push('/app');
    } catch (e: any) {
      showAlert(e.message || 'Login gagal, coba periksa kembali sandinya ya!');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-orange-50 flex items-center justify-center p-6 font-nunito relative overflow-hidden">
      {/* Decors */}
      <div className="absolute top-10 left-10 text-6xl opacity-30 animate-pulse">🦊</div>
      <div className="absolute bottom-10 right-10 text-6xl opacity-30 animate-bounce">🐊</div>
      
      <div className="bg-white max-w-sm w-full rounded-3xl p-8 border-4 border-orange-100 shadow-xl relative z-10 text-center">
        <h1 className="text-3xl font-black text-orange-500 mb-2">Selamat Datang!</h1>
        <p className="text-slate-500 font-bold mb-8">Masuk ke NarraKids</p>
        
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input
            className="border-2 border-slate-200 focus:border-orange-400 outline-none p-4 rounded-2xl font-bold text-slate-700 transition-colors"
            placeholder="Siapa namamu?"
            value={username}
            onChange={e => setU(e.target.value)}
          />
          <input
            className="border-2 border-slate-200 focus:border-orange-400 outline-none p-4 rounded-2xl font-bold text-slate-700 transition-colors"
            placeholder="Kata Sandi Rahasia"
            type="password"
            value={password}
            onChange={e => setP(e.target.value)}
          />
          
          <button 
            disabled={loading}
            className="bg-orange-500 hover:bg-orange-400 text-white font-black text-xl py-4 rounded-2xl shadow-[0_6px_0_rgb(194,65,12)] hover:shadow-[0_4px_0_rgb(194,65,12)] hover:translate-y-1 transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sabar Ya... ⏳' : 'Masuk! 🚀'}
          </button>
        </form>
        
        <div className="mt-8">
          <button
            type="button"
            className="text-slate-500 font-bold hover:text-orange-500 transition-colors underline decoration-wavy decoration-orange-300"
            onClick={() => router.push('/register')}
          >
            Belum punya akun? Daftar dulu yuk!
          </button>
        </div>
      </div>
    </main>
  );
}
