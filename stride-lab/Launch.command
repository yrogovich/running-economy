#!/bin/zsh
cd -- "${0:A:h}"
printf '\nStride Lab will run at http://127.0.0.1:5173\nKeep this terminal open. Press Control-C to stop.\n\n'
exec python3 -m http.server 5173 --bind 127.0.0.1 --directory dist
