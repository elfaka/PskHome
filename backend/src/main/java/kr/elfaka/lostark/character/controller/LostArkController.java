package kr.elfaka.lostark.character.controller;

import kr.elfaka.lostark.character.dto.ArmoryTotalDto;
import kr.elfaka.lostark.character.service.LostArkService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PathVariable;

@RestController
@RequiredArgsConstructor // 필수: final 필드의 생성자를 자동 생성
public class LostArkController {

    private final LostArkService lostArkService;

    @GetMapping("/api/character/{characterName}")
    public ArmoryTotalDto getCharacterInfo(@PathVariable("characterName") String characterName) {
        return lostArkService.getCharacterInfo(characterName);

    }
}