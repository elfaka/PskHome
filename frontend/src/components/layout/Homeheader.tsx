import elfaka from "../../assets/elfaka.png";
import github from "../../assets/github.svg";

export default function Homeheader() {
  return (
    <div
      style={{
        padding: "10px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <a href="/" style={{ textDecoration: "none", display: "inline-block" }}>
        <img
          src={elfaka}
          width={"150px"}
          style={{
            display: "block",
            transition: "transform 0.3s ease", // 부드러운 애니메이션 추가
          }}
          className="hover-img"
        />
      </a>
      <a
        href="https://github.com/elfaka"
        style={{
          textDecoration: "none",
          display: "inline-block",
        }}
      >
        <img
          src={github}
          width={"40px"}
          style={{
            display: "block",
            transition: "transform 0.3s ease", // 부드러운 애니메이션 추가
          }}
          className="hover-img"
        />
      </a>
      <style>
        {`
          .hover-img:hover {
            transform: scale(1.2); /* 이미지 크기를 1.2배로 키움 */
          }
        `}
      </style>
    </div>
  );
}
