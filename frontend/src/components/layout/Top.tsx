import AppBar from "@mui/material/AppBar";
import Logo from "../../assets/Logo.svg";
import Container from "@mui/material/Container";

export default function TopBar() {
  return (
    <Container>
      <AppBar
        sx={{
          display: "flex",
          justifyContent: "center", // 수평 중앙 정렬
          alignItems: "center", // 수직 중앙 정렬
          height: "60px", // 높이 설정 (기존과 동일)
        }}
      >
        <img src={Logo} width={"300px"} alt="Logo" />
      </AppBar>
    </Container>
  );
}
