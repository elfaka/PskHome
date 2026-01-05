import { Route, Routes } from "react-router-dom";
import Main from "./main/main";
import About from "./about/about";
import Solve from "./solve/solve";
import Homeheader from "../../components/layout/Homeheader/Homeheader";

export default function Home() {
  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">
      {/* Homeheader: 고정 영역 */}
      <div className="shrink-0">
        <Homeheader />
      </div>

      {/* HomeBody: 본문 영역 (스크롤 가능) */}
      <div className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Main />} />
          <Route path="/about" element={<About />} />
          <Route path="/solve" element={<Solve />} />
        </Routes>
      </div>
    </div>
  );
}
