import { Route, Routes } from "react-router-dom";
import Top from "./components/layout/Top";
import Home from "./pages/home/page";
import Infomation from "./pages/infomation/page";
import Optimize from "./pages/optimize/page";
import Grid from "@mui/material/Grid2"; // Grid2를 사용합니다.

export default function App() {
  return (
    <Grid container sx={{ height: "100vh", width: "100%" }}>
      {/* Header */}
      <Grid size={12} sx={{ height: "120px" }}>
        <Top />
      </Grid>

      {/* Main Content */}
      <Grid size={12} sx={{ flexGrow: 1, overflowY: "auto", padding: 2 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/infomation" element={<Infomation />} />
          <Route path="/optimize" element={<Optimize />} />
        </Routes>
      </Grid>

      {/* Footer */}
      <Grid
        size={12}
        sx={{
          height: "50px",
          backgroundColor: "disabled.main",
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <footer>&copy; 2025 Your Company. All rights reserved.</footer>
      </Grid>
    </Grid>
  );
}
