/**
 * Anime Legends — declarative catalog (27 collections × 6 elements = 162 named elements).
 * Visuals are ORIGINAL (CSS shapes, gradients and particles drawn by shared renderers from `motif`/`palette`);
 * no official art, logos or character drawings. Every element of a collection has its own name and can be used on
 * its own or mixed with elements of other collections.
 *
 * Stored ids: profile fields keep `al:<collectionId>` (bannerPreset / avatarDecoration / profileEffect /
 * profileTheme), servers keep `legend: <collectionId>`, Spaces keep `ambiance: <collectionId>`.
 */
export type AlMotif =
  | 'orbit' | 'singularity' | 'crystal' | 'impact' | 'lightning' | 'shadow' | 'throne' | 'shrine' | 'palace'
  | 'waves' | 'flame' | 'mountain' | 'petals' | 'moon' | 'sun' | 'city' | 'burst' | 'ice' | 'dual';
export type AlParticle = 'orbit' | 'converge' | 'shards' | 'shock' | 'bolts' | 'smoke' | 'embers' | 'petals' | 'droplets' | 'sparks' | 'snow' | 'rays' | 'glyphs';

export interface AlCollection {
  id: string;
  n: number;
  universe: 'jjk' | 'ds' | 'mha';
  character: string;
  title: string;
  /** [primary, secondary, deep background] */
  palette: [string, string, string];
  motif: AlMotif;
  particle: AlParticle;
  aesthetic: string;
  names: { banner: string; frame: string; effect: string; theme: string; server: string; spaces: string };
}

export const AL_UNIVERSES = { jjk: 'Jujutsu Kaisen', ds: 'Demon Slayer', mha: 'My Hero Academia' } as const;
export const AL_CHARACTERS: Record<string, { name: string; universe: AlCollection['universe'] }> = {
  gojo: { name: 'Satoru Gojo', universe: 'jjk' },
  yuji: { name: 'Yuji Itadori', universe: 'jjk' },
  sukuna: { name: 'Ryomen Sukuna', universe: 'jjk' },
  tanjiro: { name: 'Tanjiro Kamado', universe: 'ds' },
  nezuko: { name: 'Nezuko Kamado', universe: 'ds' },
  rengoku: { name: 'Kyojuro Rengoku', universe: 'ds' },
  deku: { name: 'Izuku Midoriya — Deku', universe: 'mha' },
  bakugo: { name: 'Katsuki Bakugo', universe: 'mha' },
  todoroki: { name: 'Shoto Todoroki', universe: 'mha' },
};

const c = (
  n: number, id: string, character: string, title: string, palette: [string, string, string], motif: AlMotif, particle: AlParticle, aesthetic: string,
  banner: string, frame: string, effect: string, theme: string, server: string, spaces: string,
): AlCollection => ({ id, n, universe: AL_CHARACTERS[character]!.universe, character, title, palette, motif, particle, aesthetic, names: { banner, frame, effect, theme, server, spaces } });

export const AL_COLLECTIONS: AlCollection[] = [
  // ---------------- Jujutsu Kaisen ----------------
  c(1, 'gojo-infinity', 'gojo', 'INFINITY', ['#4fc3ff', '#e8f6ff', '#050a24'], 'orbit', 'orbit', 'Azul espacial, branco e órbitas luminosas', 'Infinite Horizon', 'Six Eyes Orbit', 'Limitless Presence', 'Infinity Domain', 'Infinite Sanctuary', 'Infinity Lounge'),
  c(2, 'gojo-hollow-purple', 'gojo', 'HOLLOW PURPLE', ['#a855f7', '#f0abfc', '#0d0420'], 'singularity', 'converge', 'Violeta intenso e energia concentrada', 'Purple Singularity', 'Void Collision', 'Singularity Burst', 'Violet Infinity', 'Purple Dominion', 'Void Chamber'),
  c(3, 'gojo-six-eyes', 'gojo', 'SIX EYES AWAKENING', ['#7dd3fc', '#ffffff', '#071a33'], 'crystal', 'shards', 'Branco, azul elétrico e reflexos cristalinos', 'Celestial Awakening', 'Azure Vision', 'Awakened Perception', 'Celestial Limitless', 'Six Eyes Realm', 'Awakened Sky'),
  c(4, 'yuji-cursed-fist', 'yuji', 'CURSED FIST', ['#ef4444', '#fca5a5', '#120507'], 'impact', 'shock', 'Vermelho e preto, impactos luminosos e energia pulsante', 'Divergent Impact', 'Crimson Strike', 'Divergent Flash', 'Crimson Fighter', 'Fighter’s Domain', 'Combat Lounge'),
  c(5, 'yuji-black-flash', 'yuji', 'BLACK FLASH', ['#ff1f3d', '#111111', '#050203'], 'lightning', 'bolts', 'Relâmpagos vermelhos e negros, pulsos rápidos e contraste intenso', 'Black Flash Impact', 'Critical Strike', 'Black Flash Awakening', 'Critical Energy', 'Flash Arena', 'Critical Zone'),
  c(6, 'yuji-inner-darkness', 'yuji', 'INNER DARKNESS', ['#7f1d3a', '#c084fc', '#0a0408'], 'shadow', 'smoke', 'Sombras, vinho profundo e dualidade visual', 'Inner Curse', 'Dark Vessel', 'Dual Soul', 'Shadow Vessel', 'Cursed Duality', 'Dark Reflection'),
  c(7, 'sukuna-king', 'sukuna', 'KING OF CURSES', ['#dc143c', '#1a0a0a', '#070203'], 'throne', 'embers', 'Carmesim, preto e atmosfera imperial sombria', 'Cursed Throne', 'Demonic Crown', 'King’s Presence', 'Crimson Tyrant', 'Cursed Kingdom', 'Demon Throne'),
  c(8, 'sukuna-shrine', 'sukuna', 'MALEVOLENT SHRINE', ['#ff3b30', '#f5c16c', '#100405'], 'shrine', 'glyphs', 'Símbolos ornamentais, arquitetura ritualística e energia vermelha', 'Shrine Awakening', 'Ritual Seal', 'Shrine Expansion', 'Sacred Malevolence', 'Malevolent Sanctuary', 'Forbidden Shrine'),
  c(9, 'sukuna-emperor', 'sukuna', 'CURSED EMPEROR', ['#b91c1c', '#fbbf24', '#0a0204'], 'palace', 'rays', 'Palácio sombrio, energia rubra e iluminação imperial', 'Emperor’s Wrath', 'Imperial Curse', 'Royal Destruction', 'Dark Sovereign', 'Emperor’s Dominion', 'Cursed Palace'),
  // ---------------- Demon Slayer ----------------
  c(10, 'tanjiro-water', 'tanjiro', 'WATER BREATHING', ['#22d3ee', '#2dd4bf', '#031a24'], 'waves', 'droplets', 'Ondas fluidas, água estilizada e iluminação azul-esverdeada', 'Flowing Serenity', 'Water Guardian', 'Water Dance', 'Ocean Resolve', 'Water Sanctuary', 'Water Garden'),
  c(11, 'tanjiro-hinokami', 'tanjiro', 'HINOKAMI KAGURA', ['#f97316', '#fde047', '#1a0802'], 'flame', 'embers', 'Fogo artístico, dourado e movimentos circulares', 'Sunfire Dance', 'Solar Blade', 'Dance of Flames', 'Sun Breathing', 'Sunfire Temple', 'Flame Pavilion'),
  c(12, 'tanjiro-resolve', 'tanjiro', 'DEMON SLAYER RESOLVE', ['#16a34a', '#a3e635', '#04140a'], 'mountain', 'sparks', 'Paisagens orientais, verde profundo e reflexos heroicos', 'Unbroken Spirit', 'Guardian Resolve', 'Heroic Awakening', 'Emerald Determination', 'Slayer’s Haven', 'Mountain Retreat'),
  c(13, 'nezuko-sakura', 'nezuko', 'SAKURA DREAM', ['#f9a8d4', '#fce7f3', '#2a0c1c'], 'petals', 'petals', 'Flores, pétalas animadas e tons rosados', 'Sakura Blossom', 'Pink Blossom', 'Sakura Arrival', 'Cherry Dream', 'Sakura Sanctuary', 'Blossom Room'),
  c(14, 'nezuko-blood-art', 'nezuko', 'BLOOD DEMON ART', ['#ec4899', '#fb7185', '#1f0510'], 'flame', 'petals', 'Chamas rosadas, flores luminosas e energia intensa', 'Crimson Petals', 'Burning Blossom', 'Blood Flame', 'Demonic Rose', 'Crimson Garden', 'Flame Sakura'),
  c(15, 'nezuko-awakened', 'nezuko', 'AWAKENED SPIRIT', ['#c084fc', '#f9a8d4', '#100a26'], 'moon', 'petals', 'Luar, violeta e iluminação floral', 'Moonlit Awakening', 'Awakened Bloom', 'Spirit Unleashed', 'Moon Blossom', 'Moonlit Garden', 'Lunar Sakura'),
  c(16, 'rengoku-hashira', 'rengoku', 'FLAME HASHIRA', ['#f59e0b', '#ef4444', '#1c0a02'], 'flame', 'embers', 'Chamas douradas e energia heroica', 'Blazing Spirit', 'Flame Guardian', 'Burning Soul', 'Golden Flame', 'Flame Sanctuary', 'Golden Dojo'),
  c(17, 'rengoku-ablaze', 'rengoku', 'SET YOUR HEART ABLAZE', ['#dc2626', '#fbbf24', '#1a0404'], 'burst', 'embers', 'Fogo nobre, honra e reflexos avermelhados', 'Heart of Fire', 'Burning Honor', 'Unbreakable Flame', 'Honor Eternal', 'Eternal Flame', 'Hero’s Hall'),
  c(18, 'rengoku-legend', 'rengoku', 'BLAZING LEGEND', ['#fbbf24', '#f97316', '#1f0f02'], 'sun', 'rays', 'Dourado, sol e chamas cinematográficas', 'Legendary Inferno', 'Solar Champion', 'Legend’s Arrival', 'Solar Legend', 'Blazing Kingdom', 'Sunset Arena'),
  // ---------------- My Hero Academia ----------------
  c(19, 'deku-ofa', 'deku', 'ONE FOR ALL', ['#22c55e', '#86efac', '#03140a'], 'lightning', 'bolts', 'Verde elétrico e raios energéticos', 'Emerald Lightning', 'One For All Energy', 'Hero Awakening', 'Emerald Hero', 'Hero Academy', 'Hero Training Room'),
  c(20, 'deku-full-cowl', 'deku', 'FULL COWL', ['#10b981', '#67e8f9', '#021612'], 'crystal', 'sparks', 'Energia esmeralda contínua e iluminação tecnológica', 'Full Cowl Surge', 'Electric Hero', 'Power Surge', 'Electric Resolve', 'Power District', 'Electric Training Lab'),
  c(21, 'deku-vigilante', 'deku', 'DARK VIGILANTE', ['#15803d', '#4ade80', '#020806'], 'city', 'bolts', 'Cidade noturna, sombras e relâmpagos verdes', 'Dark Hero Rising', 'Vigilante Storm', 'Dark Awakening', 'Shadow Hero', 'Vigilante City', 'Dark Rooftop'),
  c(22, 'bakugo-explosion', 'bakugo', 'EXPLOSION', ['#fb923c', '#fde68a', '#1c0a03'], 'burst', 'sparks', 'Explosões alaranjadas e impactos energéticos', 'Explosive Impact', 'Blast Ring', 'Explosion Burst', 'Blast Hero', 'Explosion Arena', 'Blast Training Room'),
  c(23, 'bakugo-fury', 'bakugo', 'COMBAT FURY', ['#ef4444', '#f97316', '#0b0303'], 'impact', 'shock', 'Detonações rápidas, preto, vermelho e laranja', 'Fury Detonation', 'Detonation Core', 'Combat Explosion', 'Combat Rage', 'Battle District', 'Combat Simulator'),
  c(24, 'bakugo-victory', 'bakugo', 'VICTORY BLAST', ['#facc15', '#fb923c', '#1a1002'], 'burst', 'rays', 'Explosões douradas e iluminação de vitória', 'Victory Explosion', 'Champion’s Blast', 'Victory Impact', 'Explosive Champion', 'Champion’s Arena', 'Victory Lounge'),
  c(25, 'todoroki-dual', 'todoroki', 'HALF COLD HALF HOT', ['#ef4444', '#60a5fa', '#0a0a14'], 'dual', 'snow', 'Combinação de fogo e gelo, vermelho e azul', 'Dual Element', 'Frozen Flame', 'Elemental Balance', 'Duality', 'Elemental Kingdom', 'Dual Element Room'),
  c(26, 'todoroki-ice', 'todoroki', 'ICE DOMAIN', ['#93c5fd', '#e0f2fe', '#06121f'], 'ice', 'snow', 'Cristais, gelo e névoa azulada', 'Frozen Horizon', 'Crystal Frost', 'Frozen Arrival', 'Arctic Hero', 'Frozen Sanctuary', 'Ice Palace'),
  c(27, 'todoroki-inferno', 'todoroki', 'INFERNO AWAKENING', ['#f43f5e', '#fb923c', '#170306'], 'flame', 'embers', 'Chamas vermelhas e iluminação quente', 'Blazing Awakening', 'Inferno Crown', 'Flame Release', 'Crimson Fire', 'Inferno Domain', 'Fire Chamber'),
];

export const AL_IDS = AL_COLLECTIONS.map((x) => x.id) as [string, ...string[]];
export const AL_BY_ID: Record<string, AlCollection> = Object.fromEntries(AL_COLLECTIONS.map((x) => [x.id, x]));
/** Profile field values (`al:<id>`). */
export const AL_PROFILE_IDS = AL_IDS.map((id) => `al:${id}`);
export const alOf = (v: string | null | undefined): AlCollection | undefined => (v && v.startsWith('al:') ? AL_BY_ID[v.slice(3)] : undefined);
