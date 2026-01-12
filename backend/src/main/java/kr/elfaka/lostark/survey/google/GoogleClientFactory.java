package kr.elfaka.lostark.survey.google;

import com.google.api.client.auth.oauth2.BearerToken;
import com.google.api.client.auth.oauth2.Credential;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.jackson2.JacksonFactory;
import com.google.api.services.drive.Drive;
import org.springframework.security.oauth2.client.*;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.stereotype.Component;

@Component
public class GoogleClientFactory {

    private final OAuth2AuthorizedClientService authorizedClientService;

    public GoogleClientFactory(OAuth2AuthorizedClientService authorizedClientService) {
        this.authorizedClientService = authorizedClientService;
    }

    private String getAccessToken(OAuth2AuthenticationToken auth) {
        OAuth2AuthorizedClient client = authorizedClientService.loadAuthorizedClient(
                auth.getAuthorizedClientRegistrationId(),
                auth.getName()
        );
        if (client == null || client.getAccessToken() == null) {
            throw new IllegalStateException("No OAuth2 authorized client / access token found.");
        }
        return client.getAccessToken().getTokenValue();
    }

    private Credential credentialFromToken(String accessToken) {
        Credential credential = new Credential(BearerToken.authorizationHeaderAccessMethod());
        credential.setAccessToken(accessToken);
        return credential;
    }

    public Drive drive(OAuth2AuthenticationToken auth) {
        try {
            String accessToken = getAccessToken(auth);
            var httpTransport = GoogleNetHttpTransport.newTrustedTransport();
            var jsonFactory = JacksonFactory.getDefaultInstance();

            return new Drive.Builder(
                    httpTransport,
                    jsonFactory,
                    request -> {
                        credentialFromToken(accessToken).initialize(request);
                        request.setConnectTimeout(30_000);
                        request.setReadTimeout(30_000);
                    }
            ).setApplicationName("Survey Analyzer").build();

        } catch (Exception e) {
            throw new RuntimeException("Failed to create Drive client", e);
        }
    }
}
