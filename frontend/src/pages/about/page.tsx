import Grid from "@mui/material/Grid2";
import Homeheader from "../../components/layout/Homeheader/Homeheader";

export default function about() {
  return (
    <Grid
      container
      spacing={10}
      direction="column"
      sx={{ height: "100vh", overflow: "hidden" }} // 화면 높이에 맞춤
    >
      {/* Homeheader: 고정 크기 */}
      <Grid sx={{ flexShrink: 0 }}>
        <Homeheader />
      </Grid>

      {/* HomeBody: 남은 영역을 차지하고 스크롤 가능 */}
      <Grid sx={{ flexGrow: 1, overflowY: "auto" }}></Grid>
    </Grid>
  );
}
