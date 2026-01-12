package kr.elfaka.lostark.survey.service;

import kr.elfaka.lostark.survey.dto.FormListItemDto;
import kr.elfaka.lostark.survey.google.GoogleClientFactory;
import com.google.api.services.drive.model.FileList;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class FormsService {

    private final GoogleClientFactory google;

    public FormsService(GoogleClientFactory google) {
        this.google = google;
    }

    public List<FormListItemDto> listMyForms(OAuth2AuthenticationToken auth) {
        try {
            var drive = google.drive(auth);

            String q = "mimeType='application/vnd.google-apps.form' and trashed=false";

            FileList list = drive.files().list()
                    .setQ(q)
                    .setFields("files(id,name,modifiedTime)")
                    .setPageSize(50)
                    .execute();

            if (list.getFiles() == null) return List.of();

            return list.getFiles().stream()
                    .map(f -> new FormListItemDto(
                            f.getId(),
                            f.getName(),
                            f.getModifiedTime() == null ? null : f.getModifiedTime().toStringRfc3339()
                    ))
                    .toList();

        } catch (Exception e) {
            throw new RuntimeException("Failed to list Google Forms from Drive", e);
        }
    }
}
