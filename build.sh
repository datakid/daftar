#!/bin/sh
set -e
mkdir -p dist
{
  sed -n '1,/<!--CSS-->/p' src/daftar.html | sed '$d'
  echo '<style>'; cat src/css/daftar.css; echo '</style>'
  sed -n '/<!--CSS-->/,/<!--JS-->/p' src/daftar.html | sed '1d;$d'
  echo '<script>'; cat src/js/*.js; echo '</script>'
  sed -n '/<!--JS-->/,$p' src/daftar.html | sed '1d'
} > dist/daftar.html
for asset in xlsx.full.min.js jszip.min.js ibm-plex-mono-400.ttf ibm-plex-sans-arabic-400.ttf ibm-plex-sans-arabic-600.ttf amiri-400.ttf amiri-700.ttf; do
  if [ -f "$asset" ]; then cp "$asset" dist/; fi
done
