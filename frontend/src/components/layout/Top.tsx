import Grid from "@mui/material/Grid2";
import AppBar from "@mui/material/AppBar";
import Logo from "../../assets/Logo.svg";
import Tab from "./PageTab";

export default function TopBar() {
  return (
    <Grid container sx={{ height: "120px", width: "100%" }}>
      {/* Header */}
      <Grid size={12} sx={{ height: "60px" }}>
        <AppBar
          sx={{
            display: "flex",
            //justifyContent: "center", // 수평 중앙 정렬
            //alignItems: "center", // 수직 중앙 정렬
            height: "60px", // 높이 설정 (기존과 동일)
          }}
        >
          <img src={Logo} width={"300px"} alt="Logo" />
        </AppBar>
      </Grid>
      <Grid size={12} sx={{ height: "60px" }}>
        <Tab />
      </Grid>
    </Grid>
  );
}
