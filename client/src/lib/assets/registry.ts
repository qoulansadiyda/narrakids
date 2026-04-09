export type AssetCategory = "background" | "character" | "property" | "bubble_text" | "bgm" | "sfx";

export type AssetItem = {
  id: string;
  name: string;
  src: string; // path di /public
  category: AssetCategory;
  defaultScale?: number; // opsional
};

export const ASSET_REGISTRY: Record<AssetCategory, AssetItem[]> = {
  background: [
    { id: "bg-tepisungai", name: "Tepi Sungai", src: "/assets/background/bg-tepisungai.png", category: "background" },
    { id: "bg-hutan", name: "Hutan", src: "/assets/background/bg-hutan.png", category: "background" },
    { id: "bg-sungai", name: "Sungai", src: "/assets/background/bg-sungai.png", category: "background" },
  ],
  character: [
    { id: "ch-kancil", name: "Kancil", src: "/assets/character/ch-kancil.png", category: "character", defaultScale: 0.6 },
    { id: "ch-buaya1", name: "Buaya 1", src: "/assets/character/ch-buaya1.png", category: "character", defaultScale: 0.6 },
    { id: "ch-buaya2", name: "Buaya 2", src: "/assets/character/ch-buaya2.png", category: "character", defaultScale: 0.6 },
    { id: "ch-buaya3", name: "Buaya 3", src: "/assets/character/ch-buaya3.png", category: "character", defaultScale: 0.6 },
    { id: "ch-buaya4", name: "Buaya 4", src: "/assets/character/ch-buaya4.png", category: "character", defaultScale: 0.6 },
    { id: "ch-buaya5", name: "Buaya 5", src: "/assets/character/ch-buaya5.png", category: "character", defaultScale: 0.6 },
    { id: "ch-pak tani", name: "Pak Tani", src: "/assets/character/ch-pak tani.png", category: "character", defaultScale: 0.6 },
    { id: "ch-singa", name: "Singa", src: "/assets/character/ch-singa.png", category: "character", defaultScale: 0.6 },
    { id: "ch-harimau", name: "Harimau", src: "/assets/character/ch-harimau.png", category: "character", defaultScale: 0.6 },
    { id: "ch-semut", name: "Semut", src: "/assets/character/ch-semut.png", category: "character", defaultScale: 0.6 },
    { id: "ch-kelinci", name: "Kelinci", src: "/assets/character/ch-kelinci.png", category: "character", defaultScale: 0.6 },
    { id: "ch-monyet", name: "Monyet", src: "/assets/character/ch-monyet.png", category: "character", defaultScale: 0.6 },
    { id: "ch-gajah", name: "Gajah", src: "/assets/character/ch-gajah.png", category: "character", defaultScale: 0.6 },
    { id: "ch-kerbau", name: "Kerbau", src: "/assets/character/ch-kerbau.png", category: "character", defaultScale: 0.6 },
    { id: "ch-siput", name: "Siput", src: "/assets/character/ch-siput.png", category: "character", defaultScale: 0.6 },
    { id: "ch-burung", name: "Burung", src: "/assets/character/ch-burung.png", category: "character", defaultScale: 0.6 },
    { id: "ch-ular", name: "Ular", src: "/assets/character/ch-ular.png", category: "character", defaultScale: 0.6 },
  ],
  property: [
    { id: "pr-batu", name: "Batu", src: "/assets/property/pr-batu.png", category: "property", defaultScale: 0.7 },
    { id: "pr-pohon", name: "Pohon", src: "/assets/property/pr-pohon.png", category: "property", defaultScale: 0.7 },
  ],
  bubble_text: [
    { id: "bb-textonly", name: "Text Only", src: "", category: "bubble_text", defaultScale: 1 },
    { id: "bb-speech-1", name: "Pixel", src: "/assets/bubble/bubble1_pixel.png", category: "bubble_text", defaultScale: 0.9 },
    { id: "bb-speech-2", name: "Cloud", src: "/assets/bubble/bubble2_cloud.png", category: "bubble_text", defaultScale: 0.9 },
  ],
  bgm: [
    { id: "bgm-adventure", name: "Adventure", src: "/assets/audio/bgm-adventure.mp3", category: "bgm" },
    { id: "bgm-calm", name: "Calm", src: "/assets/audio/bgm-calm.mp3", category: "bgm" },
    { id: "bgm-happy", name: "Happy", src: "/assets/audio/bgm-happy.mp3", category: "bgm" },
  ],
  sfx: [
    { id: "sfx-splash", name: "Splash", src: "/assets/audio/sfx-splash.mp3", category: "sfx" },
    { id: "sfx-birds", name: "Birds", src: "/assets/audio/sfx-birds.mp3", category: "sfx" },
    { id: "sfx-thunder", name: "Thunder", src: "/assets/audio/sfx-thunder.mp3", category: "sfx" },
    { id: "sfx-laugh", name: "Laugh", src: "/assets/audio/sfx-laugh.mp3", category: "sfx" },
  ],
};
