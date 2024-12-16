interface CharacterInfoProps {
  characterInfo: object | null;
}

export default function CharacterInfo({ characterInfo }: CharacterInfoProps) {
  if (!characterInfo) return null;

  return (
    <div
      style={{
        marginTop: "20px",
        textAlign: "left",
        display: "inline-block",
        maxHeight: "500px",
        overflow: "auto",
        padding: "10px",
        border: "1px solid #ccc",
        borderRadius: "4px",
        width: "80%",
      }}
    >
      <h2>검색 결과:</h2>
      <pre
        style={{
          backgroundColor: "#f4f4f4",
          padding: "10px",
          borderRadius: "4px",
        }}
      >
        {JSON.stringify(characterInfo, null, 2)}
      </pre>
    </div>
  );
}
