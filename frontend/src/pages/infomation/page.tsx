import Container from "@mui/material/Container";
import { useState } from "react";
import SearchForm from "./search/SearchForm";
import CharacterInfo from "./search/CharacterInfo";
import { ArmoryTotal } from "../../types/character/ArmoryTotal";

export default function Information() {
  const [ArmoryTotal, setArmoryTotal] = useState<null | ArmoryTotal>(null); // API 결과 저장

  const handleResult = (data: ArmoryTotal) => {
    setArmoryTotal(data); // API 결과 저장
  };

  return (
    <Container
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 10,
      }}
    >
      <SearchForm onResult={handleResult} />
      <CharacterInfo ArmoryTotal={ArmoryTotal} />
    </Container>
  );
}
