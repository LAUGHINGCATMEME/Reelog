#!/usr/bin/env bash
# Re-downloads the icon font, subset to the icons the app uses. Using a new icon? Add its name
# here (kept alphabetical, as Google Fonts requires) and run: bash scripts/fonts.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ICONS=add,add_circle,animation,arrow_back,backup,bolt,bookmark_add,bookmark_added,calendar_month,calendar_today,call_split,check,check_box,check_box_outline_blank,check_circle,chevron_right,close,cloud_off,delete,delete_forever,edit,event,expand_more,history,insights,local_fire_department,merge,movie,playlist_add_check,refresh,remove,search,settings,settings_backup_restore,share,sort,star,today,tv,undo,upload_file,video_library
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
css=$(curl -sfA "$UA" "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0&icon_names=$ICONS&display=block")
curl -sfo public/fonts/material-symbols-rounded.woff2 "$(grep -oP 'url\(\K[^)]+' <<<"$css")"
echo "icon font updated"
