package kr.elfaka.lostark.survey.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    @Value("${app.login-success-redirect}")
    private String loginSuccessRedirect;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())

                .authorizeHttpRequests(auth -> auth
                        // 인증 없이 접근 허용
                        .requestMatchers(
                                "/api/ping",
                                "/api/auth/me",
                                "/error",
                                "/api/oauth2/**",             // ✅ 변경: oauth2 시작 경로 허용
                                "/api/login/oauth2/**"        // ✅ 변경: oauth2 콜백 경로 허용
                        ).permitAll()

                        // 앞으로 만들 API는 로그인 필요
                        .requestMatchers("/api/**").authenticated()

                        // 그 외는 일단 허용(프론트 붙이기 전)
                        .anyRequest().permitAll()
                )

                .oauth2Login(oauth -> oauth
                        // ✅ 변경: 로그인 시작 URL을 /api/oauth2/authorization/{registrationId} 로
                        .authorizationEndpoint(a -> a.baseUri("/api/oauth2/authorization"))
                        // ✅ 변경: 구글 콜백 처리 URL을 /api/login/oauth2/code/{registrationId} 로
                        .redirectionEndpoint(r -> r.baseUri("/api/login/oauth2/code/*"))
                        // 로그인 성공 후 이동
                        .defaultSuccessUrl(loginSuccessRedirect, true)
                )

                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .invalidateHttpSession(true)
                        .clearAuthentication(true)
                        .deleteCookies("JSESSIONID")
                );

        return http.build();
    }
}
