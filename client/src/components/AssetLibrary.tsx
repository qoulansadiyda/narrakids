"use client";

import { useMemo, useRef, useState } from "react";
import { ASSET_REGISTRY, AssetCategory } from "@/lib/assets/registry";
import { Image as ImageIcon, Smile, MessageSquare, Sticker, Music, Volume2, Pause, Play, Camera } from "lucide-react";

type Category = AssetCategory;

type Props = {
  onPick: (category: Category, index: number) => void;
  onUpload?: (file: File) => void;
  onPickAudio?: (category: "bgm" | "sfx", assetId: string, src: string) => void;
};

export default function AssetLibrary({ onPick, onUpload, onPickAudio }: Props) {
  const [active, setActive] = useState<Category>("background");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const items = useMemo(() => {
    return ASSET_REGISTRY[active] ?? [];
  }, [active]);

  const isAudioCategory = active === "bgm" || active === "sfx";

  const togglePreview = (src: string, id: string) => {
    if (playingId === id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(src);
      audio.volume = 0.5;
      audio.play().catch(() => {});
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(id);
    }
  };

  const getBtnClass = (cat: Category, colorStr: string, text: string, icon: string) => {
    const isActive = active === cat;
    return `text-left px-3 py-2 rounded-xl border-2 font-bold transition-all ${isActive ? `bg-${colorStr}-100 border-${colorStr}-300 text-${colorStr}-700 shadow-inner` : `bg-white border-transparent text-slate-500 hover:bg-slate-50 hover:border-slate-200`}`;
  };

  return (
    <div className="flex flex-col gap-4 font-nunito h-full">
      {/* Category buttons horizontally scrollable or wrapping */}
      <div className="flex flex-wrap gap-2 text-sm justify-start">
        <button className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl font-black transition-all border-2 flex-grow ${active === "background" ? "bg-amber-100 border-amber-300 text-amber-700 shadow-inner" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50 hover:border-slate-200 shadow-sm"}`} onClick={() => setActive("background")}>
          <ImageIcon className="w-4 h-4" /> Latar
        </button>
        <button className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl font-black transition-all border-2 flex-grow ${active === "character" ? "bg-emerald-100 border-emerald-300 text-emerald-700 shadow-inner" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50 hover:border-slate-200 shadow-sm"}`} onClick={() => setActive("character")}>
          <Smile className="w-4 h-4" /> Karakter
        </button>
        <button className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl font-black transition-all border-2 flex-grow ${active === "bubble_text" ? "bg-sky-100 border-sky-300 text-sky-700 shadow-inner" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50 hover:border-slate-200 shadow-sm"}`} onClick={() => setActive("bubble_text")}>
          <MessageSquare className="w-4 h-4" /> Teks
        </button>
        <button className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl font-black transition-all border-2 flex-grow ${active === "property" ? "bg-rose-100 border-rose-300 text-rose-700 shadow-inner" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50 hover:border-slate-200 shadow-sm"}`} onClick={() => setActive("property")}>
          <Sticker className="w-4 h-4" /> Stiker
        </button>
        
        <div className="w-full h-1 bg-slate-100 rounded-full my-1" />
        
        <button className={`inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl font-black transition-all border-2 flex-1 ${active === "bgm" ? "bg-purple-100 border-purple-300 text-purple-700 shadow-inner" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50 hover:border-slate-200 shadow-sm"}`} onClick={() => setActive("bgm")}>
          <Music className="w-4 h-4" /> BGM Musik
        </button>
        <button className={`inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl font-black transition-all border-2 flex-1 ${active === "sfx" ? "bg-blue-100 border-blue-300 text-blue-700 shadow-inner" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50 hover:border-slate-200 shadow-sm"}`} onClick={() => setActive("sfx")}>
          <Volume2 className="w-4 h-4" /> SFX Efek Suara
        </button>
      </div>

      {/* Grid thumbnails / Audio list */}
      <div className="border-4 border-slate-100 bg-slate-50 rounded-2xl p-3 flex-1 overflow-y-auto">
        <div className="text-xs text-slate-300 mb-2 capitalize">
          {active} assets ({items.length})
        </div>

        {items.length === 0 ? (
          <div className="text-xs text-slate-400 font-bold text-center py-6 italic border-2 border-dashed border-slate-200 rounded-xl">Belum ada aset di sini 🥲</div>
        ) : isAudioCategory ? (
          /* ── Audio list view ── */
          <div className="flex flex-col gap-2">
            {items.map((a) => (
              <div key={a.id} className="flex items-center gap-2 bg-white rounded-xl p-2 border-2 border-slate-100 shadow-sm hover:border-sky-200 transition-colors">
                <button
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-sm shrink-0 transition-colors font-black border-2 ${playingId === a.id ? "bg-rose-100 text-rose-500 border-rose-200" : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-sky-100 hover:text-sky-600 hover:border-sky-200"}`}
                  onClick={() => togglePreview(a.src, a.id)}
                  title="Mainkan Suara"
                >
                  {playingId === a.id ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </button>
                <span className="text-xs truncate flex-1 font-bold text-slate-600">{a.name}</span>
                <button
                  className={`text-[10px] px-3 py-1.5 rounded-lg border-b-2 font-black transition-colors shrink-0 uppercase tracking-wider active:translate-y-[2px] active:border-b-0 mb-[2px] ${active === "bgm" ? "bg-purple-400 hover:bg-purple-500 text-white border-purple-600 pb-2 mb-0" : "bg-blue-400 hover:bg-blue-500 text-white border-blue-600 pb-2 mb-0"}`}
                  onClick={() => {
                    onPickAudio?.(active as "bgm" | "sfx", a.id, a.src);
                  }}
                >
                  {active === "bgm" ? "+ Pilih BGM" : "+ Pilih SFX"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          /* ── Visual grid view ── */
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((a, idx) => (
              <button
                key={a.id ?? `${active}-${idx}`}
                className="bg-white border-2 border-slate-100 rounded-xl overflow-hidden hover:border-sky-300 shadow-sm hover:shadow-md transition-all active:scale-95 group flex flex-col items-center p-2"
                onClick={() => onPick(active, idx)}
                title={a.name}
              >
                {a.src ? (
                  <div className="w-full aspect-[4/3] flex items-center justify-center p-1 bg-slate-50 rounded-lg group-hover:bg-sky-50 transition-colors border border-transparent group-hover:border-sky-100">
                    <img
                      src={a.src}
                      alt={a.name}
                      className="w-full h-full object-contain drop-shadow-sm"
                    />
                  </div>
                ) : (
                  <div className="w-full aspect-[4/3] flex items-center justify-center bg-slate-50 rounded-lg text-slate-400 font-black font-serif text-[12px] italic group-hover:bg-sky-50 transition-colors border border-transparent group-hover:border-sky-100">
                    abc Teks
                  </div>
                )}
                <div className="text-[10px] pt-1.5 pb-0.5 truncate text-center font-bold text-slate-600 w-full group-hover:text-sky-600 transition-colors">
                  {a.name}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Upload Custom Image Option */}
      {onUpload && !isAudioCategory && (
        <div className="mt-2 text-center w-full">
          <label className="flex items-center justify-center w-full py-3 px-4 text-xs tracking-widest bg-orange-400 hover:bg-orange-500 text-white rounded-2xl cursor-pointer transition-all shadow-[0_4px_0_rgb(194,65,12)] active:translate-y-1 active:shadow-none font-black gap-2 uppercase">
            <Camera className="w-5 h-5" /> Upload Gambarmu
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onUpload(file);
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
