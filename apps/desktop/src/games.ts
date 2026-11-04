/**
 * Detects a running game by its process name (no injection, no memory reading — just the process list,
 * like other chat apps). Windows: tasklist. Linux: ps (Proton games keep their .exe name).
 */
import { execFile } from 'node:child_process';

/** executable (lowercase) → display name */
const GAMES: Record<string, string> = {
  'valorant-win64-shipping.exe': 'VALORANT',
  'league of legends.exe': 'League of Legends',
  'cs2.exe': 'Counter-Strike 2',
  'fortniteclient-win64-shipping.exe': 'Fortnite',
  'gta5.exe': 'Grand Theft Auto V',
  'gta5_enhanced.exe': 'Grand Theft Auto V',
  'robloxplayerbeta.exe': 'Roblox',
  'minecraft.windows.exe': 'Minecraft',
  'r5apex.exe': 'Apex Legends',
  'r5apex_dx12.exe': 'Apex Legends',
  'rocketleague.exe': 'Rocket League',
  'dota2.exe': 'Dota 2',
  'overwatch.exe': 'Overwatch 2',
  'genshinimpact.exe': 'Genshin Impact',
  'zenlesszonezero.exe': 'Zenless Zone Zero',
  'starrail.exe': 'Honkai: Star Rail',
  'tslgame.exe': 'PUBG: Battlegrounds',
  'rainbowsix.exe': 'Rainbow Six Siege',
  'rainbowsix_vulkan.exe': 'Rainbow Six Siege',
  'fallguys_client_game.exe': 'Fall Guys',
  'eldenring.exe': 'Elden Ring',
  'cyberpunk2077.exe': 'Cyberpunk 2077',
  'fc25.exe': 'EA SPORTS FC 25',
  'fc26.exe': 'EA SPORTS FC 26',
  'cod.exe': 'Call of Duty',
  'deadbydaylight-win64-shipping.exe': 'Dead by Daylight',
  'rustclient.exe': 'Rust',
  'terraria.exe': 'Terraria',
  'stardew valley.exe': 'Stardew Valley',
  'among us.exe': 'Among Us',
  'hollow_knight.exe': 'Hollow Knight',
  'palworld-win64-shipping.exe': 'Palworld',
  'marvel-win64-shipping.exe': 'Marvel Rivals',
  'helldivers2.exe': 'Helldivers 2',
  'eft.exe': 'Escape from Tarkov',
  'escapefromtarkov.exe': 'Escape from Tarkov',
  'thefinals.exe': 'THE FINALS',
  'deltaforce-win64-shipping.exe': 'Delta Force',
  'pathofexile_x64.exe': 'Path of Exile',
  'pathofexile2.exe': 'Path of Exile 2',
  'wow.exe': 'World of Warcraft',
  'diablo iv.exe': 'Diablo IV',
  'bg3.exe': "Baldur's Gate 3",
  'bg3_dx11.exe': "Baldur's Gate 3",
  'witcher3.exe': 'The Witcher 3',
  'rdr2.exe': 'Red Dead Redemption 2',
  'sotgame.exe': 'Sea of Thieves',
  'brawlhalla.exe': 'Brawlhalla',
  'paladins.exe': 'Paladins',
  'warframe.x64.exe': 'Warframe',
  'osu!.exe': 'osu!',
  'geometrydash.exe': 'Geometry Dash',
};

export interface GameActivity {
  name: string;
  startedAt: number;
}

function listProcesses(): Promise<string[]> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
        if (err) return resolve([]);
        resolve(out.split(/\r?\n/).map((l) => l.split('","')[0]!.replace(/^"/, '').toLowerCase()).filter(Boolean));
      });
    } else {
      execFile('ps', ['-eo', 'args='], { maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
        if (err) return resolve([]);
        const names: string[] = [];
        for (const line of out.split('\n')) {
          const l = line.trim().toLowerCase();
          if (!l) continue;
          // Proton/Wine: any "...\\Game Name.exe" in the command line (paths may contain spaces)
          for (const m of l.matchAll(/([^\\/:]+\.exe)\b/g)) names.push(m[1]!.trim());
          // native Linux binary: first token's basename ("cs2" → matches "cs2.exe")
          const first = (l.split(/\s+/)[0] ?? '').split('/').pop() ?? '';
          if (first && !first.endsWith('.exe')) names.push(`${first}.exe`);
        }
        resolve(names);
      });
    }
  });
}

export class GameDetector {
  private timer: ReturnType<typeof setInterval> | null = null;
  private current: GameActivity | null = null;
  constructor(private onChange: (g: GameActivity | null) => void) {}

  start() {
    void this.scan();
    this.timer = setInterval(() => void this.scan(), 15_000);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }
  get() {
    return this.current;
  }

  private async scan() {
    const procs = await listProcesses();
    let found: string | null = null;
    for (const p of procs) {
      if (GAMES[p]) {
        found = GAMES[p]!;
        break;
      }
    }
    if ((found ?? null) === (this.current?.name ?? null)) return;
    this.current = found ? { name: found, startedAt: Date.now() } : null;
    this.onChange(this.current);
  }
}
