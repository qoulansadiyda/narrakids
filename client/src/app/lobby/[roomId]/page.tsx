// client/src/app/lobby/[roomId]/page.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";
import { isAuthed } from "@/lib/auth";
import { useDialog } from "@/components/DialogProvider";
import { LoaderCircle, Gamepad2, Sparkles, ArrowLeft, Copy, Crown, Settings, Hourglass, Play } from "lucide-react";

type User = { sid: string; userId: string; username: string };
type State = {
  roomId: string;
  hostId: string | null;
  min: number;
  max: number;
  started: boolean;
  users: User[];
  canStart: boolean; // server-side
  settings?: any;
};

export default function Lobby() {
  const { roomId } = useParams() as { roomId: string };
  const router = useRouter();
  const socket: Socket = getSocket();
  const { showAlert, showConfirm } = useDialog();

  const [state, setState] = useState<State | null>(null);
  const [me, setMe] = useState<string>("");
  const navigatedRef = useRef(false); // guard agar replace sekali saja
  const stayInRoomRef = useRef(false); // jangan kirim leave kalau pindah ke editor

  // ── Auth gate ──
  useEffect(() => {
    if (!isAuthed()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    const onState = (s: State) => {
      setState(s);
      
      // Sinkronisasi data form dari Host ke pemain lain
      if (s.settings && s.hostId !== socket.id) {
         if (s.settings.bookTitle !== undefined) setBookTitle(s.settings.bookTitle);
         if (s.settings.turnDuration !== undefined) setTurnDuration(s.settings.turnDuration);
         if (s.settings.canvasQuota !== undefined) setCanvasQuota(s.settings.canvasQuota);
      }

      console.log("[CLIENT] room:state", {
        roomId: s.roomId,
        users: s.users.length,
        min: s.min,
        canStart: s.canStart,
        hostId: s.hostId,
        me,
      });
    };
    const onJoined = ({ you }: { you: string }) => setMe(you);
    const onStart = () => {
      stayInRoomRef.current = true;
      router.push(`/editor/${roomId}`);
    };
    const onKicked = async ({ reason }: { reason: string }) => {
      await showAlert(`⛔ ${reason}`);
      router.replace("/app");
    };

    socket.on("room:state", onState);
    socket.on("room:joined", onJoined);
    socket.on("room:start", onStart);
    socket.on("room:kicked", onKicked);

    const doJoin = () => {
      if (roomId === "new") {
        socket.emit("room:create", { min: 2 }, (resp: any) => {
          if (!resp?.roomId) return;
          if (!navigatedRef.current) {
            navigatedRef.current = true;
            if (resp?.snapshot) setState(resp.snapshot);
            if (resp?.you) setMe(resp.you);
            router.replace(`/lobby/${resp.roomId}`);
          }
        });
      } else {
        socket.emit("room:join", { roomId }, async (resp: any) => {
          console.log("[CLIENT] room:join resp", resp);

          if (resp?.snapshot) setState(resp.snapshot);
          if (resp?.you) setMe(resp.you);

          // ❌ Room tidak ada
          if (resp?.error === "ROOM_NOT_FOUND") {
            await showAlert("Room ID tidak ditemukan. Cek kodenya atau buat baru yuk!");
            router.replace("/app");
            return;
          }

          if (resp?.error === "NAME_TAKEN") {
            await showAlert("Display Name kamu kebetulan sama persis dengan pemain lain yang ada di ruangan ini. Ganti nama profilmu dulu yuk!");
            router.replace("/app");
            return;
          }

          // ❌ Room sudah penuh
          if (resp?.error === "ROOM_FULL") {
            await showAlert(`Room sudah penuh.\nMaksimal pemain: ${resp.max ?? 4}. Silakan buat room baru atau join room lain.`);
            router.replace("/app");
            return;
          }

          // ❌ Session sudah dimulai, tidak bisa ikut
          if (resp?.error === "ALREADY_STARTED") {
            await showAlert("Sesi cerita sudah dimulai, kamu tidak bisa masuk ke room ini lagi 😢");
            router.replace("/app");
            return;
          }

          // Hanya kalau gagal karena alasan lain (misal delay koneksi) baru retry
          if (!resp?.ok) setTimeout(doJoin, 300);
        });
      }
    };

    if (socket.connected) doJoin();
    else {
      const once = () => {
        doJoin();
        socket.off("connect", once);
      };
      socket.on("connect", once);
    }

    return () => {
      // bersihkan listener + info server bahwa kita keluar
      if (!stayInRoomRef.current && state?.roomId) {
        socket.emit("room:leave", { roomId: state.roomId });
      }
      socket.off("room:state", onState);
      socket.off("room:joined", onJoined);
      socket.off("room:start", onStart);
      socket.off("room:kicked", onKicked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const [turnDuration, setTurnDuration] = useState<number>(0);
  const [canvasQuota, setCanvasQuota] = useState<number>(2);
  const [bookTitle, setBookTitle] = useState<string>("");

  // Sinkronisasi otomatis dari Host ke Server setiap kali Host mengganti/mengetik pengaturan
  useEffect(() => {
    if (state && me && state.hostId === me && socket.connected) {
      const timer = setTimeout(() => {
        socket.emit("room:settings_update", { 
          roomId: state.roomId, 
          settings: { turnDuration, canvasQuota, bookTitle } 
        });
      }, 500); 
      return () => clearTimeout(timer);
    }
  }, [turnDuration, canvasQuota, bookTitle, state?.hostId, me, socket, state?.roomId]);

  if (!state) {
    return (
      <main className="min-h-screen bg-sky-50 flex items-center justify-center p-6 font-nunito">
        <div className="flex items-center gap-3 text-2xl font-black text-sky-500 animate-pulse">Menyiapkan Ruangan... <LoaderCircle className="w-8 h-8 animate-spin" /></div>
      </main>
    );
  }

  const handleTransferHost = async (targetSid: string, targetName: string) => {
    const isOk = await showConfirm(`Apakah Anda yakin ingin menyerahkan status Host/Ketua permainan ini kepada ${targetName}?`);
    if (!isOk) return;

    if (socket) {
      socket.emit("room:transferHost", { roomId, targetSid }, (resp: any) => {
        if (!resp?.ok) {
           showAlert("Gagal menyerahkan Host: " + (resp?.error || "Unknown Error"));
        } else {
           showAlert(`Pemimpin kamar berhasil dipindahkan ke ${targetName}! Anda sekarang adalah pemain biasa.`);
        }
      });
    }
  };

  const isHost = state.hostId === me;
  const hostUser = state.users.find(u => u.sid === state.hostId);

  return (
    <main className="min-h-screen bg-sky-50 flex flex-col items-center justify-center p-4 md:p-8 font-nunito relative overflow-hidden">
      {/* Background Decors */}
      <img src="/assets/logo/logo-icon.png" alt="" className="absolute top-10 left-10 w-16 h-16 opacity-20 animate-bounce cursor-default" />
      <Gamepad2 className="absolute bottom-20 right-10 w-24 h-24 text-sky-400 opacity-20 animate-pulse cursor-default" />
      <Sparkles className="absolute top-1/4 right-1/4 w-16 h-16 text-yellow-300 opacity-30 animate-spin-slow cursor-default" />

      {/* Back button */}
      <button
        onClick={() => router.replace('/app')}
        className="absolute top-6 left-6 z-20 flex items-center gap-2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full shadow-sm border-2 border-sky-100 text-slate-500 hover:text-sky-500 font-bold transition-colors"
      >
        <ArrowLeft className="w-5 h-5" /> Kembali
      </button>

      <div className="w-full max-w-lg bg-white rounded-[2rem] shadow-xl border-4 border-sky-200 relative z-10 overflow-hidden flex flex-col">
        {/* Header Ticket */}
        <div className="bg-sky-400 p-6 text-center text-white relative">
          <div className="absolute -left-6 -bottom-6 w-12 h-12 bg-sky-50 rounded-full"></div>
          <div className="absolute -right-6 -bottom-6 w-12 h-12 bg-sky-50 rounded-full"></div>
          
          <h1 className="text-3xl font-black mb-1 drop-shadow-sm">
            {bookTitle || `Ruangan Dongeng`}
          </h1>
          <p className="font-bold text-sky-100 bg-sky-500/50 inline-block px-4 py-1 rounded-full text-sm font-mono mt-2">
            KODE: {state.roomId}
          </p>
        </div>

        <div className="p-6 md:p-8 flex-1 flex flex-col gap-6">
          {/* Status Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
            <div className="text-center sm:text-left">
              <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Pemain</span>
              <span className="text-2xl font-black text-slate-700">
                {state.users.length} <span className="text-lg text-slate-400">/ {state.max ?? 4}</span>
              </span>
            </div>
            
            <div className="text-center sm:text-right">
              <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Ketua (Host)</span>
              <span className="text-lg font-bold text-sky-600">
                {hostUser ? hostUser.username : state.hostId?.slice(0, 4)}
              </span>
            </div>
          </div>

          {/* Copy Link */}
          <div className="flex bg-orange-50 rounded-xl border-2 border-orange-100 overflow-hidden">
             <div className="bg-orange-100 px-4 py-3 flex items-center justify-center text-orange-400 font-bold border-r-2 border-orange-200">
               Link
             </div>
             <input 
               readOnly 
               className="flex-1 bg-transparent px-3 font-mono text-sm text-slate-600 outline-none"
               value={typeof window !== "undefined" ? `${location.origin}/lobby/${state.roomId}` : ""}
             />
             <button
               onClick={() => {
                 navigator.clipboard.writeText(`${location.origin}/lobby/${state.roomId}`);
               }}
               className="px-4 py-3 bg-orange-200 text-orange-600 font-bold hover:bg-orange-300 transition-colors"
               title="Copy Link"
             >
               <Copy className="w-5 h-5" />
             </button>
          </div>

          {/* User List */}
          <div>
            <h3 className="font-bold text-slate-400 uppercase text-xs tracking-widest mb-3">Daftar Teman</h3>
            <div className="flex flex-wrap gap-2">
              {state.users.map((u) => (
                <div key={u.sid} className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 font-bold shadow-sm ${u.sid === me ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600'}`}>
                  <span>{u.username}</span>
                  {u.sid === state.hostId && <span className="text-[10px] bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full uppercase tracking-wider">Host</span>}
                  {u.sid === me && <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full uppercase tracking-wider">Pemain (Kamu)</span>}
                  {isHost && u.sid !== me && (
                    <button
                      onClick={() => handleTransferHost(u.sid, u.username)}
                      className="ml-2 inline-flex items-center gap-1 text-[10px] bg-indigo-50 hover:bg-indigo-500 hover:text-white text-indigo-700 border border-indigo-200 font-black px-3 py-1 rounded-full uppercase tracking-wider transition-colors shadow-sm active:translate-y-0.5"
                      title="Jadikan Host Permainan"
                    >
                      <Crown className="w-3 h-3" /> Serahkan Host
                    </button>
                  )}
                </div>
              ))}
              
              {/* Empty slots placeholders */}
              {Array.from({ length: Math.max(0, (state.max ?? 4) - state.users.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="px-4 py-2 rounded-full border-2 border-dashed border-slate-200 bg-slate-50 text-slate-300 font-bold flex items-center gap-2">
                  <span className="opacity-50">Menunggu...</span>
                </div>
              ))}
            </div>
          </div>

          {/* Host Settings */}
          {isHost && (
            <div className="bg-orange-50 p-5 rounded-2xl border-4 border-orange-100 mt-2">
              <h2 className="text-sm font-black text-orange-500 mb-4 uppercase tracking-widest flex items-center gap-2">
                <Settings className="w-5 h-5" /> Pengaturan Kamar
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-orange-700 mb-1">Durasi Giliran (Max Turn)</label>
                  <select
                    className="w-full bg-white border-2 border-orange-200 text-orange-800 font-bold rounded-xl px-3 py-3 outline-none focus:border-orange-400 transition-colors"
                    value={turnDuration}
                    onChange={(e) => setTurnDuration(parseInt(e.target.value))}
                  >
                    <option value={0}>Tidak Dibatasi (Bebas!)</option>
                    <option value={30}>30 Detik (Super Cepat)</option>
                    <option value={60}>1 Menit</option>
                    <option value={120}>2 Menit</option>
                    <option value={180}>3 Menit</option>
                    <option value={240}>4 Menit</option>
                    <option value={300}>5 Menit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-orange-700 mb-1">Batas Halaman Cerita (Per Anak)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="w-full bg-white border-2 border-orange-200 text-orange-800 font-bold rounded-xl px-3 py-3 outline-none focus:border-orange-400 transition-colors"
                    value={canvasQuota}
                    onChange={(e) => {
                      let val = parseInt(e.target.value) || 1;
                      if (val > 10) val = 10;
                      if (val < 1) val = 1;
                      setCanvasQuota(val);
                    }}
                  />
                  <p className="text-xs text-orange-600/70 mt-1 font-semibold">
                    *Masing-masing akan bikin {canvasQuota} panel.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-orange-700 mb-1">Judul Buku Cerita</label>
                  <input
                    type="text"
                    placeholder={`Contoh: Petualangan Hebat`}
                    className="w-full bg-white border-2 border-orange-200 text-orange-800 font-bold rounded-xl px-3 py-3 outline-none focus:border-orange-400 transition-colors placeholder-orange-300"
                    value={bookTitle}
                    onChange={(e) => setBookTitle(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Button Footer */}
        <div className="p-6 md:p-8 bg-slate-50 border-t-2 border-slate-100">
          {isHost ? (
            <button
              disabled={!state.canStart}
              className={`group w-full flex items-center justify-center gap-2 font-black text-xl py-4 rounded-2xl shadow-[0_6px_0_rgb(0,0,0,0.15)] hover:translate-y-1 hover:shadow-[0_4px_0_rgb(0,0,0,0.15)] transition-all ${
                state.canStart 
                ? 'bg-emerald-400 hover:bg-emerald-500 text-white shadow-[0_6px_0_rgb(4,120,87)]' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-[0_6px_0_rgb(203,213,225)]'
              }`}
              onClick={async () => {
                socket.emit("room:start", { roomId: state.roomId, settings: { turnDuration, canvasQuota, bookTitle: bookTitle.trim() || `Cerita Ruang ${state.roomId}` } }, async (resp: any) => {
                  console.log("[CLIENT] room:start resp", resp);
                  if (!resp?.ok) {
                    await showAlert(`Gagal memulai: ${resp?.error ?? "Kesalahan tak terduga 😢"}`);
                  }
                });
              }}
            >
              {state.canStart ? <><Play className="fill-white" /> Mulai Cerita Sekarang!</> : <><Hourglass className="animate-pulse" /> Menunggu teman lain...</>}
            </button>
          ) : (
            <div className="w-full border-4 border-dashed border-sky-200 bg-sky-50 text-sky-600 font-black text-center p-4 rounded-2xl animate-pulse">
              Menunggu ketua (Host) memulai permainan...
            </div>
          )}
        </div>
      </div>
      
      {/* Return button */}
      <button 
        onClick={() => router.replace('/app')}
        className="mt-6 text-slate-400 font-bold hover:text-slate-600 transition-colors underline decoration-wavy decoration-slate-300"
      >
        Kembali ke Beranda
      </button>
    </main>
  );
}
