'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthed, getToken, logout } from '@/lib/auth';
import { useDialog } from '@/components/DialogProvider';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ProfilePage() {
  const router = useRouter();
  const { showAlert, showConfirm } = useDialog();

  const [username, setUsername] = useState('');
  
  const [newUsername, setNewUsername] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [loadingName, setLoadingName] = useState(false);
  const [loadingPass, setLoadingPass] = useState(false);

  useEffect(() => {
    if (!isAuthed()) {
      router.replace('/login');
    } else {
      const token = getToken();
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUsername(payload.username || '');
          setNewUsername(payload.username || '');
        } catch (e) {}
      }
    }
  }, [router]);

  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || newUsername.trim() === username) return;
    
    setLoadingName(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/auth/profile`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ newUsername: newUsername.trim() })
      });
      const data = await res.json();
      if (data.ok) {
        localStorage.setItem("token", data.token);
        setUsername(data.username);
        showAlert("Hore! Nama barumu sudah tersimpan: " + data.username + " 🦊");
      } else {
        showAlert("Gagal merubah nama: " + (data.error || "Pesan Kesalahan Tidak Diketahui"));
      }
    } catch (e) {
      console.error(e);
      showAlert("Ups, koneksi internet sepertinya terputus.");
    } finally {
      setLoadingName(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      showAlert("Penting! Isi kata sandi lamamu dan kata sandi yang baru ya!");
      return;
    }
    if (newPassword.length < 6) {
      showAlert("Sandi baru tidak boleh kependekan! Minimal 6 huruf/angka ya.");
      return;
    }
    
    setLoadingPass(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/auth/profile/password`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await res.json();
      if (data.ok) {
        showAlert("Yay! Kata sandimu berhasil diubah. Jaga baik-baik ya! 🏰");
        setOldPassword('');
        setNewPassword('');
      } else {
        showAlert("Gagal merubah sandi: " + (data.error || "Pesan Kesalahan Tidak Diketahui"));
      }
    } catch (e) {
      console.error(e);
      showAlert("Ups, ada masalah saat menghubungi server.");
    } finally {
      setLoadingPass(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmOut = await showConfirm(`Yakin ingin menghapus identitas ${username} untuk selamanya? Semua koleksi bukumu tidak akan bisa kembali lho! 😱`);
    if (!confirmOut) return;

    try {
      const token = getToken();
      const res = await fetch(`${API}/auth/profile`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        await showAlert("Akunmu telah terhapus. Sampai jumpa lagi! 👋");
        logout();
        router.replace('/');
      } else {
        showAlert("Gagal menghapus akun: " + (data.error || "Pesan Kesalahan Tidak Diketahui"));
      }
    } catch (e) {
      console.error(e);
      showAlert("Ups, gagal menghapus akun karena jaringan terputus.");
    }
  };

  return (
    <main className="min-h-screen bg-sky-50 p-4 md:p-8 font-nunito relative overflow-hidden">
      {/* Background Decors */}
      <div className="absolute top-20 right-10 text-6xl opacity-20 rotate-12 flex">⚙️</div>
      <div className="absolute bottom-20 left-10 text-6xl opacity-20 -rotate-12 flex">🎨</div>

      <div className="max-w-2xl mx-auto relative z-10">
        
        {/* Header */}
        <header className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => router.push('/app')}
            className="w-12 h-12 flex items-center justify-center bg-white rounded-full shadow-sm text-sky-500 hover:bg-sky-100 hover:scale-105 active:scale-95 transition-all text-xl font-bold border-4 border-sky-100"
          >
            ←
          </button>
          <h1 className="text-3xl font-black text-slate-700">Pengaturan Akun</h1>
        </header>

        <div className="flex flex-col gap-6">
          {/* UBAH USERNAME CARD */}
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border-4 border-sky-100">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">👤</span>
              <h2 className="text-xl font-black text-sky-600">Ganti Nama Identitas</h2>
            </div>
            <p className="text-slate-500 font-semibold mb-6">Bosan dengan namamu sekarang? Ganti jadi yang lebih keren!</p>
            
            <form onSubmit={handleUpdateUsername} className="flex flex-col gap-4">
              <input
                className="w-full bg-sky-50 text-slate-700 font-bold px-4 py-4 rounded-2xl outline-none border-2 border-transparent focus:border-sky-300 transition-colors"
                placeholder="Nama Identitas Baru"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
              <button 
                disabled={loadingName || newUsername.trim() === username || newUsername.trim() === ''}
                className="w-full bg-sky-500 text-white font-black py-4 rounded-2xl hover:bg-sky-400 active:scale-95 transition-all shadow-[0_6px_0_rgb(2,132,199)] hover:shadow-[0_4px_0_rgb(2,132,199)] hover:translate-y-1 mb-2 disabled:opacity-50 disabled:cursor-not-allowed" 
                type="submit"
              >
                {loadingName ? 'Menyimpan... ⏳' : 'Simpan Nama Baru! ✨'}
              </button>
            </form>
          </div>

          {/* UBAH PASSWORD CARD */}
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border-4 border-emerald-100">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">🗝️</span>
              <h2 className="text-xl font-black text-emerald-600">Ubah Kata Sandi</h2>
            </div>
            <p className="text-slate-500 font-semibold mb-6">Pastikan hanya kamu yang tahu kata sandi rahasiamu!</p>
            
            <form onSubmit={handleUpdatePassword} className="flex flex-col gap-4">
              <input
                type="password"
                className="w-full bg-emerald-50 text-slate-700 font-bold px-4 py-4 rounded-2xl outline-none border-2 border-transparent focus:border-emerald-300 transition-colors"
                placeholder="Ketik Kata Sandi Lamamu"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
              <input
                type="password"
                className="w-full bg-emerald-50 text-slate-700 font-bold px-4 py-4 rounded-2xl outline-none border-2 border-transparent focus:border-emerald-300 transition-colors"
                placeholder="Kata Sandi Rahasia yang Baru"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button 
                disabled={loadingPass || !oldPassword || !newPassword}
                className="w-full bg-emerald-500 text-white font-black py-4 rounded-2xl hover:bg-emerald-400 active:scale-95 transition-all shadow-[0_6px_0_rgb(5,150,105)] hover:shadow-[0_4px_0_rgb(5,150,105)] hover:translate-y-1 mb-2 disabled:opacity-50 disabled:cursor-not-allowed" 
                type="submit"
              >
                {loadingPass ? 'Menyimpan... ⏳' : 'Simpan Sandi Baru! 🛡️'}
              </button>
            </form>
          </div>

          {/* HAPUS AKUN CARD (DANGER ZONE) */}
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border-4 border-rose-100 mt-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⚠️</span>
              <h2 className="text-xl font-black text-rose-600">Hapus Akun</h2>
            </div>
            <p className="text-rose-500 font-semibold mb-6">
              Hati-hati ya! Menghapus akun akan menghilangkan seluruh koleksi buku cerita yang pernah kamu buat selamanya. Jangan ditekan kalau masih ragu!
            </p>
            <button 
              onClick={handleDeleteAccount}
              className="w-full bg-rose-100 text-rose-600 border-2 border-rose-200 font-black py-4 rounded-2xl hover:bg-rose-500 hover:text-white hover:border-rose-500 active:scale-95 transition-all shadow-sm" 
              type="button"
            >
              Hapus Akunku Selamanya 🗑️
            </button>
          </div>

        </div>
      </div>
    </main>
  );
}
