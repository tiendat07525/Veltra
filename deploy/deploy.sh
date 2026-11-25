#!/usr/bin/env bash
# Deploy Veltra từ nhánh main trên GitHub lên VM.
# Chạy định kỳ bởi veltra-deploy.timer, hoặc chạy tay:
#   bash ~/VeltraV2/deploy/deploy.sh          # chỉ deploy khi main có commit mới
#   bash ~/VeltraV2/deploy/deploy.sh --force  # deploy lại kể cả khi không có gì mới
# Lỗi sau khi đã đụng vào APP_DIR → tự quay lại bản trước (PREV_DIR).
#   touch ~/.veltra-no-rollback   # tắt tự quay lại (trước khi deploy đổi schema / backfill)
set -euo pipefail
# Bash đọc script dần dần: gói trong { … } để đọc hết trước khi chạy (rsync thay chính file này)
{

REPO_URL="${REPO_URL:-https://github.com/tiendat07525/Veltra.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-$HOME/VeltraV2}"
# Bản trước (không có .env); cùng filesystem với APP_DIR để dùng hardlink
PREV_DIR="${PREV_DIR:-$HOME/veltra-prev}"
STATE_FILE="$HOME/.veltra-deployed-sha"
FAILED_FILE="$HOME/.veltra-failed-sha"
# Tồn tại = APP_DIR đang / có thể đang dở dang, bản tốt nằm ở PREV_DIR
MARKER_FILE="$HOME/.veltra-deploying"
HOLD_FILE="$HOME/.veltra-no-rollback"
LOCK_FILE="${LOCK_FILE:-/tmp/veltra-deploy.lock}"

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

# Không cho 2 lần deploy chạy chồng nhau
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Deploy khác đang chạy, bỏ qua."; exit 0; }

log_err() {
  echo "$1" >&2
  logger -t veltra-deploy -p user.err -- "$1" || true
}

# .env trên VM không bị ghi đè hay xoá
sync_dir() {
  rsync -a --delete --exclude '.git' --exclude '.env' "$1/" "$2/"
}

restart_app() {
  pm2 restart veltra-backend veltra-frontend --update-env
}

check_port() {
  local code
  code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:$1/" || true)
  [[ -n "$code" && "$code" != "000" && "$code" != 5* ]]
}

# Backend: GET /health = 200 only when MongoDB and Redis both answer
check_backend() {
  [[ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:4000/health" || true)" == "200" ]]
}

wait_healthy() {
  for _ in $(seq 1 15); do
    if check_port 3000 && check_backend; then return 0; fi
    sleep 2
  done
  return 1
}

# Backend đang chạy báo MongoDB / Redis chết (không phải lỗi của commit mới)
deps_down() {
  [[ "$(curl -s -m 10 "http://127.0.0.1:4000/health" || true)" =~ \"(mongo|redis)\":\"down\" ]]
}

# Luôn gọi trong `if` (set -e không có tác dụng) nên mỗi bước tự `|| return 1`.
# MARKER_FILE chỉ bị xoá khi file đã khôi phục xong và pm2 restart được.
rollback() {
  [[ -d "$PREV_DIR" ]] || { log_err "Không có $PREV_DIR để quay lại"; return 1; }
  echo "== Quay lại bản trước từ $PREV_DIR"
  sync_dir "$PREV_DIR" "$APP_DIR" || return 1
  sync
  restart_app || return 1
  rm -f "$MARKER_FILE" || return 1
  wait_healthy
}

# Lần trước bị ngắt sau khi đụng vào APP_DIR (VM tắt, timeout) hoặc quay lại không xong
if [[ -e "$MARKER_FILE" ]]; then
  if [[ -e "$HOLD_FILE" ]]; then
    echo "APP_DIR dở dang nhưng có $HOLD_FILE: không quay lại."
  elif rollback; then
    log_err "Lần deploy trước dở dang: đã quay lại bản trước."
  elif [[ -e "$MARKER_FILE" ]]; then
    log_err "Lần deploy trước dở dang và KHÔNG quay lại được, cần xử lý tay."
    [[ $FORCE -eq 1 ]] || exit 1
  else
    log_err "Đã quay lại bản trước nhưng app chưa khoẻ."
  fi
fi

TARGET_SHA=$(git ls-remote "$REPO_URL" "refs/heads/$BRANCH" | cut -f1)
[[ -n "$TARGET_SHA" ]] || { echo "Không đọc được nhánh $BRANCH từ $REPO_URL" >&2; exit 1; }

CURRENT_SHA=$(cat "$STATE_FILE" 2>/dev/null || true)
FAILED_SHA=$(cat "$FAILED_FILE" 2>/dev/null || true)

if [[ $FORCE -eq 0 ]]; then
  [[ "$TARGET_SHA" == "$CURRENT_SHA" ]] && exit 0
  # Commit này đã deploy lỗi trước đó: không build lại mỗi 3 phút, chờ commit mới hoặc --force
  [[ "$TARGET_SHA" == "$FAILED_SHA" ]] && exit 0
  if deps_down; then
    echo "MongoDB / Redis đang lỗi, hoãn deploy ${TARGET_SHA:0:7}." >&2
    exit 1
  fi
fi

# Thư mục build sót lại khi VM tắt giữa chừng (đang giữ lock nên không ai dùng)
rm -rf "$HOME"/veltra-build.??????

# Cần chỗ cho bản build và phần chênh giữa hai bản
need_kb=$(( $(du -sk "$APP_DIR" | cut -f1) * 2 + 512 * 1024 ))
free_kb=$(df -Pk "$HOME" | awk 'NR==2 {print $4}')
if (( free_kb < need_kb )); then
  log_err "Không đủ đĩa để deploy: cần $((need_kb / 1024)) MB, còn $((free_kb / 1024)) MB"
  exit 1
fi

echo "Deploy $BRANCH @ ${TARGET_SHA:0:7} (đang chạy: ${CURRENT_SHA:0:7})"

BUILD_DIR=""
on_error() {
  trap - ERR
  echo "$TARGET_SHA" > "$FAILED_FILE" || true
  log_err "Deploy ${TARGET_SHA:0:7} THẤT BẠI"
  # Chưa đụng vào APP_DIR (lỗi lúc clone / test / build)
  if [[ ! -e "$MARKER_FILE" ]]; then return 0; fi
  if [[ -e "$HOLD_FILE" ]]; then
    log_err "Có $HOLD_FILE: giữ nguyên bản lỗi, không quay lại."
    return 0
  fi
  # Trả lại đĩa trước khi khôi phục
  rm -rf "$BUILD_DIR" || true
  if rollback; then
    log_err "Đã quay lại bản ${CURRENT_SHA:0:7}"
  elif [[ -e "$MARKER_FILE" ]]; then
    log_err "Quay lại bản ${CURRENT_SHA:0:7} KHÔNG xong, lần chạy sau sẽ thử lại"
  else
    log_err "Đã quay lại bản ${CURRENT_SHA:0:7} nhưng app vẫn lỗi (kiểm tra MongoDB / Redis / pm2)"
  fi
}

BUILD_DIR=$(mktemp -d "$HOME/veltra-build.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT

# Lỗi mạng lúc clone không phải lỗi của commit: không ghi FAILED_FILE, lần sau thử lại
git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$BUILD_DIR"
TARGET_SHA=$(git -C "$BUILD_DIR" rev-parse HEAD)
trap on_error ERR

# NEXT_PUBLIC_* được ghi vào bundle lúc build nên frontend cần .env production
cp "$APP_DIR/frontend/.env" "$BUILD_DIR/frontend/.env"

echo "== Backend: install, test, build"
(cd "$BUILD_DIR/backend" && npm ci --no-audit --no-fund && npx jest --silent && npm run build)

echo "== Frontend: install, build"
(cd "$BUILD_DIR/frontend" && npm ci --no-audit --no-fund && npm run build)

# Chỉ tới đây khi test + build đều pass. Đang dở dang thì PREV_DIR mới là bản tốt: không chụp đè
if [[ ! -e "$MARKER_FILE" ]]; then
  echo "== Giữ bản đang chạy ở $PREV_DIR"
  rm -rf "$PREV_DIR.partial"
  # Hardlink: không copy dữ liệu; rsync sau đó thay file bằng rename nên bản này không đổi
  rsync -a --link-dest="$APP_DIR" --exclude '.git' --exclude '.env' "$APP_DIR/" "$PREV_DIR.partial/"
  rm -rf "$PREV_DIR"
  mv "$PREV_DIR.partial" "$PREV_DIR"
  sync
fi
echo "$TARGET_SHA" > "$MARKER_FILE"
sync

echo "== Sync sang $APP_DIR"
sync_dir "$BUILD_DIR" "$APP_DIR" || { echo "rsync lỗi" >&2; false; }

echo "== Restart app"
restart_app || { echo "pm2 restart lỗi" >&2; false; }

echo "== Health check"
wait_healthy || { echo "App không phản hồi sau 15 lần kiểm tra" >&2; false; }

# Xoá marker trước: nếu tắt máy giữa 2 dòng thì chỉ deploy lại cùng commit, không rollback nhầm
rm -f "$MARKER_FILE"
echo "$TARGET_SHA" > "$STATE_FILE"
rm -f "$FAILED_FILE"
trap - ERR
pm2 save || log_err "pm2 save lỗi (app vẫn chạy)"
echo "Deploy ${TARGET_SHA:0:7} thành công"
exit 0
}
