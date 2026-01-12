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

    private com.google.api.client.http.HttpRequestInitializer initializer(String accessToken) {
        return request -> {
            credentialFromToken(accessToken).initialize(request);
            request.setConnectTimeout(30_000);
            request.setReadTimeout(30_000);
        };
    }

    private <T> T buildClient(OAuth2AuthenticationToken auth, ClientBuilder<T> builder) {
        try {
            String accessToken = getAccessToken(auth);
            var httpTransport = GoogleNetHttpTransport.newTrustedTransport();
            var jsonFactory = JacksonFactory.getDefaultInstance();
            return builder.build(httpTransport, jsonFactory, initializer(accessToken));
        } catch (Exception e) {
            throw new RuntimeException("Failed to create Google client", e);
        }
    }

    @FunctionalInterface
    private interface ClientBuilder<T> {
        T build(com.google.api.client.http.HttpTransport transport,
                com.google.api.client.json.JsonFactory jsonFactory,
                com.google.api.client.http.HttpRequestInitializer initializer);
    }

    public Drive drive(OAuth2AuthenticationToken auth) {
        return buildClient(auth, (t, j, i) ->
                new Drive.Builder(t, j, i).setApplicationName("Survey Analyzer").build()
        );
    }

    public Forms forms(OAuth2AuthenticationToken auth) {
        return buildClient(auth, (t, j, i) ->
                new Forms.Builder(t, j, i).setApplicationName("Survey Analyzer").build()
        );
    }

    public Sheets sheets(OAuth2AuthenticationToken auth) {
        return buildClient(auth, (t, j, i) ->
                new Sheets.Builder(t, j, i).setApplicationName("Survey Analyzer").build()
        );
    }
}
