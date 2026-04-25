'use client';
import { isAuthed } from '@/lib/auth';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cloud, Sparkles, Star, PartyPopper, Rocket, Users, Music } from 'lucide-react';

export default function Landing() {
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    setAuthed(isAuthed());
  }, []);

  return (
    <main
      className="min-h-screen overflow-hidden relative font-nunito text-slate-800 bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: "url('/assets/background/landing-bg.png')" }}
    >
      {/* Decorative background elements */}
      <Cloud className="absolute top-10 left-10 w-24 h-24 text-white opacity-30 animate-bounce" style={{animationDuration: '3s'}} />
      <Cloud className="absolute top-20 right-20 w-32 h-32 text-sky-100 opacity-30 animate-bounce" style={{animationDuration: '4s'}} />
      <Sparkles className="absolute bottom-20 left-1/4 w-16 h-16 text-yellow-200 opacity-60 animate-pulse" />
      <Star className="absolute top-1/3 right-1/4 w-12 h-12 text-yellow-100 opacity-60 animate-pulse" />

      {/* Header */}
      <header className="p-6 flex justify-between items-center max-w-5xl mx-auto relative z-10 w-full">
        <div className="flex items-center gap-3">
          <img src="/assets/logo/logo-icon.png" alt="NarraKids" className="w-12 h-12 object-contain" />
          <img src="/assets/logo/logo-text.png" alt="NarraKids" className="h-8 object-contain" />
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
        <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-emerald-100 text-emerald-700 font-bold mb-8 shadow-sm">
          <PartyPopper className="w-5 h-5" /> Ayo buat cerita bersama teman!
        </div>

        <h2 className="text-5xl md:text-7xl font-black mb-8 leading-tight text-slate-800">
          Ciptakan <span className="text-orange-500">Buku Menarik</span><br />Dengan Imajinasimu!
        </h2>

        <p className="text-xl md:text-2xl text-slate-600 mb-12 max-w-2xl font-semibold leading-relaxed">
          Pilih karakter kesukaanmu, hias halamannya, dan susun cerita ajaib bareng teman-teman di dalam satu kanvas!
        </p>

        {mounted && (
          <div className="flex justify-center">
            {authed ? (
              <button
                onClick={() => router.push('/app')}
                className="group relative inline-flex items-center justify-center gap-3 px-10 py-5 bg-orange-500 hover:bg-orange-400 text-white rounded-3xl font-black text-2xl shadow-[0_8px_0_rgb(194,65,12)] hover:shadow-[0_4px_0_rgb(194,65,12)] hover:translate-y-1 transition-all"
              >
                Mulai Main Sekarang! <Rocket className="w-8 h-8 group-hover:animate-ping" />
              </button>
            ) : (
              <button
                onClick={() => router.push('/register')}
                className="group relative inline-flex items-center justify-center gap-3 px-10 py-5 bg-emerald-400 hover:bg-emerald-300 text-white rounded-3xl font-black text-2xl shadow-[0_8px_0_rgb(4,120,87)] hover:shadow-[0_4px_0_rgb(4,120,87)] hover:translate-y-1 transition-all"
              >
                Daftar Gratis Disini! <Sparkles className="w-8 h-8 group-hover:rotate-12 transition-transform" />
              </button>
            )}
          </div>
        )}

        {/* Features Highlight */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24">
          <div className="bg-white rounded-3xl p-8 shadow-sm border-2 border-sky-100 transform hover:-translate-y-2 transition-transform">
            <div className="flex justify-center mb-4"><Users className="w-16 h-16 text-sky-500" /></div>
            <h3 className="text-xl font-black text-slate-700 mb-2">Kolaborasi Realtime</h3>
            <p className="font-semibold text-slate-500 text-sm">Masuk kamar yang sama, gambar dan hias buku di waktu yang bersamaan!</p>
          </div>
          <div className="bg-white rounded-3xl p-8 shadow-sm border-2 border-orange-100 transform hover:-translate-y-2 transition-transform">
            <div className="text-5xl mb-4"><img src="/assets/logo/logo-icon.png" alt="Karakter" className="w-16 h-16 object-contain mx-auto" /></div>
            <h3 className="text-xl font-black text-slate-700 mb-2">Banyak Karakter</h3>
            <p className="font-semibold text-slate-500 text-sm">Ada stiker buku, karakter kancil, buaya, dan percakapan interaktif!</p>
          </div>
          <div className="bg-white rounded-3xl p-8 shadow-sm border-2 border-emerald-100 transform hover:-translate-y-2 transition-transform">
            <div className="flex justify-center mb-4"><Music className="w-16 h-16 text-emerald-500" /></div>
            <h3 className="text-xl font-black text-slate-700 mb-2">Efek Suara Seru</h3>
            <p className="font-semibold text-slate-500 text-sm">Tambahkan musik latar dan suara asik di ceritamu agar makin hidup!</p>
          </div>
        </div>
      </div>
    </main>
  );
}
