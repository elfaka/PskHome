import { Route, Routes } from "react-router-dom";
import Home from "./pages/home/home";
import Main from "./pages/calculator/main/page";
import Infomation from "./pages/calculator/infomation/page";
import Optimize from "./pages/calculator/optimize/page";
import "./App.css"; // 스타일 분리

export default function App() {
  return (
    <div className="app-container">
      <Routes>
        <Route path="*" element={<Home />} />
        <Route path="/calculator/main" element={<Main />} />
        <Route path="/calculator/infomation" element={<Infomation />} />
        <Route path="/calculator/optimize" element={<Optimize />} />
      </Routes>
    </div>
  );
}
