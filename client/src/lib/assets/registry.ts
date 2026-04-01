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
    { id: "ch-buaya", name: "Buaya", src: "/assets/character/ch-buaya.png", category: "character", defaultScale: 0.6 },
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
