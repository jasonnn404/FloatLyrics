#!/bin/bash

set -u

APP_EXECUTABLE='/opt/FloatLyrics/floatlyrics'
APP_LINK='/usr/bin/floatlyrics'
APPARMOR_PROFILE='/etc/apparmor.d/floatlyrics'
CHROME_SANDBOX='/opt/FloatLyrics/chrome-sandbox'

# electron-builder's default Ubuntu 24 profile uses a named "unconfined"
# AppArmor label. Spotify's Snap only accepts the true unconfined peer label
# for MPRIS, so remove that profile and use Chromium's setuid sandbox instead.
if [ -f "$APPARMOR_PROFILE" ]; then
  if command -v apparmor_parser >/dev/null 2>&1; then
    apparmor_parser --remove "$APPARMOR_PROFILE" >/dev/null 2>&1 || true
  fi
  rm -f "$APPARMOR_PROFILE"
fi

if [ -f "$CHROME_SANDBOX" ]; then
  chown root:root "$CHROME_SANDBOX" || true
  chmod 4755 "$CHROME_SANDBOX" || true
fi

if command -v update-alternatives >/dev/null 2>&1; then
  if [ -L "$APP_LINK" ] && [ -e "$APP_LINK" ] && [ "$(readlink "$APP_LINK")" != '/etc/alternatives/floatlyrics' ]; then
    rm -f "$APP_LINK"
  fi
  update-alternatives --install "$APP_LINK" floatlyrics "$APP_EXECUTABLE" 100 || ln -sf "$APP_EXECUTABLE" "$APP_LINK"
else
  ln -sf "$APP_EXECUTABLE" "$APP_LINK"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache --force --ignore-theme-index /usr/share/icons/hicolor || true
fi
