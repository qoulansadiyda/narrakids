import fs from 'fs';
// Minimal valid MP3 frame (silence)
const b = Buffer.from('//uQxAAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV', 'base64');
const files = ['bgm-adventure','bgm-calm','bgm-happy','sfx-splash','sfx-birds','sfx-thunder','sfx-laugh','sfx-page-turn'];
files.forEach(f => fs.writeFileSync('client/public/assets/audio/' + f + '.mp3', b));
console.log('Created', files.length, 'placeholder audio files');
