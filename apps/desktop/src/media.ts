/**
 * "Now playing" bridge for the Live Island.
 * - Windows 10/11: Global System Media Transport Controls (the same sessions shown in the volume flyout),
 *   read through a long-lived PowerShell process using WinRT (no native module needed).
 * - Linux: MPRIS via `playerctl` (if installed).
 * Anything unsupported simply reports no session; nothing is simulated.
 */
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';

export interface NowPlaying {
  title: string;
  artist: string;
  app: string;
  playing: boolean;
  positionMs: number | null;
  durationMs: number | null;
  /** when position was sampled (epoch ms) — the UI extrapolates while playing */
  sampledAt: number;
  art: string | null; // data: URL
  canNext: boolean;
  canPrev: boolean;
}

export type MediaCommand = 'toggle' | 'next' | 'prev';

const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + '`' + String.raw`1' })[0]
function Await($op, $type) { $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$last = ''; $lastKey = ''; $art = $null; $lastAt = [DateTime]::MinValue; $o = $null
$read = [Console]::In.ReadLineAsync()
while ($true) {
  if ($read.IsCompleted) {
    $cmd = $read.Result; if ($cmd -eq $null) { exit }
    $s = $mgr.GetCurrentSession()
    if ($s) {
      switch ($cmd) {
        'toggle' { Await ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
        'next'   { Await ($s.TrySkipNextAsync()) ([bool]) | Out-Null }
        'prev'   { Await ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null }
      }
    }
    $read = [Console]::In.ReadLineAsync()
  }
  $s = $mgr.GetCurrentSession()
  if (-not $s) { $out = '{"none":true}'; $o = $null }
  else {
    $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $pb = $s.GetPlaybackInfo(); $tl = $s.GetTimelineProperties()
    $key = "$($p.Title)|$($p.Artist)"
    if ($key -ne $lastKey) {
      $lastKey = $key; $art = $null
      if ($p.Thumbnail) {
        try {
          $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
          if ($st.Size -gt 0 -and $st.Size -lt 2000000) {
            $dr = New-Object Windows.Storage.Streams.DataReader($st.GetInputStreamAt(0))
            $n = Await ($dr.LoadAsync([uint32]$st.Size)) ([uint32])
            $bytes = New-Object byte[] $n; $dr.ReadBytes($bytes)
            $art = 'data:' + $st.ContentType + ';base64,' + [Convert]::ToBase64String($bytes)
          }
        } catch {}
      }
    }
    $o = [ordered]@{
      title = $p.Title; artist = $p.Artist; app = $s.SourceAppUserModelId
      playing = ($pb.PlaybackStatus -eq 'Playing')
      positionMs = [int64]$tl.Position.TotalMilliseconds; durationMs = [int64]$tl.EndTime.TotalMilliseconds
      canNext = $pb.Controls.IsNextEnabled; canPrev = $pb.Controls.IsPreviousEnabled; art = $art
    }
    $out = $o | ConvertTo-Json -Compress
  }
  # Emit on change; re-emit every ~3s while playing so the position stays accurate
  $now = [DateTime]::UtcNow
  if ($out -ne $last -or ($o.playing -and ($now - $lastAt).TotalSeconds -ge 3)) { [Console]::Out.WriteLine($out); [Console]::Out.Flush(); $last = $out; $lastAt = $now }
  Start-Sleep -Milliseconds 600
}
`;

const appName = (id: string) => {
  const s = id.toLowerCase();
  if (s.includes('spotify')) return 'Spotify';
  if (s.includes('chrome')) return 'Chrome';
  if (s.includes('msedge')) return 'Edge';
  if (s.includes('firefox')) return 'Firefox';
  if (s.includes('zune') || s.includes('media')) return 'Media Player';
  if (s.includes('deezer')) return 'Deezer';
  if (s.includes('vlc')) return 'VLC';
  return id.split(/[!\\.]/).filter(Boolean).pop() ?? id;
};

export class MediaBridge {
  private ps: ChildProcessWithoutNullStreams | null = null;
  private linuxTimer: ReturnType<typeof setInterval> | null = null;
  private last: NowPlaying | null = null;
  constructor(private onChange: (np: NowPlaying | null) => void) {}

  start() {
    if (process.platform === 'win32') this.startWindows();
    else if (process.platform === 'linux') this.startLinux();
  }

  stop() {
    this.ps?.kill();
    this.ps = null;
    if (this.linuxTimer) clearInterval(this.linuxTimer);
    this.linuxTimer = null;
  }

  current() {
    return this.last;
  }

  command(cmd: MediaCommand) {
    if (this.ps) this.ps.stdin.write(cmd + '\n');
    else if (process.platform === 'linux') {
      execFile('playerctl', [cmd === 'toggle' ? 'play-pause' : cmd === 'next' ? 'next' : 'previous'], () => setTimeout(() => this.pollLinux(), 250));
    }
  }

  private emit(np: NowPlaying | null) {
    this.last = np;
    this.onChange(np);
  }

  private startWindows() {
    // Script goes in -EncodedCommand (UTF-16LE base64) so stdin stays free for commands.
    const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true });
    this.ps = ps;
    let buf = '';
    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', (chunk: string) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('{')) continue;
        try {
          const o = JSON.parse(line);
          if (o.none || !o.title) this.emit(null);
          else
            this.emit({
              title: String(o.title),
              artist: String(o.artist ?? ''),
              app: appName(String(o.app ?? '')),
              playing: !!o.playing,
              positionMs: o.durationMs > 0 ? Number(o.positionMs) : null,
              durationMs: o.durationMs > 0 ? Number(o.durationMs) : null,
              sampledAt: Date.now(),
              art: o.art ?? this.last?.art ?? null,
              canNext: !!o.canNext,
              canPrev: !!o.canPrev,
            });
        } catch {
          /* ignore malformed line */
        }
      }
    });
    ps.on('exit', () => {
      if (this.ps === ps) this.ps = null;
    });
  }

  private startLinux() {
    execFile('playerctl', ['--version'], (err) => {
      if (err) return; // playerctl not installed → feature unavailable
      void this.pollLinux();
      this.linuxTimer = setInterval(() => void this.pollLinux(), 1500);
    });
  }

  private pollLinux() {
    const fmt = '{{status}}\t{{title}}\t{{artist}}\t{{playerName}}\t{{position}}\t{{mpris:length}}\t{{mpris:artUrl}}';
    execFile('playerctl', ['metadata', '--format', fmt], (err, out) => {
      if (err || !out.trim()) {
        if (this.last) this.emit(null);
        return;
      }
      const [status, title, artist, player, pos, len, artUrl] = out.trim().split('\t');
      const np: NowPlaying = {
        title: title ?? '',
        artist: artist ?? '',
        app: player ? player[0]!.toUpperCase() + player.slice(1) : 'Player',
        playing: status === 'Playing',
        positionMs: pos ? Math.round(Number(pos) / 1000) : null,
        durationMs: len ? Math.round(Number(len) / 1000) : null,
        sampledAt: Date.now(),
        art: artUrl && /^https?:/.test(artUrl) ? artUrl : null,
        canNext: true,
        canPrev: true,
      };
      if (JSON.stringify({ ...np, sampledAt: 0, positionMs: 0 }) !== JSON.stringify({ ...this.last, sampledAt: 0, positionMs: 0 }) || np.playing) this.emit(np);
    });
  }
}
