# FloatLyrics

FloatLyrics is a macOS desktop app that shows synced lyrics in a transparent, always-on-top overlay while Spotify plays in the background.

This project is currently built for macOS only.

## Overview

FloatLyrics is an Electron desktop overlay for Spotify listeners. It connects to Spotify using Authorization Code Flow with PKCE, reads the current playback state, fetches synced LRC lyrics, and displays the current and next lyric line in a compact floating window.

The app is intentionally minimal: no full player UI, no playlists, and no account management. The main goal is a clean lyrics overlay that stays out of the way.

## Features

- Transparent, frameless macOS lyrics overlay
- Always-on-top window
- Spotify login with Authorization Code Flow + PKCE
- Current Spotify track detection
- Synced lyric lookup and timestamp parsing
- Compact mode: current line + next line
- Focus mode: current line only
- Opacity control
- Spotify playback controls for previous, play/pause, and next
- `Cmd+Shift+L` shortcut to show or hide the overlay
- Native macOS Spotify control support through AppleScript

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- Spotify Web API
- LRCLIB synced lyrics API
- lucide-react icons

## Screenshots

### Compact Mode

![FloatLyrics compact mode](./screenshots/compact.png)

### Focus Mode

![FloatLyrics focus mode](./screenshots/focus.png)

### Controls

![FloatLyrics controls](./screenshots/settings.png)

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/jasonnn404/FloatLyrics.git
cd FloatLyrics
npm install
```

## Spotify Setup

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create a Spotify app.
3. Copy the app's Client ID.
4. Add this Redirect URI exactly:

```text
http://127.0.0.1:5173/callback
```

5. Save the Spotify app settings.

FloatLyrics uses PKCE, so it does not need a client secret.

Required scopes:

- `user-read-currently-playing`
- `user-read-playback-state`
- `user-modify-playback-state`

## Environment Variables

Create a `.env` file in the project root:

```bash
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
```

Do not commit `.env`.

## Development

Start the macOS desktop app in development mode:

```bash
npm run dev
```

Run type checking:

```bash
npm run typecheck
```

Build the app:

```bash
npm run build
```

Run the built app locally:

```bash
npm run start
```

Note: the red close button quits the Electron app. The `predev` script also clears this project's stale Vite process on port `5173` before starting.

## Roadmap

- Package FloatLyrics as a signed macOS app
- Add saved user preferences for opacity and display mode
- Improve lyric lookup matching for remasters, deluxe albums, and alternate titles
- Add a small menu bar item
- Add automatic update support
- Add better error states for unavailable Spotify playback devices
