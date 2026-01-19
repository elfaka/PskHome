package kr.elfaka.lostark.survey.google;

import com.google.api.client.auth.oauth2.BearerToken;
import com.google.api.client.auth.oauth2.Credential;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.jackson2.JacksonFactory;
import com.google.api.services.drive.Drive;
import com.google.api.services.forms.v1.Forms;
import com.google.api.services.sheets.v4.Sheets;
import org.springframework.security.oauth2.client.*;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * GoogleClientFactory
 *
 * [역할]
 * - Spring Security OAuth2 로그인 이후,
 *   현재 로그인한 사용자의 Access Token을 꺼내서
 *   Google API Client(Drive/Forms/Sheets)를 생성하는 팩토리 컴포넌트
 *
 * [왜 Factory로 분리했나?]
 * - Google API Client 생성 로직(토큰 획득, Credential 세팅, 타임아웃 설정 등)을
 *   서비스 계층(FormsService/AnalyzeService)에서 반복하지 않기 위해
 * - 인증/토큰 저장 방식이 바뀌더라도 이 파일만 수정하면 되도록 추상화
 *
 * [주의]
 * - Access Token은 만료될 수 있다.
 *   Spring Security OAuth2 설정에 따라 refresh token을 통해 자동 갱신되기도 하지만,
 *   만약 만료/갱신 실패가 잦다면 OAuth2AuthorizedClientManager 기반으로 개선 가능.
 */
@Component
public class GoogleClientFactory {

    /**
     * OAuth2AuthorizedClientService
     *
     * - Spring Security가 사용자별 OAuth2AuthorizedClient(토큰 포함)를 저장하는 저장소
     * - auth 정보(registrationId + principalName)를 키로 Access Token을 로드할 수 있다.
     */
    private final OAuth2AuthorizedClientService authorizedClientService;

    public GoogleClientFactory(OAuth2AuthorizedClientService authorizedClientService) {
        this.authorizedClientService = authorizedClientService;
    }

    /**
     * 현재 로그인 사용자의 Access Token 추출
     *
     * @param auth OAuth2AuthenticationToken (로그인 컨텍스트)
     * @return access token 문자열
     *
     * [동작 방식]
     * - registrationId: google 같은 provider 식별자
     * - principalName: 로그인 사용자 식별 값
     * - authorizedClientService에서 AuthorizedClient를 꺼내 access token 반환
     */
    private String getAccessToken(OAuth2AuthenticationToken auth) {
        OAuth2AuthorizedClient client = authorizedClientService.loadAuthorizedClient(
                auth.getAuthorizedClientRegistrationId(),
                auth.getName()
        );

        if (client == null || client.getAccessToken() == null) {
            // 로그인은 되어있지만 authorized client를 못 찾는 상황은
            // 세션 문제/저장소 문제이므로 빠르게 fail-fast
            throw new IllegalStateException("No OAuth2 authorized client / access token found.");
        }

        return client.getAccessToken().getTokenValue();
    }

    /**
     * Google API Java Client에서 사용할 Credential 생성
     *
     * - BearerToken.authorizationHeaderAccessMethod()를 사용하면
     *   요청 시 Authorization: Bearer <token> 헤더를 붙이는 방식으로 동작한다.
     */
    private Credential credentialFromToken(String accessToken) {
        Credential credential = new Credential(BearerToken.authorizationHeaderAccessMethod());
        credential.setAccessToken(accessToken);
        return credential;
    }

    /**
     * HttpRequestInitializer 생성
     *
     * [역할]
     * - Google API Client가 요청을 만들 때마다
     *   1) 인증(Credential) 적용
     *   2) 타임아웃 설정
     *   을 공통으로 수행하게 한다.
     */
    private com.google.api.client.http.HttpRequestInitializer initializer(String accessToken) {
        return request -> {
            // ✅ 토큰을 통해 Credential 적용(Authorization 헤더 세팅)
            credentialFromToken(accessToken).initialize(request);

            // ✅ 외부 API 호출이므로 타임아웃 설정 (무한 대기 방지)
            request.setConnectTimeout(30_000);
            request.setReadTimeout(30_000);
        };
    }

    /**
     * 공통 클라이언트 빌드 메서드
     *
     * [동작]
     * 1) access token 확보
     * 2) Google HTTP Transport / JSON Factory 생성
     * 3) 특정 API(Drive/Forms/Sheets)에 맞는 Builder를 통해 Client 생성
     *
     * @param auth OAuth2AuthenticationToken
     * @param builder API별 Client Builder
     */
    private <T> T buildClient(OAuth2AuthenticationToken auth, ClientBuilder<T> builder) {
        try {
            String accessToken = getAccessToken(auth);

            // ✅ Google API Java Client가 권장하는 기본 Transport/Factory
            var httpTransport = GoogleNetHttpTransport.newTrustedTransport();
            var jsonFactory = JacksonFactory.getDefaultInstance();

            return builder.build(httpTransport, jsonFactory, initializer(accessToken));
        } catch (Exception e) {
            throw new RuntimeException("Failed to create Google client", e);
        }
    }

    /**
     * API별 Builder를 통일된 형태로 받기 위한 함수형 인터페이스
     *
     * - Drive.Builder, Forms.Builder, Sheets.Builder 등은 생성자 시그니처가 유사하다.
     * - 이를 공통 buildClient()에서 재사용하기 위해 도입.
     */
    @FunctionalInterface
    private interface ClientBuilder<T> {
        T build(com.google.api.client.http.HttpTransport transport,
                com.google.api.client.json.JsonFactory jsonFactory,
                com.google.api.client.http.HttpRequestInitializer initializer);
    }

    /**
     * Google Drive API Client 생성
     *
     * @param auth OAuth2AuthenticationToken
     * @return Drive client
     */
    public Drive drive(OAuth2AuthenticationToken auth) {
        return buildClient(auth, (t, j, i) ->
                new Drive.Builder(t, j, i)
                        .setApplicationName("Survey Analyzer")
                        .build()
        );
    }

    /**
     * Google Forms API Client 생성
     *
     * @param auth OAuth2AuthenticationToken
     * @return Forms client
     */
    public Forms forms(OAuth2AuthenticationToken auth) {
        return buildClient(auth, (t, j, i) ->
                new Forms.Builder(t, j, i)
                        .setApplicationName("Survey Analyzer")
                        .build()
        );
    }
}
/*
“OAuth2AuthorizedClientService에서 사용자별 Access Token을 가져와 Google API 클라이언트를 생성하는 팩토리를 분리했고,
타임아웃/인증 적용을 공통화해 서비스 로직이 Google 인증 구현을 몰라도 되게 설계했습니다.”
 */
