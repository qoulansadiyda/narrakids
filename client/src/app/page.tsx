'use client';
import { isAuthed } from '@/lib/auth';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Landing() {
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    setAuthed(isAuthed());
  }, []);

  return (
    <main className="min-h-screen bg-sky-50 overflow-hidden relative font-nunito text-slate-800">
      {/* Decorative background elements */}
      <div className="absolute top-10 left-10 text-6xl opacity-30 animate-bounce" style={{animationDuration: '3s'}}>☁️</div>
      <div className="absolute top-20 right-20 text-6xl opacity-30 animate-bounce" style={{animationDuration: '4s'}}>☁️</div>
      <div className="absolute bottom-20 left-1/4 text-5xl opacity-40 animate-pulse">✨</div>
      <div className="absolute top-1/3 right-1/4 text-4xl opacity-40 animate-pulse">⭐</div>

      {/* Header */}
      <header className="p-6 flex justify-between items-center max-w-5xl mx-auto relative z-10 w-full">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-3xl">📖</div>
          <h1 className="text-3xl font-black text-sky-600 tracking-tight drop-shadow-sm">NarraKids</h1>
        </div>
        
        {mounted && !authed && (
          <div className="flex gap-4 font-bold">
            <button 
              onClick={() => router.push('/login')} 
              className="px-6 py-2.5 rounded-full text-sky-600 bg-sky-100 hover:bg-sky-200 transition-colors shadow-sm"
            >
              Masuk
            </button>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-24 text-center relative z-10 flex flex-col items-center">
        <div className="inline-block px-5 py-2 rounded-full bg-emerald-100 text-emerald-700 font-bold mb-8 shadow-sm">
          🎉 Ayo buat cerita bersama teman!
        </div>
        
        <h2 className="text-5xl md:text-7xl font-black mb-8 leading-tight text-slate-800">
          Ciptakan <span className="text-orange-500 underline decoration-wavy decoration-orange-300">Buku Menarik</span><br/>Dengan Imajinasimu!
        </h2>
        
        <p className="text-xl md:text-2xl text-slate-600 mb-12 max-w-2xl font-semibold leading-relaxed">
          Pilih karakter kesukaanmu, hias halamannya, dan susun cerita ajaib bareng teman-teman di dalam satu kanvas!
        </p>

        {mounted && (
          <div className="flex justify-center">
            {authed ? (
              <button 
                onClick={() => router.push('/app')} 
                className="group relative px-10 py-5 bg-orange-500 hover:bg-orange-400 text-white rounded-3xl font-black text-2xl shadow-[0_8px_0_rgb(194,65,12)] hover:shadow-[0_4px_0_rgb(194,65,12)] hover:translate-y-1 transition-all"
              >
                Mulai Main Sekarang! 🚀
              </button>
            ) : (
              <button 
                onClick={() => router.push('/register')} 
                className="group relative px-10 py-5 bg-emerald-400 hover:bg-emerald-300 text-white rounded-3xl font-black text-2xl shadow-[0_8px_0_rgb(4,120,87)] hover:shadow-[0_4px_0_rgb(4,120,87)] hover:translate-y-1 transition-all"
              >
                Daftar Gratis Disini! ✨
              </button>
            )}
          </div>
        )}

        {/* Features Highlight */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24">
          <div className="bg-white rounded-3xl p-8 shadow-sm border-2 border-sky-100 transform hover:-translate-y-2 transition-transform">
            <div className="text-5xl mb-4">🤝</div>
            <h3 className="text-xl font-black text-slate-700 mb-2">Kolaborasi Realtime</h3>
            <p className="font-semibold text-slate-500 text-sm">Masuk kamar yang sama, gambar dan hias buku di waktu yang bersamaan!</p>
          </div>
          <div className="bg-white rounded-3xl p-8 shadow-sm border-2 border-orange-100 transform hover:-translate-y-2 transition-transform">
            <div className="text-5xl mb-4">🦊</div>
            <h3 className="text-xl font-black text-slate-700 mb-2">Banyak Karakter</h3>
            <p className="font-semibold text-slate-500 text-sm">Ada stiker buku, karakter kancil, buaya, dan percakapan interaktif!</p>
          </div>
          <div className="bg-white rounded-3xl p-8 shadow-sm border-2 border-emerald-100 transform hover:-translate-y-2 transition-transform">
            <div className="text-5xl mb-4">🎵</div>
            <h3 className="text-xl font-black text-slate-700 mb-2">Efek Suara Seru</h3>
            <p className="font-semibold text-slate-500 text-sm">Tambahkan musik latar dan suara asik di ceritamu agar makin hidup!</p>
          </div>
        </div>
      </div>
    </main>
  );
}
