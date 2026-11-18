#!/usr/bin/env bash
# Kiểm tra Veltra còn sống: backend GET /health phải 200, frontend không được trả lỗi / 5xx.
# Chạy mỗi 5 phút bởi veltra-healthcheck.timer, hoặc chạy tay:
#   bash ~/VeltraV2/deploy/healthcheck.sh
# Lỗi → ghi journald với priority err (tag veltra-health) và exit 1 (unit báo failed):
#   journalctl -t veltra-health -p err --since today
set -uo pipefail

API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:4000/health}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000/}"
DEPLOY_LOCK="/tmp/veltra-deploy.lock"

# Đang deploy (pm2 restart) thì bỏ qua lần này, tránh báo lỗi giả
if [[ -e "$DEPLOY_LOCK" ]] && ! flock -n "$DEPLOY_LOCK" true; then
  echo "Đang deploy, bỏ qua."
  exit 0
fi

problems=()

# Body /health chỉ có status / mongo / redis (không có thông tin nhạy cảm)
response=$(curl -s -m 10 -w $'\n%{http_code}' "$API_HEALTH_URL" || true)
api_code="${response##*$'\n'}"
api_body="${response%$'\n'*}"
[[ "$api_code" == "200" ]] || problems+=("backend ${API_HEALTH_URL} → ${api_code:-000} ${api_body:0:200}")

web_code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$WEB_URL" || true)
if [[ -z "$web_code" || "$web_code" == "000" || "$web_code" == 5* ]]; then
  problems+=("frontend ${WEB_URL} → ${web_code:-000}")
fi

if (( ${#problems[@]} > 0 )); then
  message="Veltra DOWN: $(IFS='; '; echo "${problems[*]}")"
  logger -t veltra-health -p user.err -- "$message" || true
  echo "$message" >&2
  exit 1
fi
echo "Veltra OK"
