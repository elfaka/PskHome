# Backend CLAUDE.md

Spring Boot 3 백엔드 개발 가이드. 루트 [`CLAUDE.md`](../CLAUDE.md)의 명령어와 함께 참고할 것.

## 모듈 구조

베이스 패키지: `kr.elfaka.lostark`

| 모듈 | 경로 | 역할 |
|------|------|------|
| `character` | `character/` | LostArk Open API 프록시 (Spring Cloud OpenFeign) |
| `jsonprettier` | `jsonprettier/` | JSON 포맷/압축 서비스 (stateless, 인증 불필요) |
| `pspost` | `pspost/` | PS 문제풀이 CRUD (JPA, MySQL, 인증 불필요) |
| `survey` | `survey/` | Google Forms/Sheets 연동 (OAuth2 Google 로그인 필요) |
| `config` | `config/SecurityConfig.java` | Spring Security 설정 |

각 모듈 패키지 구조: `controller/` → `service/` → `dto/` → `repository/` (필요 시) → `entity/` (JPA)

## 새 모듈 추가 패턴

```
src/main/java/kr/elfaka/lostark/
└── newmodule/
    ├── controller/NewModuleController.java   (@RestController, @RequestMapping("/api/newmodule/**"))
    ├── service/NewModuleService.java          (@Service)
    ├── dto/NewModuleRequestDto.java
    ├── dto/NewModuleResponseDto.java
    ├── entity/NewModuleEntity.java            (JPA 사용 시)
    └── repository/NewModuleRepository.java    (JPA 사용 시)
```

새 공개 경로 추가 시 `config/SecurityConfig.java`의 `permitAll()` 목록에 추가 필요.

## 보안 설정

**파일:** `config/SecurityConfig.java`

현재 `permitAll` 경로:
- `GET /api/ping`
- `GET /api/auth/me`
- `POST /api/json/**`
- `GET /api/json/**`
- `GET /api/posts/**`
- `POST /api/posts/**`
- `PUT /api/posts/**`
- `DELETE /api/posts/**`
- OAuth2 flow paths (`/api/oauth2/**`, `/api/login/oauth2/**`)

인증이 필요한 엔드포인트는 Google OAuth2 세션 로그인 후 접근 가능.

## 설정 파일 가이드

| 파일 | 프로파일 | 용도 |
|------|----------|------|
| `application.yaml` | (공통) | 기본 설정, `.env` import |
| `application-local.yaml` | `local` | 로컬 개발용 (MySQL 직접 연결, `ddl-auto: update`, `show-sql: true`) |
| `application-prod.yaml` | `prod` | 프로덕션 (env var 주입, Jasypt 암호화) |
| `src/test/resources/application-test.yaml` | `test` | 테스트용 (H2 인메모리, Redis 비활성화) |

## Jasypt 시크릿 암호화 (로컬 개발)

`application-local.yaml`의 LostArk API Key는 Jasypt로 암호화:
```yaml
cloud:
  openfeign:
    client:
      config:
        open-api:
          default-request-headers:
            Authorization: ENC(암호화된_값)
```

실행 시 환경변수 필요:
```bash
export JASYPT_ENCRYPTOR_PASSWORD=your_password
# 또는 backend/.env 파일에 JASYPT_ENCRYPTOR_PASSWORD=your_password
```

## 외부 API 연동

**LostArk Open API:**
- Feign 클라이언트: `character/feign/LostArkFeignClient.java`
- 서비스: `character/service/LostArkService.java`
- API 키는 `application-local.yaml`에 ENC() 암호화 저장

**Google Forms/Sheets:**
- OAuth2 client 설정: `application-local.yaml`의 `spring.security.oauth2.client.registration.google`
- 서비스: `survey/google/`, `survey/service/`

## 테스트 실행

```bash
# 전체 테스트 (H2 인메모리 사용, MySQL/Redis 불필요)
cd backend && ./gradlew test

# 모듈별 빠른 테스트 (변경한 모듈만 실행)
cd backend && ./gradlew test --tests "kr.elfaka.lostark.jsonprettier.*"
cd backend && ./gradlew test --tests "kr.elfaka.lostark.pspost.*"

# 단일 테스트 클래스
cd backend && ./gradlew test --tests "kr.elfaka.lostark.jsonprettier.service.JsonFormatServiceTest"

# 테스트 리포트 확인
open backend/build/reports/tests/test/index.html
```

**주의:** 모든 `@SpringBootTest` 테스트에는 반드시 `@ActiveProfiles("test")` 필요.
누락 시 MySQL/Redis 연결을 시도해 컨텍스트 로드 실패.

## 공통 실수 패턴

### 1. `@ActiveProfiles("test")` 누락

`@SpringBootTest` 사용 시 `@ActiveProfiles("test")` 없으면 MySQL/Redis 연결 시도 → 컨텍스트 로드 실패.

```java
// 올바른 패턴
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")  // ← 반드시 필요
@Transactional
class MyControllerTest { ... }
```

### 2. SecurityConfig `permitAll()` 누락

새 공개 엔드포인트 추가 시 `config/SecurityConfig.java`의 `permitAll()` 목록 업데이트 필수.
누락 시 테스트에서 401 Unauthorized 응답.

### 3. 새 모듈에 테스트 파일 누락

새 모듈 추가 시 반드시 service + controller 테스트 파일 생성:
```
src/test/java/kr/elfaka/lostark/{newmodule}/
├── service/NewModuleServiceTest.java    (Mockito 단위 테스트)
└── controller/NewModuleControllerTest.java (MockMvc 통합 테스트)
```

## 테스트 파일 위치

```
src/test/java/kr/elfaka/lostark/
├── BackendApplicationTests.java               (컨텍스트 로드 smoke test)
├── jsonprettier/
│   ├── service/JsonFormatServiceTest.java     (순수 단위 테스트)
│   └── controller/JsonFormatControllerTest.java (통합 테스트)
└── pspost/
    ├── service/PsPostServiceTest.java         (Mockito 단위 테스트)
    └── controller/PsPostControllerTest.java   (통합 테스트)

src/test/resources/
└── application-test.yaml                      (H2 인메모리 DB, Redis 비활성화)
```
