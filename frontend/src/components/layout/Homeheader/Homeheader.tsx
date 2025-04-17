import Grid from "@mui/material/Grid2";
import elfaka from "../../../assets/elfaka.png";
import github from "../../../assets/github.svg";
import "./Homeheader.css"; // CSS 파일 import

export default function Homeheader() {
  // 공통 스타일 객체
  const gridItemStyle = {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  };

  return (
    <Grid container spacing={2}>
      {/* 1st Grid Section */}
      <Grid size={2} style={gridItemStyle}></Grid>

      {/* 2nd Grid Section (for elfaka image) */}
      <Grid size={4} style={gridItemStyle}>
        <a href="/">
          <img src={elfaka} width={"150px"} className="hover-img" />
        </a>
      </Grid>

      {/* 3rd Grid Section (for github image) */}
      <Grid size={4} style={gridItemStyle}>
        <a href="https://github.com/elfaka">
          <img src={github} width={"40px"} className="hover-img" />
        </a>
      </Grid>

      {/* 4th Grid Section */}
      <Grid size={2} style={gridItemStyle}></Grid>
    </Grid>
  );
}
