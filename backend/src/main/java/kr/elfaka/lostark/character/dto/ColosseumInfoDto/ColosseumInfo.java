package kr.elfaka.lostark.character.dto.ColosseumInfoDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;

@Data
public class ColosseumInfo {

    @JsonProperty("Rank")
    private int rank;  // 현재 랭크

    @JsonProperty("PreRank")
    private int preRank;  // 이전 랭크

    @JsonProperty("Exp")
    private int exp;  // 경험치

    @JsonProperty("Colosseums")
    private List<Colosseum> colosseums;  // 시즌별 Colosseum 정보 배열
}
