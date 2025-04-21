import Grid from "@mui/material/Grid2";
import Homeheader from "../../components/layout/Homeheader/Homeheader";
import HomeBody from "./Homebody/Homebody";

export default function Home() {
  return (
    <Grid container spacing={10} direction="column" sx={{ height: "200vh" }}>
      {/* Homeheader: 고정 크기 설정 */}
      <Grid>
        <Homeheader />
      </Grid>
      {/* HomeBody: 남은 공간을 차지하도록 설정 */}
      <Grid sx={{ flex: 1, overflowY: "auto" }}>
        <HomeBody />
      </Grid>
    </Grid>
  );
}
