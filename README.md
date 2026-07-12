# FloatLyrics

<p align="center">
  <img src="./build/icon.png" alt="FloatLyrics app icon" width="128" height="128">
</p>

FloatLyrics is a macOS desktop app that shows synced lyrics in a transparent, always-on-top overlay while Spotify plays in the background.

This project is currently built for macOS only.

> Early prototype: FloatLyrics is macOS-only. If a DMG is not available in Releases yet, you can build it locally from the project folder.

## Overview

FloatLyrics is an Electron desktop overlay for Spotify listeners. It reads the current track from the local Spotify desktop app first, fetches synced LRC lyrics, and displays the current and next lyric line in a compact floating window.

Spotify Web API login is optional. It can be used as a fallback for Spotify Connect or remote playback, but the normal macOS desktop flow does not require a Spotify Developer app, Client ID, `.env` file, redirect URI, or API allowlist.

The app is intentionally minimal: no full player UI, no playlists, and no account management. The main goal is a clean lyrics overlay that stays out of the way.

## Features

- Transparent, frameless macOS lyrics overlay
- Always-on-top window
- Local Spotify desktop track detection with no developer setup
- Optional Spotify login with Authorization Code Flow + PKCE
- Spotify Web API fallback for remote playback
- Synced lyric lookup and timestamp parsing
- Recent lyrics cache for tracks that have already been found
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
- Native macOS Spotify automation
- Optional Spotify Web API
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

### Download the macOS App

If a release is available:

1. Open the [FloatLyrics Releases page](https://github.com/jasonnn404/FloatLyrics/releases).
2. Download the latest `.dmg`.
3. Open the `.dmg`.
4. Drag `FloatLyrics` into `Applications`.
5. Open FloatLyrics.

If macOS warns that the app cannot be opened because it is from an unidentified developer, right-click the app and choose `Open`.

Current local builds are unsigned and not notarized. A signed macOS release is planned.

### Build the App Locally

If you are building from source and want to run FloatLyrics without Terminal:

```bash
npm run dist:mac
```

The generated DMG installers will be in the `release/` folder:

- `release/FloatLyrics-0.1.0-arm64.dmg` for Apple Silicon Macs
- `release/FloatLyrics-0.1.0-x64.dmg` for Intel Macs

Open the matching `.dmg`, drag `FloatLyrics` into `Applications`, then launch it from Finder or Launchpad. If macOS warns that the app is unsigned, right-click `FloatLyrics` and choose `Open` the first time.

### Simple Setup

1. Install [Node.js](https://nodejs.org/) if you do not already have it.
2. Download this project from GitHub:
   - Click the green `Code` button.
   - Click `Download ZIP`.
   - Unzip the folder.
3. Open the macOS Terminal app.
4. Drag the unzipped FloatLyrics folder into the Terminal window after typing `cd `.

It should look something like this:

```bash
cd /Users/yourname/Downloads/FloatLyrics
```

5. Press Enter, then install the app dependencies:

```bash
npm install
```

If you are comfortable with Git, you can clone instead:

```bash
git clone https://github.com/jasonnn404/FloatLyrics.git
cd FloatLyrics
npm install
```

## Basic Usage

If you installed the app from a DMG, open `FloatLyrics` from `Applications` or Launchpad.

If you are developing from source, start FloatLyrics from Terminal:

```bash
npm run dev
```

Then:

1. Open the Spotify desktop app.
2. Play a song.
3. FloatLyrics should detect the local Spotify playback and show synced lyrics.

The first time FloatLyrics controls or reads Spotify, macOS may ask for automation permission. Allow it so the overlay can read playback and control previous/play/pause/next.

Lyrics are fetched from LRCLIB, so new songs need internet access. Once lyrics have been found for a track, FloatLyrics caches them locally and can reuse them later if the lyrics API is unavailable.

To quit the app, click the red close button in the overlay.

## Optional Spotify API Setup

This is not required for normal local Spotify desktop playback.

Spotify API login can help if you want FloatLyrics to fall back to Spotify Web API playback state, such as when using Spotify Connect or remote devices. Spotify development-mode apps may require the app owner to have Spotify Premium, and users may need to be added to the app allowlist.

You do not need a client secret.

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Log in with your Spotify account.
3. Click `Create app`.
4. Use any name and description, for example:
   - App name: `FloatLyrics`
   - Description: `Local lyrics overlay`
5. For Redirect URI, add this exactly:

```text
http://127.0.0.1:5173/callback
```

6. Save the Spotify app.
7. Open the app settings and copy the `Client ID`.

FloatLyrics uses PKCE, so it does not need a client secret.

Required scopes:

- `user-read-currently-playing`
- `user-read-playback-state`
- `user-modify-playback-state`

## Environment Variables

If you want optional Spotify API login, create a file named `.env` in the FloatLyrics folder.

Paste this inside it, replacing `your_spotify_client_id` with the Client ID you copied from Spotify:

```bash
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
```

Do not commit `.env`.

If you are using Terminal, you can create the file like this:

```bash
echo 'VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id' > .env
```

Then open `.env` and replace `your_spotify_client_id` with your real Spotify Client ID.

## Development Commands

Run type checking:

```bash
npm run typecheck
```

Build the app:

```bash
npm run build
```

Build a macOS DMG installer:

```bash
npm run dist:mac
```

The generated `.dmg` will be in the `release/` folder.

On Apple Silicon, this creates:

- `release/FloatLyrics-0.1.0-arm64.dmg`
- `release/FloatLyrics-0.1.0-x64.dmg`

Run the built app locally:

```bash
npm run start
```

Note: the red close button quits the Electron app. The `predev` script also clears this project's stale Vite process on port `5173` before starting.

## Roadmap

- Package FloatLyrics as a signed macOS app
- Publish downloadable GitHub Releases
- Add saved user preferences for opacity and display mode
- Improve lyric lookup matching for remasters, deluxe albums, and alternate titles
- Add a small menu bar item
- Add automatic update support
- Add better error states for unavailable Spotify playback devices
