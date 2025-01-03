package kr.elfaka.lostark.character.feign;

import kr.elfaka.lostark.character.dto.ArmoryTotalDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@FeignClient(name = "open-api")
public interface LostArkFeignClient {
    // Feign 메서드 정의
    @GetMapping("/armories/characters/{characterName}")
    ArmoryTotalDto getCharacterInfo(
            @PathVariable("characterName") String characterName // 경로 변수 매핑
    );
}
