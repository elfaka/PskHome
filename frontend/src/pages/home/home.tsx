import { Route, Routes } from "react-router-dom";
import Main from "./main/main";
import About from "./about/about";
import Solve from "./solve/solve";
import Homeheader from "../../components/layout/Homeheader/Homeheader";
import "./home.css"; // 스타일은 따로 관리

export default function Home() {
  return (
    <div className="home-container">
      {/* Homeheader: 고정 영역 */}
      <div className="home-header">
        <Homeheader />
      </div>

      {/* HomeBody: 나중에 본문 넣을 영역 */}
      <div className="home-body">
        <Routes>
          <Route path="/" element={<Main />} />
          <Route path="/about" element={<About />} />
          <Route path="/solve" element={<Solve />} />
        </Routes>
      </div>
    </div>
  );
}
