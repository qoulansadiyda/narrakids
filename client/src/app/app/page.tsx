'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthed, getToken, logout } from '@/lib/auth';
import { destroySocket } from '@/lib/socket';
import { useDialog } from '@/components/DialogProvider';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type BookSummary = {
  id: string;
  title: string;
  roomId: string;
  createdAt: string;
  _count: { pages: number };
};

export default function AppHome() {
  const router = useRouter();
  const [roomId, setRoomId] = useState('');
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const { showConfirm, showPrompt, showAlert } = useDialog();

  useEffect(() => {
    if (!isAuthed()) router.replace('/login');
  }, [router]);

  // Fetch user's books
  const fetchBooks = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API}/books`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) setBooks(data.books ?? []);
    } catch (e) {
      console.error('Failed to fetch books', e);
    } finally {
      setLoadingBooks(false);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const handleRenameBook = async (e: React.MouseEvent, bookId: string, currentTitle: string) => {
    e.stopPropagation();
    const newTitle = await showPrompt("Masukkan nama baru untuk buku ini:", currentTitle);
    if (!newTitle || newTitle.trim() === "" || newTitle === currentTitle) return;

    try {
      const token = getToken();
      const res = await fetch(`${API}/books/${bookId}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ title: newTitle.trim() })
      });
      const data = await res.json();
      if (data.ok) {
        setBooks(prev => prev.map(b => b.id === bookId ? { ...b, title: newTitle.trim() } : b));
      } else {
        showAlert("Gagal mengubah nama buku 😢");
      }
    } catch (e) {
      console.error(e);
      showAlert("Terjadi kesalahan saat mengubah nama buku.");
    }
  };

  const handleDeleteBook = async (e: React.MouseEvent, bookId: string) => {
    e.stopPropagation();
    const confirmDelete = await showConfirm("Yakin ingin menghapus buku ini? Buku yang sudah dihapus tidak bisa dikembalikan lho!");
    if (!confirmDelete) return;

    try {
      const token = getToken();
      const res = await fetch(`${API}/books/${bookId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setBooks(prev => prev.filter(b => b.id !== bookId));
      } else {
        showAlert("Gagal menghapus buku 😢");
      }
    } catch (e) {
      console.error(e);
      showAlert("Terjadi kesalahan saat menghapus buku.");
    }
  };

  const join = (e?: React.FormEvent) => {
    e?.preventDefault();
    const id = roomId.trim();
    if (id.length === 0) {
      showAlert("Kode kamarnya jangan kosong ya!");
      return;
    }
    router.push(`/lobby/${id}`);
  };

  const handleLogout = async () => {
    const confirmOut = await showConfirm("Yakin mau keluar dari NarraKids?");
    if (confirmOut) {
      destroySocket();
      logout();
      router.replace('/');
    }
  };



  // Helper function to pick a random color class based on book id
  const getCoverColor = (id: string) => {
    const colors = ['bg-rose-400', 'bg-sky-400', 'bg-emerald-400', 'bg-orange-400', 'bg-purple-400', 'bg-yellow-400'];
    const charCode = id.charCodeAt(id.length - 1);
    return colors[charCode % colors.length];
  };

  return (
    <main className="min-h-screen bg-sky-50 p-4 md:p-8 font-nunito relative overflow-hidden">
      {/* Background Decors */}
      <div className="absolute top-20 left-10 text-6xl opacity-20 -rotate-12">📚</div>
      <div className="absolute bottom-40 right-10 text-6xl opacity-20 rotate-12">✏️</div>

      <div className="max-w-4xl mx-auto relative z-10">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-10 bg-white p-4 md:px-8 rounded-full shadow-sm border-4 border-sky-100">
          <div className="flex items-center gap-3">
            <img src="/assets/logo/logo-icon.png" alt="NarraKids" className="w-10 h-10 object-contain" />
            <img src="/assets/logo/logo-text.png" alt="NarraKids" className="h-7 object-contain hidden sm:block" />
          </div>
          <div className="flex items-center gap-2 hidden sm:flex">
            <button
              className="font-bold text-indigo-500 hover:text-white bg-indigo-50 hover:bg-indigo-500 px-5 py-2.5 rounded-full transition-colors shadow-sm"
              onClick={() => router.push('/profile')}
            >
              Pengaturan Akun ⚙️
            </button>
            <button
              className="font-bold text-rose-500 hover:text-white bg-rose-50 hover:bg-rose-500 px-5 py-2.5 rounded-full transition-colors shadow-sm"
              onClick={handleLogout}
            >
              Keluar 👋
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {/* CREATE ROOM CARD */}
          <div className="bg-orange-400 rounded-3xl p-6 text-white shadow-[0_8px_0_rgb(194,65,12)] border-4 border-orange-300">
            <div className="text-5xl mb-3">🎪</div>
            <h2 className="text-2xl font-black mb-2">Buat Kamar Bermain</h2>
            <p className="font-semibold text-orange-100 mb-6">
              Bikin ruangan barumu dan ajak teman-teman bergabung untuk membuat cerita!
            </p>
            <button
              type="button"
              className="w-full bg-white text-orange-600 font-black py-4 rounded-2xl hover:bg-orange-50 active:scale-95 transition-all shadow-sm"
              onClick={() => router.push('/lobby/new')}
            >
              Buat Ruangan Baru! ✨
            </button>
          </div>

          {/* JOIN ROOM CARD */}
          <form onSubmit={join} className="bg-emerald-400 rounded-3xl p-6 text-white shadow-[0_8px_0_rgb(4,120,87)] border-4 border-emerald-300">
            <div className="text-5xl mb-3">🚀</div>
            <h2 className="text-2xl font-black mb-2">Ikut Bermain</h2>
            <p className="font-semibold text-emerald-100 mb-6">
              Punya kode ruangan dari temanmu? Yuk masukkan di bawah ini!
            </p>
            <div className="flex flex-col gap-3">
              <input
                className="w-full bg-white text-emerald-800 font-bold px-4 py-4 rounded-2xl outline-none border-2 border-transparent focus:border-emerald-200 placeholder-emerald-300 transition-colors"
                placeholder="Kode Kamar (Contoh: a1b2c3)"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.trim())}
              />
              <button 
                className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl hover:bg-emerald-500 active:scale-95 transition-all shadow-sm" 
                type="submit"
              >
                Gabung Sekarang! 👉
              </button>
            </div>
          </form>
        </div>

        {/* MY BOOKS LIST */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border-4 border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-4xl text-sky-400">📚</span>
            <h2 className="text-2xl font-black text-slate-700">Koleksi Bukuku</h2>
          </div>

          {loadingBooks ? (
            <div className="flex justify-center items-center h-40">
              <div className="text-xl font-bold text-sky-400 animate-pulse">Sedang mencari buku... 👀</div>
            </div>
          ) : books.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-2xl border-4 border-dashed border-slate-200">
              <span className="text-5xl mb-4 opacity-50">📂</span>
              <p className="text-lg font-bold text-slate-500">
                Belum ada buku nih!<br/>Ayo buat cerita seru dan kumpulkan karyamu di sini.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-6">
              {books.map((book) => (
                <div
                  key={book.id}
                  className="group relative flex flex-col cursor-pointer transform hover:-translate-y-2 hover:rotate-2 transition-transform"
                  onClick={() => router.push(`/book/${book.id}`)}
                >
                  {/* Book Cover Design */}
                  <div className={`aspect-[3/4] rounded-r-2xl rounded-l-md ${getCoverColor(book.id)} shadow-[4px_4px_0_rgba(15,23,42,0.15)] flex flex-col p-4 border-l-8 border-black/20 relative overflow-hidden h-full`}>
                     {/* Decorative pattern/shine */}
                     <div className="absolute top-0 right-0 w-16 h-full bg-white/20 skew-x-12 transform translate-x-8"></div>
                     
                     <div className="mt-auto w-full relative z-10">
                       <h3 className="text-white font-black text-lg md:text-xl leading-tight line-clamp-3 drop-shadow-md decoration-white">
                         {book.title}
                       </h3>
                       <p className="text-white font-bold text-xs mt-2 bg-black/20 inline-block px-2 py-1 rounded-md">
                         {book._count.pages} Halaman
                       </p>
                     </div>
                  </div>

                  {/* External Hover Actions */}
                  <div className="absolute -top-3 -right-3 sm:opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity duration-200 z-20">
                    <button 
                      onClick={(e) => handleRenameBook(e, book.id, book.title)}
                      className="bg-white hover:bg-sky-100 text-sky-500 rounded-full w-10 h-10 flex items-center justify-center shadow-lg border-2 border-sky-300 active:scale-90 transition-transform"
                      title="Ubah Nama"
                    >
                      ✏️
                    </button>
                    <button 
                      onClick={(e) => handleDeleteBook(e, book.id)}
                      className="bg-white hover:bg-rose-100 text-rose-500 rounded-full w-10 h-10 flex items-center justify-center shadow-lg border-2 border-rose-300 active:scale-90 transition-transform"
                      title="Hapus"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Mobile bottom actions */}
        <div className="mt-8 flex flex-col gap-3 text-center sm:hidden">
          <button
            className="font-bold text-indigo-500 hover:text-white bg-indigo-50 hover:bg-indigo-500 px-6 py-3 rounded-full transition-colors shadow-sm w-full max-w-[200px] mx-auto"
            onClick={() => router.push('/profile')}
          >
            Pengaturan Akun ⚙️
          </button>
          <button
            className="font-bold text-rose-500 hover:text-white bg-rose-50 hover:bg-rose-500 px-6 py-3 rounded-full transition-colors shadow-sm w-full max-w-[200px] mx-auto"
            onClick={handleLogout}
          >
            Keluar 👋
          </button>
        </div>
      </div>
    </main>
  );
}
