"use client";

import { useEffect, useRef, useState, forwardRef } from "react";
import { useParams, useRouter } from "next/navigation";
import HTMLFlipBook from "react-pageflip";
import { isAuthed, getToken } from "@/lib/auth";
import { useDialog } from "@/components/DialogProvider";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type BookPage = {
  id: string;
  pageNum: number;
  objects: any[];
  audioSrc?: string | null;
  bgmSrc?: string | null;
};

type Book = {
  id: string;
  title: string;
  roomId: string;
  createdAt: string;
  user: { username: string };
  pages: BookPage[];
  leaderboard?: string;
  bgmSrc?: string | null;
};

// --- EXPORT HELPERS ---
function downloadDataUrl(filename: string, dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function renderObjectsToDataUrl(opts: {
  objects: any[];
  nativeWidth?: number;
  nativeHeight?: number;
  multiplier?: number;
  format?: "png" | "jpeg";
}) {
  // Use exact native Editor size: 520 x 390 to prevent clipping or huge whitespaces!
  const { objects, nativeWidth = 520, nativeHeight = 390, multiplier = 1, format = "png" } = opts;
  const fabricModule = await import("fabric");
  const fabric: any = (fabricModule as any).fabric || (fabricModule as any).default || (fabricModule as any);

  const el = document.createElement("canvas");
  el.width = nativeWidth;
  el.height = nativeHeight;

  const c = new fabric.StaticCanvas(el, {
    width: nativeWidth,
    height: nativeHeight,
    backgroundColor: "#ffffff",
  });

  const util = fabric.util;
  const enlivened = await util.enlivenObjects(objects as any[]);
  enlivened.forEach((obj: any, i: number) => {
    if (obj) obj.data = (objects as any[])[i]?.data;
  });

  // Magic auto-normalize for legacy objects (books created on smaller/different canvases)
  let globalScale = 1;
  const bgObj = enlivened.find((o: any) => o && o.data && o.data.category === "background");
  
  if (bgObj) {
    const sw = bgObj.width! * bgObj.scaleX!;
    // Calculate global scale strictly based on width to map old coordinates to 520
    if (Math.abs(sw - nativeWidth) > 5) {
      globalScale = nativeWidth / sw;
    }

    // Force background to COVER the entire canvas (aspect-fill) and be perfectly centered
    const coverScale = Math.max(nativeWidth / bgObj.width!, nativeHeight / bgObj.height!);
    bgObj.set({
      originX: "center",
      originY: "center",
      scaleX: coverScale,
      scaleY: coverScale,
      left: nativeWidth / 2,
      top: nativeHeight / 2
    });
    bgObj.setCoords();
  }

  for (const obj of enlivened) {
    if (!obj) continue;
    const anyObj = obj as any;

    if (anyObj.data?.category !== "background" && globalScale !== 1) {
      anyObj.set({
        scaleX: (anyObj.scaleX || 1) * globalScale,
        scaleY: (anyObj.scaleY || 1) * globalScale,
        left: (anyObj.left || 0) * globalScale,
        top: (anyObj.top || 0) * globalScale,
      });
      anyObj.setCoords();
    }

    c.add(anyObj);

    if (anyObj.data?.category === "background") {
      if (typeof c.sendObjectToBack === "function") c.sendObjectToBack(anyObj);
      else if (typeof c.sendToBack === "function") c.sendToBack(anyObj);
    }
  }

  c.renderAll();

  const dataUrl = c.toDataURL({
    format,
    multiplier,
    quality: format === "jpeg" ? 0.92 : 1, // higher quality to prevent blur
  });

  c.dispose();
  return dataUrl as string;
}

async function exportStoryAsPdf(opts: {
  title: string;
  pages: { objects: any[] }[];
  w: number;
  h: number;
  showAlert: (msg: string) => Promise<void>;
}) {
  const { title, pages, w, h, showAlert } = opts;
  if (!pages || pages.length === 0) {
    await showAlert("Ups! Belum ada halaman yang bisa diunduh nih 😢");
    return;
  }

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: w >= h ? "landscape" : "portrait",
    unit: "px",
    format: [w, h],
  });

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const dataUrl = await renderObjectsToDataUrl({
      objects: p.objects ?? [],
      multiplier: 3, // 3x upscale for very crisp retina rendering 
      format: "jpeg" // use JPEG
    });
    if (i > 0) pdf.addPage([w, h], w >= h ? "landscape" : "portrait");
    pdf.addImage(dataUrl, "JPEG", 0, 0, w, h, undefined, "MEDIUM");
  }

  pdf.save(`${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-full-story.pdf`);
}

async function exportStoryAsPng(opts: {
  title: string;
  pages: { objects: any[] }[];
  showAlert: (msg: string) => Promise<void>;
}) {
  const { title, pages, showAlert } = opts;
  if (!pages || pages.length === 0) {
    await showAlert("Ups! Belum ada halaman yang bisa diunduh nih 😢");
    return;
  }

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const dataUrl = await renderObjectsToDataUrl({
      objects: p.objects ?? [],
      multiplier: 2,
      format: "png"
    });
    downloadDataUrl(`${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-page-${i + 1}.png`, dataUrl);
  }
}
// ----------------------


// PageCanvas renders objects onto a static canvas using Fabric.js
const PageCanvas = forwardRef<HTMLDivElement, { objects: any[]; width: number; height: number }>(
  ({ objects, width, height }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
      let isMounted = true;
      let staticCanvas: any = null;

      (async () => {
        const fabricModule = await import("fabric");
        const fabric: any =
          (fabricModule as any).fabric ||
          (fabricModule as any).default ||
          (fabricModule as any);

        if (!isMounted || !canvasRef.current) return;

        staticCanvas = new fabric.StaticCanvas(canvasRef.current, {
          backgroundColor: "#ffffff",
          width: 520,    // Editor Native Width
          height: 390,   // Editor Native Height
        });

        const util = fabric.util;
        try {
          const enlivened = await util.enlivenObjects(objects as any[]);
          enlivened.forEach((obj: any, i: number) => {
            if (obj) obj.data = (objects as any[])[i]?.data;
          });
          
          // Magic auto-normalize for legacy objects
          let globalScale = 1;
          const bgObj = enlivened.find((o: any) => o && o.data && o.data.category === "background");
          
          if (bgObj) {
            const sw = bgObj.width! * bgObj.scaleX!;
            if (Math.abs(sw - 520) > 5) {
              globalScale = 520 / sw;
            }

            // Force background to COVER the entire canvas (aspect-fill) and be perfectly centered
            const coverScale = Math.max(520 / bgObj.width!, 390 / bgObj.height!);
            bgObj.set({
              originX: "center",
              originY: "center",
              scaleX: coverScale,
              scaleY: coverScale,
              left: 520 / 2,
              top: 390 / 2
            });
            bgObj.setCoords();
          }

          for (const obj of enlivened) {
            if (!obj) continue;
            
            if (obj.data?.category !== "background" && globalScale !== 1) {
              obj.set({
                scaleX: (obj.scaleX || 1) * globalScale,
                scaleY: (obj.scaleY || 1) * globalScale,
                left: (obj.left || 0) * globalScale,
                top: (obj.top || 0) * globalScale,
              });
              obj.setCoords();
            }

            staticCanvas.add(obj);
            if (obj.data?.category === "background") {
              if (typeof staticCanvas.sendObjectToBack === "function")
                staticCanvas.sendObjectToBack(obj);
              else if (typeof staticCanvas.sendToBack === "function")
                staticCanvas.sendToBack(obj);
            }
          }
        } catch (e) {
          console.error("Failed to enliven page objects", e);
        }

        // Apply CSS scaling to fit the wrapper
        if (canvasRef.current) {
          const scaleX = width / 520;
          const scaleY = height / 390;
          canvasRef.current.style.transformOrigin = "top left";
          canvasRef.current.style.transform = `scale(${scaleX}, ${scaleY})`;
        }
        staticCanvas.requestRenderAll();
      })();

      return () => {
        isMounted = false;
        if (staticCanvas) staticCanvas.dispose();
      };
    }, [objects, width, height]);

    return (
      <div ref={ref} style={{ width, height, overflow: "hidden", background: "#fff" }}>
        <canvas ref={canvasRef} />
      </div>
    );
  }
);
PageCanvas.displayName = "PageCanvas";

// Each page needs to be wrapped in a forwardRef div for react-pageflip
const FlipPage = forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  ({ children }, ref) => {
    return (
      <div ref={ref} style={{ background: "#fff" }}>
        {children}
      </div>
    );
  }
);
FlipPage.displayName = "FlipPage";

export default function BookViewerPage() {
  const { bookId } = useParams() as { bookId: string };
  const router = useRouter();
  const { showAlert } = useDialog();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [isBgmPlaying, setIsBgmPlaying] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const flipBookRef = useRef<any>(null);

  // Audio Refs
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const pageFlipAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeSfxRef = useRef<HTMLAudioElement[]>([]);  // Track ALL active SFX for cleanup

  useEffect(() => {
    if (!isAuthed()) {
      router.replace("/login");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API}/books/${bookId}`);
        const data = await res.json();
        if (data.ok) setBook(data.book);
      } catch (e) {
        console.error("Failed to load book", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [bookId, router]);

  // Helper to evaluate and play BGM for a given page index
  const evaluateBgm = (pageIndex: number) => {
    if (!book) return;
    const targetBgm = book.pages[pageIndex]?.bgmSrc || book.pages[pageIndex + 1]?.bgmSrc;
    
    // If there is a target BGM and it's DIFFERENT from currently playing track
    if (targetBgm && targetBgm !== bgmAudioRef.current?.src) {
      if (bgmAudioRef.current) {
        bgmAudioRef.current.pause();
      }
      const audio = new Audio(targetBgm);
      audio.loop = true;
      audio.volume = 0.4;
      if (isBgmPlaying) {
        audio.play().catch(e => console.warn("Failed to play bgm", e));
      }
      bgmAudioRef.current = audio;
    }
    // If targetBgm is the SAME, do nothing (seamless continuation)
    // If targetBgm is null/empty, do nothing (seamless continuation of previous track)
  };

  // Auto-start initial Audio once user interaction allows it
  useEffect(() => {
    if (!book || !hasStarted) return;
    
    // Evaluate page 0 BGM on initial start
    evaluateBgm(0);
    
    // Evaluate page 0 & 1 SFX on initial start (tracked in activeSfxRef)
    const leftSfx = book.pages[0]?.audioSrc;
    const rightSfx = book.pages[1]?.audioSrc;
    if (leftSfx) {
      const a = new Audio(leftSfx);
      a.volume = 0.8;
      a.play().catch(e => console.warn(e));
      a.onended = () => { activeSfxRef.current = activeSfxRef.current.filter(x => x !== a); };
      activeSfxRef.current.push(a);
    }
    if (rightSfx) {
      const a = new Audio(rightSfx);
      a.volume = 0.8;
      a.play().catch(e => console.warn(e));
      a.onended = () => { activeSfxRef.current = activeSfxRef.current.filter(x => x !== a); };
      activeSfxRef.current.push(a);
    }

    return () => {
      if (bgmAudioRef.current) {
        bgmAudioRef.current.pause();
        bgmAudioRef.current = null;
      }
      // Stop ALL tracked SFX
      activeSfxRef.current.forEach(a => { a.pause(); a.currentTime = 0; });
      activeSfxRef.current = [];
    };
  }, [book, hasStarted]);

  // Restart BGM if unmuted
  useEffect(() => {
    if (isBgmPlaying && bgmAudioRef.current && bgmAudioRef.current.paused) {
      bgmAudioRef.current.play().catch(e => console.warn(e));
    } else if (!isBgmPlaying && bgmAudioRef.current && !bgmAudioRef.current.paused) {
      bgmAudioRef.current.pause();
    }
  }, [isBgmPlaying]);

  // CRITICAL: Stop all audio when component unmounts (navigating away)
  useEffect(() => {
    return () => {
      if (bgmAudioRef.current) {
        bgmAudioRef.current.pause();
        bgmAudioRef.current.currentTime = 0;
        bgmAudioRef.current = null;
      }
      if (pageFlipAudioRef.current) {
        pageFlipAudioRef.current.pause();
        pageFlipAudioRef.current = null;
      }
      // Stop ALL tracked SFX
      activeSfxRef.current.forEach(a => { a.pause(); a.currentTime = 0; });
      activeSfxRef.current = [];
    };
  }, []);

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-sky-50 text-sky-500 font-nunito">
        <div className="text-2xl font-black animate-pulse flex items-center gap-3">
          📖 <span className="drop-shadow-sm">Sedang Membuka Buku...</span>
        </div>
      </main>
    );
  }

  if (!book) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-sky-50 text-slate-600 font-nunito gap-6">
        <div className="text-6xl mb-4">😢</div>
        <div className="text-2xl font-black text-rose-500">Buku tidak ditemukan</div>
        <button 
          className="font-bold text-sky-500 hover:text-sky-600 transition-colors underline decoration-wavy decoration-sky-300" 
          onClick={() => router.push("/app")}
        >
          Kembali ke Beranda yuk!
        </button>
      </main>
    );
  }

  if (!hasStarted) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-sky-100 text-slate-800 px-6 font-nunito relative overflow-hidden">
        {/* Floating Background Effects */}
        <div className="absolute top-10 left-10 text-6xl opacity-20 -rotate-12 animate-bounce">📚</div>
        <div className="absolute bottom-20 right-10 text-6xl opacity-20 rotate-12 animate-pulse">✨</div>
        <div className="absolute top-1/4 right-1/4 text-4xl opacity-20 animate-spin-slow">🌟</div>

        <div className="text-center w-full max-w-lg bg-white/60 p-8 rounded-3xl backdrop-blur-sm border-4 border-white shadow-xl relative z-10">
          <div className="text-7xl mb-6">📖</div>
          <h1 className="text-4xl font-black mb-4 text-sky-600 drop-shadow-sm">{book.title}</h1>
          <div className="bg-sky-50 inline-block px-4 py-2 rounded-full border-2 border-sky-200 mb-8">
            <span className="text-slate-500 font-bold uppercase tracking-wider text-xs block mb-1">Karya Hebat Dari:</span>
            <span className="text-sky-700 font-black">
              {(() => {
                try {
                  const lb = book.leaderboard ? JSON.parse(book.leaderboard) : [];
                  if (lb.length > 0) return lb.map((p: any) => p.username || 'Anonim').join(', ');
                } catch {}
                return book.user.username;
              })()}
            </span>
          </div>
          
          <button 
            onClick={() => setHasStarted(true)}
            className="w-full py-4 bg-emerald-400 hover:bg-emerald-500 text-white rounded-2xl text-xl font-black shadow-[0_6px_0_rgb(4,120,87)] hover:translate-y-1 hover:shadow-[0_4px_0_rgb(4,120,87)] transition-all"
          >
            ▶️ Mulai Baca Penuh Keajaiban!
          </button>
          
          <p className="mt-8 text-sm font-semibold text-slate-500 bg-white/50 py-3 rounded-xl border border-white">
            🎧 Tips: Pakai *headphone* atau earphone biar suaranya makin seru!
          </p>
        </div>
      </main>
    );
  }

  // We set FlipBook exactly to native Editor size to ensure 1:1 pixel perfection.
  // The FlipBook will automatically scale down via 'autoSize=true' or 'minWidth/maxWidth' if the window is smaller.
  const pageW = 520;
  const pageH = 390;

  // --- AUDIO LOGIC ---
  const handleToggleBgm = () => {
    setIsBgmPlaying(prev => !prev);
  };

  const handleFlip = (e: { data: number }) => {
    const pageIndex = e.data;
    setCurrentPage(pageIndex);

    // Play Page-Turn SFX
    try {
      if (!pageFlipAudioRef.current) {
        pageFlipAudioRef.current = new Audio("/assets/audio/sfx-page-turn.mp3");
        pageFlipAudioRef.current.volume = 0.5;
      }
      pageFlipAudioRef.current.currentTime = 0;
      pageFlipAudioRef.current.play().catch(() => {
        // If local file fails, silently ignore — placeholder may be invalid
      });
    } catch {
      // Ignore
    }

    // Stop all currently playing page SFX
    activeSfxRef.current.forEach(a => { a.pause(); a.currentTime = 0; });
    activeSfxRef.current = [];

    // Evaluate continuous BGM
    evaluateBgm(pageIndex);

    // Play Page-specific SFX (both left and right pages)
    const leftPageAudio = book.pages[pageIndex]?.audioSrc;
    const rightPageAudio = book.pages[pageIndex + 1]?.audioSrc;
    
    if (leftPageAudio) {
      const sfx = new Audio(leftPageAudio);
      sfx.volume = 0.8;
      sfx.play().catch(e => console.warn(e));
      sfx.onended = () => { activeSfxRef.current = activeSfxRef.current.filter(x => x !== sfx); };
      activeSfxRef.current.push(sfx);
    }
    if (rightPageAudio) {
      const sfx = new Audio(rightPageAudio);
      sfx.volume = 0.8;
      sfx.play().catch(e => console.warn(e));
      sfx.onended = () => { activeSfxRef.current = activeSfxRef.current.filter(x => x !== sfx); };
      activeSfxRef.current.push(sfx);
    }
  };
  // -------------------

  // --- EXPORT LOGIC ---
  const handleExport = async (type: "png" | "pdf") => {
    setIsExporting(true);
    try {
      if (type === "png") {
        await exportStoryAsPng({ title: book.title, pages: book.pages, showAlert });
      } else {
        // PDF uses internal mapping w/ native aspect 520x390 for pages
        await exportStoryAsPdf({ title: book.title, pages: book.pages, w: 520, h: 390, showAlert });
      }
    } catch (e) {
      console.error(e);
      await showAlert("Huhu.. Gagal melakukan unduhan buku karya-mu 😢");
    } finally {
      setIsExporting(false);
    }
  };
  // --------------------

  const totalPages = book.pages.length;
  let parsedLeaderboard = [];
  try {
    if (book.leaderboard) {
      parsedLeaderboard = JSON.parse(book.leaderboard);
    }
  } catch (err) {
    console.error("Failed to parse leaderboard JSON", err);
  }

  return (
    <main className="min-h-screen bg-sky-200 text-slate-800 flex flex-col items-center py-6 px-4 font-nunito relative overflow-hidden">
      {/* Immersive Background Clouds */}
      <div className="absolute top-0 left-0 w-full h-[300px] bg-sky-100 rounded-b-[100px] -z-10 shadow-sm pointer-events-none opacity-80" />
      <div className="absolute top-20 left-10 text-white opacity-40 text-8xl pointer-events-none">☁️</div>
      <div className="absolute top-10 right-20 text-white opacity-40 text-6xl pointer-events-none">☁️</div>

      {/* Header Info */}
      <div className="mb-6 text-center select-none z-10 relative mt-4">
        <h1 className="text-3xl font-black mb-2 text-sky-800 drop-shadow-sm px-4 py-1 bg-white/50 rounded-full inline-block backdrop-blur-sm border-2 border-white">{book.title}</h1>
        <p className="text-slate-600 font-bold bg-white/80 px-4 py-2 rounded-full text-sm inline-block shadow-sm">
          🌟 Karya: {(() => {
            try {
              const lb = book.leaderboard ? JSON.parse(book.leaderboard) : [];
              if (lb.length > 0) return lb.map((p: any) => p.username || 'Anonim').join(', ');
            } catch {}
            return book.user.username;
          })()} <span className="text-sky-400 mx-2">|</span> {totalPages} Halaman
        </p>
      </div>

      {/* The Magic Desk Setting */}
      <div className="relative p-6 pt-8 pb-10 bg-orange-100/50 backdrop-blur-md rounded-[3rem] shadow-2xl border-4 border-white/60 mx-auto z-10">
        <div className="absolute -top-6 -left-6 text-6xl rotate-12 opacity-80 z-20 pointer-events-none">✏️</div>
        
        {/* Book Viewer */}
        <div className="relative shadow-[0_20px_40px_rgba(0,0,0,0.15)] rounded-lg overflow-hidden border-8 border-slate-700/10" style={{ background: "#475569" }}>
          {/* @ts-ignore - react-pageflip types */}
          <HTMLFlipBook
            ref={flipBookRef}
            width={pageW}
            height={pageH}
            size="fixed"
            minWidth={300}
            maxWidth={600}
            minHeight={225}
            maxHeight={450}
            showCover={false}
            mobileScrollSupport={true}
            className="book-flip"
            startPage={0}
            drawShadow={true}
            flippingTime={600}
            usePortrait={false}
            startZIndex={0}
            autoSize={false}
            maxShadowOpacity={0.6}
            showPageCorners={true}
            disableFlipByClick={false}
            useMouseEvents={true}
            swipeDistance={30}
            clickEventForward={false}
            style={{}}
            onFlip={handleFlip}
          >
            {book.pages.map((page) => (
              <FlipPage key={page.id}>
                <PageCanvas
                  objects={page.objects}
                  width={pageW}
                  height={pageH}
                />
              </FlipPage>
            ))}
          </HTMLFlipBook>
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="mt-8 flex items-center justify-center gap-4 bg-white px-6 py-3 rounded-full shadow-lg border-2 border-sky-100 z-10 w-full max-w-lg">
        <button
          className="text-sky-500 hover:text-sky-700 font-black uppercase text-xs sm:text-sm active:scale-95 transition-transform px-2"
          onClick={() => flipBookRef.current?.pageFlip()?.flip(0)}
        >
          &lt; AWAL
        </button>

        <div className="flex items-center gap-4 bg-sky-50 px-4 py-2 rounded-full border border-sky-100 flex-1 justify-center">
          <button
            className="w-10 h-10 bg-sky-400 hover:bg-sky-500 text-white rounded-full flex items-center justify-center shadow-[0_4px_0_rgb(2,132,199)] active:translate-y-1 active:shadow-none transition-all font-black"
            onClick={() => flipBookRef.current?.pageFlip()?.flipPrev()}
            title="Halaman Sebelumnya"
          >
            ◀
          </button>

          <span className="text-sky-800 text-sm font-black mx-2 min-w-[3rem] text-center font-mono">
            {currentPage + 1} / {totalPages}
          </span>

          <button
             className="w-10 h-10 bg-sky-400 hover:bg-sky-500 text-white rounded-full flex items-center justify-center shadow-[0_4px_0_rgb(2,132,199)] active:translate-y-1 active:shadow-none transition-all font-black"
            onClick={() => flipBookRef.current?.pageFlip()?.flipNext()}
            title="Halaman Selanjutnya"
          >
            ▶
          </button>
        </div>

        <button
          className="text-sky-500 hover:text-sky-700 font-black uppercase text-xs sm:text-sm active:scale-95 transition-transform px-2"
          onClick={() =>
            flipBookRef.current?.pageFlip()?.flip(totalPages - 1)
          }
        >
          AKHIR &gt;
        </button>
      </div>

      {/* Book Actions (Audio / Exports) */}
      <div className="mt-6 flex flex-wrap justify-center gap-3 items-center z-10">
        <button
          onClick={handleToggleBgm}
          className={`px-5 py-3 rounded-2xl font-black flex items-center gap-2 transition-all shadow-sm border-2 active:scale-95 ${
            isBgmPlaying 
            ? "bg-purple-100 border-purple-200 text-purple-600 hover:bg-purple-200 shadow-[0_4px_0_rgb(216,180,254)]" 
            : "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200 shadow-[0_4px_0_rgb(226,232,240)]"
          }`}
        >
          {isBgmPlaying ? "🔊 Matikan Musik" : "🔈 Nyalakan Musik"}
        </button>

        <button
          disabled={isExporting}
          onClick={() => handleExport("pdf")}
          className="px-5 py-3 rounded-2xl bg-orange-400 text-white font-black shadow-[0_4px_0_rgb(194,65,12)] hover:bg-orange-500 transition-all border-none active:translate-y-1 active:shadow-none disabled:opacity-50"
        >
          {isExporting ? "Memproses..." : "⬇️ Download PDF"}
        </button>
        <button
          disabled={isExporting}
          onClick={() => handleExport("png")}
          className="px-5 py-3 rounded-2xl bg-emerald-400 text-white font-black shadow-[0_4px_0_rgb(4,120,87)] hover:bg-emerald-500 transition-all border-none active:translate-y-1 active:shadow-none disabled:opacity-50"
        >
          {isExporting ? "Memproses..." : "⬇️ Download PNG"}
        </button>
      </div>

      {/* Leaderboard Section */}
      {parsedLeaderboard && parsedLeaderboard.length > 0 && (
        <div className="mt-12 w-full max-w-sm bg-white rounded-[2rem] p-6 sm:p-8 border-4 border-sky-100 shadow-xl z-10">
          <h2 className="text-xl sm:text-2xl font-black mb-6 text-center text-sky-500 drop-shadow-sm border-b-2 border-sky-50 pb-4">
            🏆 Bintang Kelas NarraKids
          </h2>
          <div className="space-y-4">
            {parsedLeaderboard.map((player: any, idx: number) => (
              <div key={player.sid || idx} className="flex items-center justify-between bg-sky-50/50 p-4 rounded-2xl border-2 border-sky-100">
                <div className="flex items-center gap-4">
                  <span className={`flex items-center justify-center w-8 h-8 rounded-full font-black shadow-sm ${idx === 0 ? 'bg-yellow-400 text-white shadow-yellow-200' : idx === 1 ? 'bg-slate-300 text-white shadow-slate-200' : idx === 2 ? 'bg-orange-400 text-white shadow-orange-200' : 'bg-white text-slate-400 border-2 border-slate-100'}`}>
                    {idx + 1}
                  </span>
                  <span className="font-bold text-slate-700 text-sm sm:text-base">{player.username || player.sid.slice(0, 4)}</span>
                </div>
                <div className="flex items-center gap-2 bg-yellow-100 px-3 py-1 rounded-full border border-yellow-200">
                  <span className="text-lg">⭐</span>
                  <span className="font-mono text-sm sm:text-base text-yellow-600 font-black">{player.total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Back button */}
      <button
        className="mt-12 mb-8 text-sky-600 font-bold hover:text-sky-800 transition-colors underline decoration-wavy decoration-sky-300 z-10"
        onClick={() => {
          if (bgmAudioRef.current) { bgmAudioRef.current.pause(); bgmAudioRef.current = null; }
          if (pageFlipAudioRef.current) { pageFlipAudioRef.current.pause(); pageFlipAudioRef.current = null; }
          activeSfxRef.current.forEach(a => { a.pause(); a.currentTime = 0; });
          activeSfxRef.current = [];
          router.push("/app");
        }}
      >
        ← Kembali ke Halaman Utama
      </button>
    </main>
  );
}
