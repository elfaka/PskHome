import Grid from "@mui/material/Grid2";
import AppBar from "@mui/material/AppBar";
import elfaka from "../../../assets/elfaka.png";
import github from "../../../assets/github.svg";
import "./Homeheader.css"; // CSS 파일 import

export default function Homeheader() {
  // 공통 스타일 객체
  return (
    <AppBar
      style={{
        padding: "10px",
        background: "#ffffff", // 그라데이션 추가
        backgroundSize: "cover",
      }}
    >
      <Grid container spacing={4}>
        {/* 1st Grid Section */}
        <Grid size={{ xs: 0, md: 3 }}></Grid>

        {/* 2nd Grid Section (for elfaka image) */}
        <Grid
          size={{ xs: 5, md: 3 }}
          style={{
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
          }}
        >
          <a href="/">
            <img src={elfaka} width={"150px"} className="hover-img" />
          </a>
        </Grid>

        {/* 3rd Grid Section (for github image) */}
        <Grid
          size={{ xs: 5, md: 3 }}
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          <a href="https://github.com/elfaka">
            <img src={github} width={"40px"} className="hover-img" />
          </a>
        </Grid>

        {/* 4th Grid Section */}
        <Grid size={{ xs: 0, md: 3 }}></Grid>
      </Grid>
    </AppBar>
  );
}
