'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJSON } from '@/lib/api';
import { useDialog } from '@/components/DialogProvider';
import { Sparkles, Smile, ArrowLeft, Eye, EyeOff, LoaderCircle, UserPlus } from 'lucide-react';

export default function RegisterPage() {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { showAlert } = useDialog();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      showAlert('Isi dulu semuanya ya biar bisa daftar!');
      return;
    }
    setLoading(true);
    try {
      await postJSON('/auth/register', { username, password });
      await showAlert('Hore! Pendaftaran berhasil! 🎉 Silakan masuk (Login) sekarang.');
      router.push('/login');
    } catch (e: any) {
      showAlert(e.message || 'Pendaftaran gagal, coba nama lain ya!');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-sky-50 flex items-center justify-center p-6 font-nunito relative overflow-hidden">
      {/* Decors */}
      <Sparkles className="absolute top-10 right-10 w-20 h-20 text-yellow-400 opacity-40 animate-pulse" />
      <Smile className="absolute bottom-10 left-10 w-24 h-24 text-sky-400 opacity-30 animate-bounce" style={{animationDuration: '3s'}} />

      {/* Back button */}
      <button
        onClick={() => router.push('/')}
        className="absolute top-6 left-6 z-20 flex items-center gap-2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full shadow-sm border-2 border-sky-100 text-slate-500 hover:text-sky-500 font-bold transition-colors"
      >
        <ArrowLeft className="w-5 h-5" /> Kembali
      </button>
      
      <div className="bg-white max-w-sm w-full rounded-3xl p-8 border-4 border-sky-100 shadow-xl relative z-10 text-center">
        <img src="/assets/logo/logo-icon.png" alt="NarraKids" className="w-20 h-20 object-contain mx-auto mb-4" />
        <h1 className="text-3xl font-black text-sky-500 mb-2">Daftar Sekarang!</h1>
        <p className="text-slate-500 font-bold mb-8">Buat akun NarraKids kamu yuk!</p>
        
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input
            className="border-2 border-slate-200 focus:border-sky-400 outline-none p-4 rounded-2xl font-bold text-slate-700 transition-colors"
            placeholder="Siapa namamu?"
            value={username}
            onChange={e => setU(e.target.value)}
          />
          <div className="relative">
            <input
              className="w-full border-2 border-slate-200 focus:border-sky-400 outline-none p-4 pr-14 rounded-2xl font-bold text-slate-700 transition-colors"
              placeholder="Kata Sandi Rahasia"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={e => setP(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-500 transition-colors focus:outline-none"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? "Sembunyikan Sandi" : "Lihat Sandi"}
            >
              {showPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
            </button>
          </div>
          <p className="text-xs text-slate-500 font-semibold px-2 -mt-2">
            *Kata sandi minimal 6 karakter. Boleh pakai spasi, huruf, atau angka!
          </p>
          
          <button 
            disabled={loading}
            className="group inline-flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-black text-xl py-4 rounded-2xl shadow-[0_6px_0_rgb(2,132,199)] hover:shadow-[0_4px_0_rgb(2,132,199)] hover:translate-y-1 transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><LoaderCircle className="w-6 h-6 animate-spin" /> Tunggu Sebentar...</>
            ) : (
              <>Daftar! <UserPlus className="w-6 h-6 group-hover:scale-110 transition-transform" /></>
            )}
          </button>
        </form>
        
        <div className="mt-8">
          <button
            type="button"
            className="text-slate-500 font-bold hover:text-sky-500 transition-colors underline decoration-wavy decoration-sky-300"
            onClick={() => router.push('/login')}
          >
            Sudah punya akun? Masuk aja!
          </button>
        </div>
      </div>
    </main>
  );
}
