import { Input, Button } from '@mui/base';
import { useState } from "react";

export default function InputName() {
    const [name, setName] = useState<string>(""); // Input 값 저장
    const [characterInfo, setCharacterInfo] = useState<null | object>(null); // API 결과 저장
    const [error, setError] = useState<string | null>(null); // 에러 메시지 저장

    const handleSearch = async () => {
        if (!name) {
            setError("캐릭터명을 입력해주세요.");
            return;
        }
        setError(null); // 에러 초기화

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
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '50vh',
                textAlign: 'center',
            }}
        >
            <h1>캐릭터 검색</h1>
            <Input
                type="text"
                placeholder="캐릭터명을 입력하세요."
                value={name}
                onChange={(e) => setName(e.target.value)}
                slotProps={{
                    root: {
                        style: {
                            marginBottom: '10px',
                            padding: '10px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            width: '300px',
                        },
                    },
                }}
            />
            <Button
                onClick={handleSearch}
                style={{
                    padding: '10px 20px',
                    backgroundColor: '#007BFF',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                }}
            >
                검색
            </Button>
            {error && <p style={{ color: 'red', marginTop: '10px' }}>{error}</p>}
            {characterInfo && (
                <div
                    style={{
                        marginTop: '20px',
                        textAlign: 'left',
                        display: 'inline-block',
                        maxHeight: '400px', // 최대 높이를 제한
                        overflow: 'auto', // 스크롤 활성화
                        padding: '10px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        width: '80%', // 너비도 적절하게 제한
                    }}
                >
                    <h2>검색 결과:</h2>
                    <pre style={{ backgroundColor: '#f4f4f4', padding: '10px', borderRadius: '4px' }}>
                        {JSON.stringify(characterInfo, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
