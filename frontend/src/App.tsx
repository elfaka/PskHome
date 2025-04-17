import { Route, Routes } from "react-router-dom";
import Contaioner from "@mui/material/Container";
import Home from "./pages/home/page";
import About from "./pages/about/page";
import Main from "./pages/calculator/main/page";
import Infomation from "./pages/calculator/infomation/page";
import Optimize from "./pages/calculator/optimize/page";

export default function App() {
  return (
    <Contaioner style={{ maxWidth: "100%", background: "#FFFFEF" }}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/calculator/main" element={<Main />} />
        <Route path="/calculator/infomation" element={<Infomation />} />
        <Route path="/calculator/optimize" element={<Optimize />} />
      </Routes>
    </Contaioner>
  );
}
