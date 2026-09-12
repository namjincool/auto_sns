# mono flow — secure local SNS operations pilot

콘텐츠 운영을 위한 로컬 개발 파일럿입니다. 캠페인 생성, 지속 저장, 계정 세션, 안전한 로컬 초안, 사람 승인, 일정 대기 및 간단한 분석 카운터를 제공합니다.

외부 AI 호출, 실제 SNS OAuth, 자동 게시, 실계정 데이터 수집은 구현하거나 설정하지 않았습니다. 이 프로젝트는 프로덕션 배포본이 아닙니다.

## 실행

```powershell
npm install

# 터미널 1
$env:DEV_LOCAL_AI='true'
npm run api

# 터미널 2
npm run dev
```

브라우저에서 Vite가 안내하는 주소(일반적으로 `http://127.0.0.1:5173`)를 엽니다.

## 검증

```powershell
npm run test:api
npm run build
```

## 주요 안전 경계

- 비밀번호는 Salted `scrypt` 해시만 저장하고, 세션은 `HttpOnly`/`SameSite=Strict` 쿠키로 처리합니다.
- API 키와 OAuth 토큰을 프런트엔드나 데이터 파일에 저장하지 않습니다.
- 캠페인 데이터는 소유자별로 제한하며, 변경 요청은 동일 출처·입력 검증·요청 크기·속도 제한을 거칩니다.
- 초안은 승인 전 일정 등록이 거부됩니다. 기본 워커는 외부 발행 기능이 없어 작업을 안전하게 보류합니다.
- `.local-data/`와 `.env`는 Git에서 제외됩니다.

세부 실행/복구: [SERVICE_RUNBOOK.md](SERVICE_RUNBOOK.md) · 데이터: [DB_SCHEMA.md](DB_SCHEMA.md) · 보안과 출시 전 요건: [SECURITY.md](SECURITY.md) · 사용 흐름: [USER_MANUAL.md](USER_MANUAL.md)
