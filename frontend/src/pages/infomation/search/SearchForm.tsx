import { Input, Button } from "@mui/base";
import { useState } from "react";

interface SearchFormProps {
  onSearch: (name: string) => void;
}

export default function SearchForm({ onSearch }: SearchFormProps) {
  const [name, setName] = useState<string>(""); // Input 값 저장
  const [error, setError] = useState<string | null>(null); // 에러 메시지 저장

  const handleSearch = () => {
    if (!name.trim()) {
      setError("캐릭터명을 입력해주세요.");
      return;
    }
    setError(null); // 에러 초기화
    onSearch(name); // 상위 컴포넌트로 검색 요청 전달
  };

  return (
    <div style={{ textAlign: "center" }}>
      <Input
        type="text"
        placeholder="캐릭터명을 입력하세요."
        value={name}
        onChange={(e) => setName(e.target.value)}
        slotProps={{
          root: {
            style: {
              marginBottom: "10px",
              padding: "10px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              width: "300px",
            },
          },
        }}
      />
      <Button
        onClick={handleSearch}
        style={{
          padding: "10px 20px",
          backgroundColor: "#007BFF",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        검색
      </Button>
      {error && <p style={{ color: "red", marginTop: "10px" }}>{error}</p>}
    </div>
  );
}
