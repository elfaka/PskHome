import Homeheader from "../../../components/layout/Homeheader/Homeheader";
import "./Solve.css"; // 스타일은 따로 관리

export default function Solve() {
  return (
    <div className="solve-container">
      {/* Homeheader: 고정 영역 */}
      <div className="solve-header">
        <Homeheader />
      </div>

      {/* HomeBody: 나중에 본문 넣을 영역 */}
      <div className="solve-body">{/* 여기에 본문 내용을 추가 */}</div>
    </div>
  );
}
