#!/usr/bin/env bash
# Deploy Veltra từ nhánh main trên GitHub lên VM.
# Chạy định kỳ bởi veltra-deploy.timer, hoặc chạy tay:
#   bash ~/VeltraV2/deploy/deploy.sh          # chỉ deploy khi main có commit mới
#   bash ~/VeltraV2/deploy/deploy.sh --force  # deploy lại kể cả khi không có gì mới
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/tiendat07525/Veltra.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-$HOME/VeltraV2}"
STATE_FILE="$HOME/.veltra-deployed-sha"
FAILED_FILE="$HOME/.veltra-failed-sha"
LOCK_FILE="/tmp/veltra-deploy.lock"

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

# Không cho 2 lần deploy chạy chồng nhau
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Deploy khác đang chạy, bỏ qua."; exit 0; }

TARGET_SHA=$(git ls-remote "$REPO_URL" "refs/heads/$BRANCH" | cut -f1)
[[ -n "$TARGET_SHA" ]] || { echo "Không đọc được nhánh $BRANCH từ $REPO_URL" >&2; exit 1; }

CURRENT_SHA=$(cat "$STATE_FILE" 2>/dev/null || true)
FAILED_SHA=$(cat "$FAILED_FILE" 2>/dev/null || true)

if [[ $FORCE -eq 0 ]]; then
  [[ "$TARGET_SHA" == "$CURRENT_SHA" ]] && exit 0
  # Commit này đã deploy lỗi trước đó: không build lại mỗi 3 phút, chờ commit mới hoặc --force
  [[ "$TARGET_SHA" == "$FAILED_SHA" ]] && exit 0
fi

echo "Deploy $BRANCH @ ${TARGET_SHA:0:7} (đang chạy: ${CURRENT_SHA:0:7})"

on_error() {
  echo "$TARGET_SHA" > "$FAILED_FILE"
  echo "Deploy ${TARGET_SHA:0:7} THẤT BẠI" >&2
}
trap on_error ERR

BUILD_DIR=$(mktemp -d "$HOME/veltra-build.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT

git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$BUILD_DIR"
TARGET_SHA=$(git -C "$BUILD_DIR" rev-parse HEAD)

# NEXT_PUBLIC_* được ghi vào bundle lúc build nên frontend cần .env production
cp "$APP_DIR/frontend/.env" "$BUILD_DIR/frontend/.env"

echo "== Backend: install, test, build"
(cd "$BUILD_DIR/backend" && npm ci --no-audit --no-fund && npx jest --silent && npm run build)

echo "== Frontend: install, build"
(cd "$BUILD_DIR/frontend" && npm ci --no-audit --no-fund && npm run build)

# Chỉ tới đây khi test + build đều pass; .env trên VM không bị ghi đè hay xoá
echo "== Sync sang $APP_DIR"
rsync -a --delete --exclude '.git' --exclude '.env' "$BUILD_DIR/" "$APP_DIR/"

echo "== Restart app"
pm2 restart veltra-backend veltra-frontend --update-env
pm2 save

check_port() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$1/" || true)
  [[ "$code" != "000" && "$code" != 5* ]]
}

echo "== Health check"
healthy=0
for _ in $(seq 1 15); do
  if check_port 3000 && check_port 4000; then healthy=1; break; fi
  sleep 2
done
[[ $healthy -eq 1 ]] || { echo "App không phản hồi sau 30s"; false; }

echo "$TARGET_SHA" > "$STATE_FILE"
rm -f "$FAILED_FILE"
echo "Deploy ${TARGET_SHA:0:7} thành công"
