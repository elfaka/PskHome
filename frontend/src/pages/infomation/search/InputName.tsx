import { useState } from "react";
import SearchForm from "./SearchForm";
import CharacterInfo from "./CharacterInfo";
import Container from "@mui/material/Container";
import { CharacterInfoType } from "../../../types/CharacterInfo";
export default function InputName() {
  const [characterInfo, setCharacterInfo] = useState<null | CharacterInfoType>(
    null
  ); // API 결과 저장
  const [error, setError] = useState<string | null>(null); // 에러 메시지 저장

  const handleSearch = async (name: string) => {
    setError(null); // 에러 초기화
    setCharacterInfo(null); // 이전 결과 초기화

    try {
      const response = await fetch(`/api/lostark/character-info?name=${name}`);
      if (!response.ok) {
        throw new Error("API 호출 실패");
      }
      const data = await response.json();
      setCharacterInfo(data); // API 결과 저장
    } catch (err) {
      setError("API 호출 중 오류가 발생했습니다.");
    }
  };

  return (
    <Container
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <h1>캐릭터 정보 검색</h1>
      <SearchForm onSearch={handleSearch} />
      {error && <p style={{ color: "red", marginTop: "10px" }}>{error}</p>}
      <CharacterInfo characterInfo={characterInfo} />
    </Container>
  );
}
