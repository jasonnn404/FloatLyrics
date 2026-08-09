#!/bin/bash

set -u

APP_EXECUTABLE='/opt/FloatLyrics/floatlyrics'
APP_LINK='/usr/bin/floatlyrics'
APPARMOR_PROFILE='/etc/apparmor.d/floatlyrics'

if command -v update-alternatives >/dev/null 2>&1; then
  update-alternatives --remove floatlyrics "$APP_EXECUTABLE" || true
else
  rm -f "$APP_LINK"
fi

if [ -f "$APPARMOR_PROFILE" ]; then
  if command -v apparmor_parser >/dev/null 2>&1; then
    apparmor_parser --remove "$APPARMOR_PROFILE" >/dev/null 2>&1 || true
  fi
  rm -f "$APPARMOR_PROFILE"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache --force --ignore-theme-index /usr/share/icons/hicolor || true
fi
