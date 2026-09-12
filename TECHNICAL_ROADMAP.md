# mono flow 기술 로드맵

## 현재: 사용성 검증 MVP

| 영역 | 구현 | 목적 |
| --- | --- | --- |
| 프론트엔드 | React + Vite | 캠페인, 검토, 캘린더 사용성 검증 |
| 상태 | 브라우저 메모리 | API 키 없이 안전한 시연 |
| 콘텐츠 | 고정 예시 초안 | 작업 흐름과 승인 단계 검증 |
| 외부 발행 | 미연결 | SNS 계정·데이터를 변경하지 않음 |

## 1단계: 운영 가능한 MVP

- **Next.js + TypeScript**: 서버 렌더링, API 라우트, 타입 안정성
- **Supabase**: Auth, PostgreSQL, Row Level Security, Storage
- **OpenAI Responses API**: 구조화된 JSON 콘텐츠 생성과 프롬프트 버전 관리
- **OpenAI Images API 또는 이미지 파이프라인**: 이미지 콘셉트·생성. 실제 제품 사진 우선 원칙 유지
- **Zod**: 폼·AI 응답 스키마 검증
- **Sentry**: 오류 추적과 운영 진단
- **PostHog**: 익명화된 사용 흐름 분석

필수 데이터 모델은 `businesses`, `products`, `campaigns`, `content_drafts`, `approval_events`, `publish_jobs`, `social_accounts`입니다. 승인 이벤트에는 승인자, 시각, 콘텐츠 버전, 수정 사유를 기록합니다.

## 2단계: 안전한 자동화와 발행

- **n8n 또는 Trigger.dev**: 예약 실행, 재시도, 실패 알림
- **Meta Graph API / Instagram Content Publishing API**: OAuth 동의 후 Instagram Business 계정 발행
- **암호화된 토큰 저장소**: refresh token 회전, 권한 철회, 만료 감지
- **작업 큐**: BullMQ + Redis 또는 Supabase Queues. 중복 발행 방지 idempotency key 포함
- **감사 로그**: 생성, 편집, 승인, 예약, 발행, 실패 이력 기록

네이버 블로그는 일반 SaaS가 사용자를 대신해 글을 자동 게시할 수 있는 공식 API가 제공되지 않으므로, 원고 복사와 수동 발행 체크리스트를 기본 흐름으로 유지합니다. 도입 시점에는 공식 문서와 약관을 다시 확인해야 합니다.

## 3단계: 분석과 개인화

- **PostHog 또는 Amplitude**: 제품 사용 분석
- **Meta Insights API**: 승인된 계정의 도달·반응 성과 수집
- **BigQuery 또는 ClickHouse**: 고객 규모 확대 시 분석 저장소
- **추천 모델**: 성과와 브랜드 제약을 함께 반영하고, 추천 근거와 사용자 제어권 제공
- **A/B 테스트**: 문구·게시 시간 실험을 작은 범위에서 시작

## 보안·개인정보 기준

- OAuth token, API 키, 고객 연락처를 브라우저나 Git에 저장하지 않습니다.
- Supabase RLS로 사업장 데이터가 다른 사용자에게 보이지 않게 합니다.
- 외부 발행은 항상 최종 승인 콘텐츠의 불변 버전을 사용합니다.
- 이미지와 고객 데이터의 보관 기간, 삭제 요청, 접근 로그 정책을 마련합니다.
- 생성 모델에는 필요한 사업 정보만 전달하고 개인정보를 최소화합니다.

## 배포 전 체크리스트

1. 테스트 계정으로 OAuth·예약·재시도를 검증합니다.
2. 가격, 기간, 금지 표현, 빈 문구를 차단하는 규칙을 추가합니다.
3. 승인 없는 콘텐츠와 중복 작업이 발행되지 않는지 자동 테스트합니다.
4. 토큰 만료, API 제한, 예약 실패 시 운영자 알림과 재시도 정책을 확인합니다.
5. 개인정보 처리방침, 서비스 약관, 채널별 플랫폼 정책을 검토합니다.
