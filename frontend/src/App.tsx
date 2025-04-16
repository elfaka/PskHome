import { Route, Routes } from "react-router-dom";
import Home from "./pages/home/page";
import About from "./pages/about/page";
import Main from "./pages/main/page";
import Infomation from "./pages/infomation/page";
import Optimize from "./pages/optimize/page";
import Grid from "@mui/material/Grid2"; // Grid2를 사용합니다.

export default function App() {
  return (
    <Grid container sx={{ height: "100vh", width: "100%" }}>
      {/* Main Content */}
      <Grid size={12} sx={{ flexGrow: 1, overflowY: "auto", padding: 2 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/main" element={<Main />} />
          <Route path="/infomation" element={<Infomation />} />
          <Route path="/optimize" element={<Optimize />} />
        </Routes>
      </Grid>
    </Grid>
  );
}
