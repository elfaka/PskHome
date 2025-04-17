import Grid from "@mui/material/Grid2";
import Homeheader from "../../components/layout/Homeheader/Homeheader";
export default function home() {
  return (
    <Grid container direction="column">
      <Grid>
        <Homeheader />
      </Grid>
      <Grid></Grid>
    </Grid>
  );
}
