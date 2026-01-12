package kr.elfaka.lostark.survey.dto;

import java.util.List;

public record ResponsePreviewDto(
        String formId,
        String formTitle,
        String spreadsheetId,
        String spreadsheetName,
        List<List<String>> rows
) {}
