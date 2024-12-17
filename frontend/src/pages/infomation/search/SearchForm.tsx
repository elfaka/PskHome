import { useState } from "react";
import {
  TextField,
  InputAdornment,
  Box,
  CircularProgress,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

interface SearchFormProps {
  onResult: (data: any) => void; // 결과를 부모로 전달
}

export default function SearchForm({ onResult }: SearchFormProps) {
  const [name, setName] = useState(""); // 입력 필드 상태 관리
  const [error, setError] = useState<string | null>(null); // 에러 상태 관리
  const [isLoading, setIsLoading] = useState(false); // 로딩 상태 추가

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); // 에러 초기화
    setIsLoading(true); // 로딩 시작

    try {
      const response = await fetch(`/api/lostark/character-info?name=${name}`);
      if (!response.ok) {
        throw new Error("API 호출 실패");
      }
      const data = await response.json();
      onResult(data); // 부모 컴포넌트에 결과 전달
    } catch (err) {
      setError("캐릭터 정보가 없습니다."); // 에러 상태 업데이트
    } finally {
      setIsLoading(false); // 로딩 종료
    }
  };

  // Enter 키를 누르면 검색 실행
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) {
      handleSubmit(e);
    }
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        display: "flex",
        flexDirection: "column", // 세로 방향으로 배치
        alignItems: "center",
        gap: 2,
        width: 400,
        margin: "0 auto",
      }}
    >
      <h1>캐락터 정보 입력</h1>
      <TextField
        label="캐릭터 이름"
        variant="outlined"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown} // Enter 키 감지
        fullWidth
        required
        disabled={isLoading}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
      />

      {/* 에러 메시지는 입력 필드 아래에 위치 */}
      {error && (
        <Typography color="error" sx={{ marginTop: 1, textAlign: "center" }}>
          {error}
        </Typography>
      )}

      {/* 로딩 중일 때 스피너 표시 */}
      {isLoading && <CircularProgress size={24} sx={{ marginTop: 1 }} />}
    </Box>
  );
}
