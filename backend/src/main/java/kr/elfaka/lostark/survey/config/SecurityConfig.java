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
                        // ✅ 인증 없이 접근 허용
                        .requestMatchers(
                                "/api/ping",
                                "/api/auth/me",
                                "/error",
                                "/oauth2/**",
                                "/login/**"
                        ).permitAll()

                        // ✅ 앞으로 만들 API는 로그인 필요
                        .requestMatchers("/api/**").authenticated()

                        // 그 외는 일단 허용(프론트 붙이기 전)
                        .anyRequest().permitAll()
                )

                .oauth2Login(oauth -> oauth
                        .defaultSuccessUrl(loginSuccessRedirect, true)
                )

                // ✅ 로그아웃 엔드포인트 제공
                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .invalidateHttpSession(true)
                        .clearAuthentication(true)
                        .deleteCookies("JSESSIONID")
                );

        return http.build();
    }
}
