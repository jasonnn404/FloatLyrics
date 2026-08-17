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

export const windowsSpotifyAudioSource = String.raw`
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class SpotifyAudio
{
    private enum EDataFlow { Render, Capture, All }
    private enum ERole { Console, Multimedia, Communications }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumerator { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        [PreserveSig]
        int EnumAudioEndpoints(EDataFlow dataFlow, uint stateMask, out object devices);
        [PreserveSig]
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice device);
        [PreserveSig]
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        [PreserveSig]
        int RegisterEndpointNotificationCallback(IntPtr client);
        [PreserveSig]
        int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        [PreserveSig]
        int Activate(ref Guid iid, uint classContext, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
        [PreserveSig]
        int OpenPropertyStore(uint access, out IntPtr properties);
        [PreserveSig]
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig]
        int GetState(out uint state);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionManager2
    {
        [PreserveSig]
        int GetAudioSessionControl(ref Guid sessionId, uint streamFlags, out IntPtr control);
        [PreserveSig]
        int GetSimpleAudioVolume(ref Guid sessionId, uint streamFlags, out IntPtr volume);
        [PreserveSig]
        int GetSessionEnumerator(out IAudioSessionEnumerator sessionEnumerator);
        [PreserveSig]
        int RegisterSessionNotification(IntPtr notification);
        [PreserveSig]
        int UnregisterSessionNotification(IntPtr notification);
        [PreserveSig]
        int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionId, IntPtr notification);
        [PreserveSig]
        int UnregisterDuckNotification(IntPtr notification);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionEnumerator
    {
        [PreserveSig]
        int GetCount(out int count);
        [PreserveSig]
        int GetSession(int index, out IAudioSessionControl control);
    }

    [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl
    {
        [PreserveSig]
        int GetState(out int state);
        [PreserveSig]
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        [PreserveSig]
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
        [PreserveSig]
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        [PreserveSig]
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
        [PreserveSig]
        int GetGroupingParam(out Guid groupingId);
        [PreserveSig]
        int SetGroupingParam(ref Guid groupingId, ref Guid context);
        [PreserveSig]
        int RegisterAudioSessionNotification(IntPtr client);
        [PreserveSig]
        int UnregisterAudioSessionNotification(IntPtr client);
    }

    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl2
    {
        [PreserveSig]
        int GetState(out int state);
        [PreserveSig]
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        [PreserveSig]
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
        [PreserveSig]
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        [PreserveSig]
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
        [PreserveSig]
        int GetGroupingParam(out Guid groupingId);
        [PreserveSig]
        int SetGroupingParam(ref Guid groupingId, ref Guid context);
        [PreserveSig]
        int RegisterAudioSessionNotification(IntPtr client);
        [PreserveSig]
        int UnregisterAudioSessionNotification(IntPtr client);
        [PreserveSig]
        int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig]
        int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig]
        int GetProcessId(out uint processId);
        [PreserveSig]
        int IsSystemSoundsSession();
        [PreserveSig]
        int SetDuckingPreference([MarshalAs(UnmanagedType.Bool)] bool optOut);
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ISimpleAudioVolume
    {
        [PreserveSig]
        int SetMasterVolume(float level, ref Guid context);
        [PreserveSig]
        int GetMasterVolume(out float level);
        [PreserveSig]
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, ref Guid context);
        [PreserveSig]
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
    }

    private const uint CLSCTX_ALL = 23;

    private static bool IsSpotifySession(IAudioSessionControl control)
    {
        var control2 = control as IAudioSessionControl2;
        uint processId;
        if (control2 == null || control2.GetProcessId(out processId) != 0 || processId == 0) return false;
        try
        {
            using (var process = Process.GetProcessById((int)processId))
                return process.ProcessName.IndexOf("spotify", StringComparison.OrdinalIgnoreCase) >= 0;
        }
        catch { return false; }
    }

    private static IAudioSessionEnumerator GetSessions(out object enumeratorObject, out object deviceObject, out object managerObject)
    {
        var deviceEnumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
        enumeratorObject = deviceEnumerator;
        IMMDevice device;
        if (deviceEnumerator.GetDefaultAudioEndpoint(EDataFlow.Render, ERole.Multimedia, out device) != 0)
            throw new InvalidOperationException("No default audio output device.");
        deviceObject = device;
        Guid managerId = typeof(IAudioSessionManager2).GUID;
        if (device.Activate(ref managerId, CLSCTX_ALL, IntPtr.Zero, out managerObject) != 0)
            throw new InvalidOperationException("Could not access Windows audio sessions.");
        var manager = (IAudioSessionManager2)managerObject;
        IAudioSessionEnumerator sessions;
        if (manager.GetSessionEnumerator(out sessions) != 0)
            throw new InvalidOperationException("Could not enumerate Windows audio sessions.");
        return sessions;
    }

    public static double GetVolume()
    {
        object enumerator = null, device = null, manager = null;
        IAudioSessionEnumerator sessions = null;
        try
        {
            sessions = GetSessions(out enumerator, out device, out manager);
            int count;
            sessions.GetCount(out count);
            for (int index = 0; index < count; index++)
            {
                IAudioSessionControl control;
                sessions.GetSession(index, out control);
                try
                {
                    if (!IsSpotifySession(control)) continue;
                    var volume = control as ISimpleAudioVolume;
                    float level;
                    if (volume != null && volume.GetMasterVolume(out level) == 0)
                        return Math.Round(Math.Max(0, Math.Min(1, level)) * 100);
                }
                finally { if (control != null) Marshal.ReleaseComObject(control); }
            }
            return -1;
        }
        finally
        {
            if (sessions != null) Marshal.ReleaseComObject(sessions);
            if (manager != null) Marshal.ReleaseComObject(manager);
            if (device != null) Marshal.ReleaseComObject(device);
            if (enumerator != null) Marshal.ReleaseComObject(enumerator);
        }
    }

    public static bool SetVolume(double percentage)
    {
        object enumerator = null, device = null, manager = null;
        IAudioSessionEnumerator sessions = null;
        bool changed = false;
        try
        {
            sessions = GetSessions(out enumerator, out device, out manager);
            int count;
            sessions.GetCount(out count);
            float level = (float)Math.Max(0, Math.Min(1, percentage / 100));
            Guid context = Guid.Empty;
            for (int index = 0; index < count; index++)
            {
                IAudioSessionControl control;
                sessions.GetSession(index, out control);
                try
                {
                    if (!IsSpotifySession(control)) continue;
                    var volume = control as ISimpleAudioVolume;
                    if (volume != null && volume.SetMasterVolume(level, ref context) == 0) changed = true;
                }
                finally { if (control != null) Marshal.ReleaseComObject(control); }
            }
            return changed;
        }
        finally
        {
            if (sessions != null) Marshal.ReleaseComObject(sessions);
            if (manager != null) Marshal.ReleaseComObject(manager);
            if (device != null) Marshal.ReleaseComObject(device);
            if (enumerator != null) Marshal.ReleaseComObject(enumerator);
        }
    }
}
`;

export const windowsSpotifyHelperScript = String.raw`
$ErrorActionPreference = 'Stop'
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$audioSource = @'
${windowsSpotifyAudioSource}
'@
Add-Type -TypeDefinition $audioSource -Language CSharp

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
    if ($request.command -eq 'getVolume') {
      $volume = [SpotifyAudio]::GetVolume()
      $result = if ($volume -lt 0) { $null } else { [Math]::Round($volume) }
      @{ id = $request.id; ok = $true; result = $result } | ConvertTo-Json -Compress
      continue
    }

    if ($request.command -eq 'setVolume') {
      $volume = [Math]::Min(100, [Math]::Max(0, [Math]::Round([double]$request.volume)))
      $changed = [SpotifyAudio]::SetVolume($volume)
      @{ id = $request.id; ok = $true; result = [Boolean]$changed } | ConvertTo-Json -Compress
      continue
    }

    if ($request.command -eq 'getPlayback') {
      $session = Get-SpotifySession
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
      $session = Get-SpotifySession
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

  const child = spawn(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "& ([scriptblock]::Create($env:FLOATLYRICS_WINDOWS_HELPER))"
    ],
    {
      windowsHide: true,
      env: { ...process.env, FLOATLYRICS_WINDOWS_HELPER: windowsSpotifyHelperScript }
    }
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

function sendRequest(
  command: "getPlayback" | "control" | "getVolume" | "setVolume",
  payload: { action?: SpotifyAction; volume?: number } = {}
) {
  return new Promise<unknown>((resolve, reject) => {
    const child = ensureHelper();
    const id = ++requestId;
    const timeout = setTimeout(() => {
      const error = new Error("Windows media helper timed out.");
      reportError(error);
      stopHelper(error);
    }, 5000);

    pendingRequests.set(id, { resolve, reject, timeout });
    child.stdin.write(`${JSON.stringify({ id, command, ...payload })}\n`, (error) => {
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
    return (await sendRequest("control", { action })) === true;
  } catch (error) {
    reportError(error);
    return false;
  }
}

export async function getWindowsSpotifyVolume(): Promise<number | null> {
  if (process.platform !== "win32") return null;
  try {
    const volume = Number(await sendRequest("getVolume"));
    return Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : null;
  } catch (error) {
    reportError(error);
    return null;
  }
}

export async function setWindowsSpotifyVolume(requestedVolume: number) {
  if (process.platform !== "win32" || !Number.isFinite(requestedVolume)) return false;
  try {
    const volume = Math.min(100, Math.max(0, Math.round(requestedVolume)));
    return (await sendRequest("setVolume", { volume })) === true;
  } catch (error) {
    reportError(error);
    return false;
  }
}

export function closeWindowsSpotify() {
  if (helper || pendingRequests.size > 0) stopHelper();
}
