#!/usr/bin/env bash
# Centnarr A1 端到端测试：4 个新端点
set -e

BASE="http://127.0.0.1:8001/api"
PASS=0
FAIL=0

assert_eq() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  [PASS] $label  ($actual)"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] $label  expected=$expected actual=$actual"
    FAIL=$((FAIL+1))
  fi
}

assert_contains() {
  local label="$1"
  local actual="$2"
  local needle="$3"
  if echo "$actual" | grep -q -- "$needle"; then
    echo "  [PASS] $label  (contains '$needle')"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] $label  expected to contain '$needle' but got: $actual"
    FAIL=$((FAIL+1))
  fi
}

http_code() {
  curl -s -o /tmp/_body.json -w "%{http_code}" "$@"
}

echo "=================================================="
echo "Phase A: 创建 conversation + 发首条消息"
echo "=================================================="

CODE=$(http_code -X POST "$BASE/conversation/start" -H "Content-Type: application/json" -d '{"user_id":"tester"}')
assert_eq "T01 start returns 200" "$CODE" "200"
CONV_ID=$(python3 -c "import json; print(json.load(open('/tmp/_body.json'))['conversation_id'])")
echo "  conversation_id=$CONV_ID"

CODE=$(http_code -X POST "$BASE/conversation/message" \
  -H "Content-Type: application/json" \
  -d "{\"conversation_id\":\"$CONV_ID\",\"content\":\"我们仓库发货老是出问题，客户收到货对不上\",\"input_type\":\"text\"}")
assert_eq "T02 first message returns 200" "$CODE" "200"
python3 -c "
import json
d=json.load(open('/tmp/_body.json'))
print('  state:', d['state'], '| round:', d['round'], '| completion:', d['completion'])
print('  doc.background:', d['doc']['background'][:50])
print('  pain_points count:', len(d['doc']['pain_points']))
print('  roles count:', len(d['doc']['roles']))
"

echo ""
echo "=================================================="
echo "Phase B: PATCH /api/conversation/{id}/doc  (4 个场景)"
echo "=================================================="

# 场景 1: 顶层字段 background
CODE=$(http_code -X PATCH "$BASE/conversation/$CONV_ID/doc" \
  -H "Content-Type: application/json" \
  -d '{"field_path":"background","value":"【已编辑】仓库每天发货 200+ 单，错发率约 3%"}')
assert_eq "B1 PATCH background (顶层字段) 200" "$CODE" "200"
BG=$(python3 -c "import json; print(json.load(open('/tmp/_body.json'))['doc']['background'])")
assert_contains "B1 background 被更新" "$BG" "已编辑"
COMP=$(python3 -c "import json; print(json.load(open('/tmp/_body.json'))['completion'])")
echo "  completion after B1 = $COMP"
VER1=$(python3 -c "import json; print(json.load(open('/tmp/_body.json'))['version_id'])")
echo "  version_id(B1) = $VER1"

# 场景 2: 数组字段 pain_points[0].description
CODE=$(http_code -X PATCH "$BASE/conversation/$CONV_ID/doc" \
  -H "Content-Type: application/json" \
  -d '{"field_path":"pain_points[0].description","value":"【业务纠正】客户收到的是别人家的货，型号规格对不上"}')
assert_eq "B2 PATCH pain_points[0].description (数组字段) 200" "$CODE" "200"
PP=$(python3 -c "import json; print(json.load(open('/tmp/_body.json'))['doc']['pain_points'][0]['description'])")
assert_contains "B2 pain_points[0].description 被更新" "$PP" "业务纠正"
VER2=$(python3 -c "import json; print(json.load(open('/tmp/_body.json'))['version_id'])")
if [ "$VER1" != "$VER2" ]; then
  echo "  [PASS] B2 创建了新 doc_version  ($VER1 -> $VER2)"
  PASS=$((PASS+1))
else
  echo "  [FAIL] B2 没创建新 doc_version"
  FAIL=$((FAIL+1))
fi

# 场景 3: 错误 field_path 应返回 422
CODE=$(http_code -X PATCH "$BASE/conversation/$CONV_ID/doc" \
  -H "Content-Type: application/json" \
  -d '{"field_path":"!!!非法路径!!!","value":"x"}')
assert_eq "B3 PATCH 非法 field_path 返回 422" "$CODE" "422"
DETAIL=$(python3 -c "import json; print(json.load(open('/tmp/_body.json'))['detail'])")
assert_contains "B3 错误 detail 含说明" "$DETAIL" "field_path 非法"

# 场景 4: 404
CODE=$(http_code -X PATCH "$BASE/conversation/notexist/doc" \
  -H "Content-Type: application/json" \
  -d '{"field_path":"background","value":"x"}')
assert_eq "B4 PATCH 不存在的 conversation 返回 404" "$CODE" "404"

echo ""
echo "=================================================="
echo "Phase C: POST upload (5 个场景)"
echo "=================================================="

# 场景 1: 上传文本文件
echo "测试需求：仓库管理员反馈原始邮件内容" > /tmp/test_upload.txt
CODE=$(http_code -X POST "$BASE/conversation/$CONV_ID/upload" \
  -F "file=@/tmp/test_upload.txt;type=text/plain")
assert_eq "C1 upload text/plain 200" "$CODE" "200"
EX=$(python3 -c "import json; d=json.load(open('/tmp/_body.json')); print(d['extracted_text'] or '')")
assert_contains "C1 extracted_text 含原文" "$EX" "测试需求"
SIZE=$(python3 -c "import json; print(json.load(open('/tmp/_body.json'))['size'])")
echo "  size=$SIZE"
FILE_ID_1=$(python3 -c "import json; print(json.load(open('/tmp/_body.json'))['file_id'])")

# 场景 2: 上传 png 图片
head -c 200 /dev/urandom > /tmp/fake.png
CODE=$(http_code -X POST "$BASE/conversation/$CONV_ID/upload" \
  -F "file=@/tmp/fake.png;type=image/png")
assert_eq "C2 upload image/png 200" "$CODE" "200"
FT=$(python3 -c "import json; print(json.load(open('/tmp/_body.json'))['file_type'])")
assert_eq "C2 file_type=image/png" "$FT" "image/png"
EX2=$(python3 -c "import json; d=json.load(open('/tmp/_body.json')); print(d['extracted_text'] is None)")
assert_eq "C2 图片 extracted_text 应为 None" "$EX2" "True"

# 场景 3: 不支持类型
echo "exe" > /tmp/test.exe
CODE=$(http_code -X POST "$BASE/conversation/$CONV_ID/upload" \
  -F "file=@/tmp/test.exe;type=application/octet-stream")
assert_eq "C3 upload 不支持 mime 返回 415" "$CODE" "415"

# 场景 4: 不存在的 conversation
CODE=$(http_code -X POST "$BASE/conversation/nope/upload" \
  -F "file=@/tmp/test_upload.txt;type=text/plain")
assert_eq "C4 upload 不存在的 conversation 返回 404" "$CODE" "404"

# 场景 5: 6MB 超过上限
dd if=/dev/zero of=/tmp/big.txt bs=1024 count=6144 2>/dev/null
CODE=$(http_code -X POST "$BASE/conversation/$CONV_ID/upload" \
  -F "file=@/tmp/big.txt;type=text/plain")
assert_eq "C5 upload 6MB 文件返回 413" "$CODE" "413"

echo ""
echo "=================================================="
echo "Phase D: confirm -> generate PRD -> PATCH prd (6 个场景)"
echo "=================================================="

# 先补几轮回答，让 completion 达到 80
for i in 1 2 3 4; do
  curl -s -X POST "$BASE/conversation/respond" \
    -H "Content-Type: application/json" \
    -d "{\"conversation_id\":\"$CONV_ID\",\"content\":\"补充: 现在出错后由仓库主管人工处理 1-2 小时，影响发货时效\",\"input_type\":\"text\"}" >/dev/null
done
STATE=$(curl -s "$BASE/conversation/$CONV_ID" | python3 -c "import json,sys; print(json.load(sys.stdin)['state'])")
COMP=$(curl -s "$BASE/conversation/$CONV_ID" | python3 -c "import json,sys; print(json.load(sys.stdin)['completion'])")
echo "  before confirm: state=$STATE completion=$COMP"

CODE=$(http_code -X POST "$BASE/conversation/confirm" \
  -H "Content-Type: application/json" \
  -d "{\"conversation_id\":\"$CONV_ID\"}")
assert_eq "D1 confirm 200" "$CODE" "200"

CODE=$(http_code -X POST "$BASE/prd/generate" \
  -H "Content-Type: application/json" \
  -d "{\"conversation_id\":\"$CONV_ID\"}")
assert_eq "D2 generate prd 200" "$CODE" "200"
PRD_ID=$(python3 -c "import json; print(json.load(open('/tmp/_body.json'))['prd_id'])")
echo "  prd_id=$PRD_ID"

# 场景 1: 修改 PRD content，版本应自增 v1.0 -> v1.1
CODE=$(http_code -X PATCH "$BASE/prd/$PRD_ID" \
  -H "Content-Type: application/json" \
  -d '{"content":"# PRD: 仓库发货纠错（v1.1 修订）\n\n## 修订内容\n\n- 错误处理流程已更新\n"}')
assert_eq "D3 PATCH prd 200" "$CODE" "200"
NEW_VER=$(python3 -c "import json; print(json.load(open('/tmp/_body.json'))['version'])")
assert_eq "D3 prd version 自增 v1.0 -> v1.1" "$NEW_VER" "v1.1"

# 场景 2: 再修改一次，版本 v1.1 -> v1.2
CODE=$(http_code -X PATCH "$BASE/prd/$PRD_ID" \
  -H "Content-Type: application/json" \
  -d '{"content":"# PRD: 仓库发货纠错 v1.2"}')
assert_eq "D4 PATCH prd 第二次 200" "$CODE" "200"
V2=$(python3 -c "import json; print(json.load(open('/tmp/_body.json'))['version'])")
assert_eq "D4 prd version v1.1 -> v1.2" "$V2" "v1.2"

# 场景 3: 空 content 应 422
CODE=$(http_code -X PATCH "$BASE/prd/$PRD_ID" \
  -H "Content-Type: application/json" \
  -d '{"content":"   "}')
assert_eq "D5 PATCH prd 空 content 422" "$CODE" "422"

# 场景 4: 不存在 prd
CODE=$(http_code -X PATCH "$BASE/prd/nope" \
  -H "Content-Type: application/json" \
  -d '{"content":"x"}')
assert_eq "D6 PATCH prd 不存在 404" "$CODE" "404"

echo ""
echo "=================================================="
echo "Phase E: PATCH /api/prd/{id}/acceptance (3 个场景)"
echo "=================================================="

# 场景 1: 勾选
CODE=$(http_code -X PATCH "$BASE/prd/$PRD_ID/acceptance" \
  -H "Content-Type: application/json" \
  -d '{"checks":{"check-1":true,"check-2":false,"check-3":true}}')
assert_eq "E1 PATCH acceptance 200" "$CODE" "200"
C1=$(python3 -c "import json; d=json.load(open('/tmp/_body.json')); print(d['acceptance_state'].get('check-1'))")
C2=$(python3 -c "import json; d=json.load(open('/tmp/_body.json')); print(d['acceptance_state'].get('check-2'))")
C3=$(python3 -c "import json; d=json.load(open('/tmp/_body.json')); print(d['acceptance_state'].get('check-3'))")
assert_eq "E1 check-1=true" "$C1" "True"
assert_eq "E1 check-2=false" "$C2" "False"
assert_eq "E1 check-3=true" "$C3" "True"

# 场景 2: 增量更新（只传 check-2=true）
CODE=$(http_code -X PATCH "$BASE/prd/$PRD_ID/acceptance" \
  -H "Content-Type: application/json" \
  -d '{"checks":{"check-2":true,"check-4":true}}')
assert_eq "E2 PATCH acceptance 增量更新 200" "$CODE" "200"
C1V=$(python3 -c "import json; d=json.load(open('/tmp/_body.json')); print(d['acceptance_state'].get('check-1'))")
C2V=$(python3 -c "import json; d=json.load(open('/tmp/_body.json')); print(d['acceptance_state'].get('check-2'))")
C4V=$(python3 -c "import json; d=json.load(open('/tmp/_body.json')); print(d['acceptance_state'].get('check-4'))")
assert_eq "E2 check-1 保留 true" "$C1V" "True"
assert_eq "E2 check-2 翻转为 true" "$C2V" "True"
assert_eq "E2 check-4 新增 true" "$C4V" "True"

# 场景 3: 不存在 prd
CODE=$(http_code -X PATCH "$BASE/prd/nope/acceptance" \
  -H "Content-Type: application/json" \
  -d '{"checks":{"x":true}}')
assert_eq "E3 PATCH acceptance 不存在 prd 404" "$CODE" "404"

echo ""
echo "=================================================="
echo "汇总: $PASS PASSED, $FAIL FAILED"
echo "=================================================="
exit $FAIL
