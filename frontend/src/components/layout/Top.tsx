import AppBar from "@mui/material/AppBar";
import Logo from "../../assets/Logo.svg";
import Tab from "./PageTab";

export default function TopBar() {
  return (
    <AppBar
      sx={{
        display: "flex",
        background: "primary",
        //alignItems: "center", // 수직 중앙 정렬
        height: "60px", // 높이 설정 (기존과 동일)
      }}
    >
      <img src={Logo} width={"300px"} alt="Logo" />
      <Tab />
    </AppBar>
  );
}
