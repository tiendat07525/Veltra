#!/usr/bin/env bash
# Backup MongoDB của Veltra bằng mongodump (cần gói mongodb-database-tools).
# Chạy hằng ngày bởi veltra-backup.timer, hoặc chạy tay:
#   bash ~/VeltraV2/deploy/backup.sh
# Kết quả: $BACKUP_DIR/veltra-<YYYYmmdd-HHMMSS>.archive.gz (gzip archive, chmod 600), giữ $KEEP bản mới nhất.
# Restore: xem .claude/docs/operations.md (mongorestore --gzip --archive=<file>).
# MONGODB_URL lấy từ biến môi trường hoặc backend/.env; không bao giờ in ra, không nằm trên dòng lệnh.
set -euo pipefail
umask 077

APP_DIR="${APP_DIR:-$HOME/VeltraV2}"
ENV_FILE="${ENV_FILE:-$APP_DIR/backend/.env}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/veltra-backups}"
KEEP="${KEEP:-7}"
# mongodump retries forever when the server is unreachable
DUMP_TIMEOUT="${DUMP_TIMEOUT:-45m}"
LOCK_FILE="/tmp/veltra-backup.lock"

# Không cho 2 lần backup chạy chồng nhau
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Backup khác đang chạy, bỏ qua."; exit 0; }

command -v mongodump >/dev/null || { echo "Chưa cài mongodump (mongodb-database-tools)" >&2; exit 1; }

if [[ -z "${MONGODB_URL:-}" ]]; then
  [[ -r "$ENV_FILE" ]] || { echo "Không đọc được $ENV_FILE" >&2; exit 1; }
  MONGODB_URL=$(grep -E '^[[:space:]]*MONGODB_URL[[:space:]]*=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)
  # Bỏ khoảng trắng, \r (file CRLF) và dấu nháy bao ngoài
  MONGODB_URL="${MONGODB_URL//$'\r'/}"
  MONGODB_URL="$(echo "$MONGODB_URL" | sed -E "s/^[[:space:]]+|[[:space:]]+$//g; s/^\"(.*)\"$/\\1/; s/^'(.*)'$/\\1/")"
fi
[[ -n "$MONGODB_URL" ]] || { echo "Thiếu MONGODB_URL" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP=$(date +%Y%m%d-%H%M%S)
FINAL="$BACKUP_DIR/veltra-$STAMP.archive.gz"
PARTIAL="$FINAL.partial"
CONFIG=$(mktemp "$BACKUP_DIR/.mongodump-XXXXXX.yaml")
trap 'rm -f "$CONFIG" "$PARTIAL"' EXIT

# URI qua --config (YAML, nháy đơn; ' trong URI viết thành ''), để không lộ trong ps / journald
printf "uri: '%s'\n" "${MONGODB_URL//\'/\'\'}" > "$CONFIG"

echo "== mongodump → $(basename "$FINAL")"
timeout "$DUMP_TIMEOUT" mongodump --config="$CONFIG" --gzip --archive="$PARTIAL" --quiet \
  || { echo "mongodump thất bại hoặc quá $DUMP_TIMEOUT" >&2; exit 1; }
[[ -s "$PARTIAL" ]] || { echo "Backup rỗng" >&2; exit 1; }
chmod 600 "$PARTIAL"
mv "$PARTIAL" "$FINAL"
echo "Backup xong: $FINAL ($(du -h "$FINAL" | cut -f1))"

# Chỉ dọn bản cũ sau khi bản mới đã thành công: giữ $KEEP bản mới nhất
mapfile -t OLD < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'veltra-*.archive.gz' -printf '%T@ %p\n' \
  | sort -rn | tail -n +"$((KEEP + 1))" | cut -d' ' -f2-)
for file in "${OLD[@]}"; do
  rm -f -- "$file"
  echo "Đã xoá bản cũ: $(basename "$file")"
done
