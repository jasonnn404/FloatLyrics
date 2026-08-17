import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type WindowsSpotifyPlayback = {
  title: string;
  artist: string;
  album: string;
  progress_ms: number;
  duration_ms: number;
  is_playing: boolean;
};

type SpotifyAction = "previous" | "playPause" | "next";
type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type HelperResponse = {
  id?: unknown;
  ok?: unknown;
  result?: unknown;
};

export const windowsSpotifyHelperScript = String.raw`
$ErrorActionPreference = 'Stop'
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$script:asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 } |
  Select-Object -First 1

function Wait-WinRT($operation, [Type]$resultType) {
  $task = $script:asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait()
  return $task.Result
}

$manager = Wait-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Get-SpotifySession {
  $sessions = @($manager.GetSessions())
  $current = $manager.GetCurrentSession()
  if ($null -ne $current -and $current.SourceAppUserModelId -match 'spotify') { return $current }
  return $sessions | Where-Object { $_.SourceAppUserModelId -match 'spotify' } | Select-Object -First 1
}

while ($null -ne ($line = [Console]::In.ReadLine())) {
  $request = $null
  try {
    $request = $line | ConvertFrom-Json
    $session = Get-SpotifySession
    if ($request.command -eq 'getPlayback') {
      if ($null -eq $session) {
        @{ id = $request.id; ok = $true; result = $null } | ConvertTo-Json -Compress
        continue
      }

      $properties = Wait-WinRT ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $playbackInfo = $session.GetPlaybackInfo()
      $timeline = $session.GetTimelineProperties()
      $status = $playbackInfo.PlaybackStatus.ToString()
      if ([string]::IsNullOrWhiteSpace($properties.Title) -or $status -eq 'Closed') {
        @{ id = $request.id; ok = $true; result = $null } | ConvertTo-Json -Compress
        continue
      }

      $durationMs = [Math]::Max(0, [Math]::Round($timeline.EndTime.TotalMilliseconds))
      $positionMs = [Math]::Max(0, [Math]::Round($timeline.Position.TotalMilliseconds))
      if ($status -eq 'Playing') {
        $elapsedMs = [Math]::Max(0, ([DateTime]::UtcNow - $timeline.LastUpdatedTime.UtcDateTime).TotalMilliseconds)
        $positionMs += [Math]::Round($elapsedMs)
      }
      if ($durationMs -gt 0) { $positionMs = [Math]::Min($positionMs, $durationMs) }

      $artist = if ([string]::IsNullOrWhiteSpace($properties.Artist)) { 'Unknown artist' } else { $properties.Artist }
      $album = if ([string]::IsNullOrWhiteSpace($properties.AlbumTitle)) { 'Unknown album' } else { $properties.AlbumTitle }
      $result = @{
        title = $properties.Title
        artist = $artist
        album = $album
        progress_ms = $positionMs
        duration_ms = $durationMs
        is_playing = ($status -eq 'Playing')
      }
      @{ id = $request.id; ok = $true; result = $result } | ConvertTo-Json -Compress
      continue
    }

    if ($request.command -eq 'control') {
      if ($null -eq $session) {
        @{ id = $request.id; ok = $true; result = $false } | ConvertTo-Json -Compress
        continue
      }
      $operation = switch ($request.action) {
        'previous' { $session.TrySkipPreviousAsync(); break }
        'next' { $session.TrySkipNextAsync(); break }
        'playPause' { $session.TryTogglePlayPauseAsync(); break }
        default { $null }
      }
      $controlled = if ($null -eq $operation) { $false } else { Wait-WinRT $operation ([Boolean]) }
      @{ id = $request.id; ok = $true; result = [Boolean]$controlled } | ConvertTo-Json -Compress
      continue
    }

    @{ id = $request.id; ok = $false; result = $null } | ConvertTo-Json -Compress
  } catch {
    $requestId = if ($null -ne $request) { $request.id } else { $null }
    @{ id = $requestId; ok = $false; result = $null } | ConvertTo-Json -Compress
  }
}
`;

let helper: ChildProcessWithoutNullStreams | null = null;
let stdoutBuffer = "";
let requestId = 0;
let lastReportedError = "";
const pendingRequests = new Map<number, PendingRequest>();

function reportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === lastReportedError) return;
  lastReportedError = message;
  console.warn(`[FloatLyrics] Windows Spotify media-session error: ${message}`);
}

function rejectPending(error: Error) {
  for (const pending of pendingRequests.values()) {
    clearTimeout(pending.timeout);
    pending.reject(error);
  }
  pendingRequests.clear();
}

function stopHelper(error?: Error) {
  const process = helper;
  helper = null;
  stdoutBuffer = "";
  if (process && !process.killed) process.kill();
  rejectPending(error ?? new Error("Windows media helper stopped."));
}

function handleResponseLine(line: string) {
  let response: HelperResponse;
  try {
    response = JSON.parse(line) as HelperResponse;
  } catch {
    return;
  }

  if (!Number.isInteger(response.id)) return;
  const pending = pendingRequests.get(response.id as number);
  if (!pending) return;

  pendingRequests.delete(response.id as number);
  clearTimeout(pending.timeout);
  if (response.ok === true) {
    pending.resolve(response.result);
  } else {
    pending.reject(new Error("Windows media helper could not complete the request."));
  }
}

function ensureHelper() {
  if (helper && !helper.killed) return helper;

  const encodedScript = Buffer.from(windowsSpotifyHelperScript, "utf16le").toString("base64");
  const child = spawn(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedScript],
    { windowsHide: true }
  );
  helper = child;

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) handleResponseLine(line.trim());
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    if (chunk.trim()) reportError(chunk.trim());
  });
  child.on("error", (error) => {
    reportError(error);
    if (helper === child) stopHelper(error);
  });
  child.on("exit", () => {
    if (helper === child) stopHelper(new Error("Windows media helper exited."));
  });

  return child;
}

function sendRequest(command: "getPlayback" | "control", action?: SpotifyAction) {
  return new Promise<unknown>((resolve, reject) => {
    const child = ensureHelper();
    const id = ++requestId;
    const timeout = setTimeout(() => {
      const error = new Error("Windows media helper timed out.");
      reportError(error);
      stopHelper(error);
    }, 5000);

    pendingRequests.set(id, { resolve, reject, timeout });
    child.stdin.write(`${JSON.stringify({ id, command, action })}\n`, (error) => {
      if (!error) return;
      const pending = pendingRequests.get(id);
      if (!pending) return;
      pendingRequests.delete(id);
      clearTimeout(pending.timeout);
      pending.reject(error);
      stopHelper(error);
    });
  });
}

export function parseWindowsSpotifyPlayback(value: unknown): WindowsSpotifyPlayback | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const playback = value as Record<string, unknown>;
  if (
    typeof playback.title !== "string" || !playback.title.trim() ||
    typeof playback.artist !== "string" ||
    typeof playback.album !== "string" ||
    typeof playback.progress_ms !== "number" || !Number.isFinite(playback.progress_ms) ||
    typeof playback.duration_ms !== "number" || !Number.isFinite(playback.duration_ms) ||
    typeof playback.is_playing !== "boolean"
  ) return null;

  return {
    title: playback.title,
    artist: playback.artist || "Unknown artist",
    album: playback.album || "Unknown album",
    progress_ms: Math.max(0, Math.round(playback.progress_ms)),
    duration_ms: Math.max(0, Math.round(playback.duration_ms)),
    is_playing: playback.is_playing
  };
}

export async function getWindowsSpotifyPlayback(): Promise<WindowsSpotifyPlayback | null> {
  if (process.platform !== "win32") return null;
  try {
    return parseWindowsSpotifyPlayback(await sendRequest("getPlayback"));
  } catch (error) {
    reportError(error);
    return null;
  }
}

export async function controlWindowsSpotify(action: SpotifyAction) {
  if (process.platform !== "win32") return false;
  try {
    return (await sendRequest("control", action)) === true;
  } catch (error) {
    reportError(error);
    return false;
  }
}

export function closeWindowsSpotify() {
  if (helper || pendingRequests.size > 0) stopHelper();
}
