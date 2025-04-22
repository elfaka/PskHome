import "./mainbody.css";

export default function Homebody() {
  return (
    <div>
      <h1 style={{ paddingTop: "20px", paddingBottom: "20px" }}>
        <span style={{ display: "inline-block", position: "relative" }}>
          👋 만나서 반갑습니다. ELFAKA 입니다.
          <hr
            style={{
              position: "absolute",
              bottom: "-10px",
              left: 0,
              background: "#afafff",
              height: "2px",
              width: "100%",
              border: "none",
            }}
          />
        </span>
      </h1>
      <h3>
        <ul style={{ lineHeight: "4.0em" }}>
          <li>
            해당 사이트는 그 동안 공부를 한 흔적을 기록하고 토이 프로젝트 구축을
            위해 만들었습니다.
          </li>
          <li>
            제 소개는
            <a href="/about" className="link">
              About
            </a>
            에 있습니다.
          </li>
          <li>
            그동안 풀었던 PS(Problem Solving)은
            <a href="/Solve" className="link">
              Solve
            </a>
            에 기록 했습니다.
          </li>
          <li>
            그동안 개발한 토이 프로젝트 리스트는
            <a href="/Project" className="link">
              Project
            </a>
            에서 보실 수 있습니다.
          </li>
          <li>
            정리해야 할 글들은
            <a href="/Blog" className="link">
              Blog
            </a>
            에 작성 했습니다.
          </li>
        </ul>
      </h3>
    </div>
  );
}
