package kr.elfaka.lostark.character.service;

import kr.elfaka.lostark.character.dto.ArmoryTotalDto;
import kr.elfaka.lostark.character.feign.LostArkFeignClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service // 필수: Spring이 Bean으로 인식
@RequiredArgsConstructor
public class LostArkService {

    private final LostArkFeignClient lostArkFeignClient;

    public ArmoryTotalDto getCharacterInfo(String characterName) {
        return lostArkFeignClient.getCharacterInfo(characterName);
    }
}