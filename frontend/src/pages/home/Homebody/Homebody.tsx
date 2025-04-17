import Grid from "@mui/material/Grid2";
import Comment from "./Comment";
export default function Homebody() {
  return (
    <Grid container spacing={4}>
      <Grid size={{ xs: 0, md: 3 }}></Grid>

      <Grid
        size={{ xs: 10, md: 6 }}
        style={{
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "center",
        }}
      >
        <Comment />
      </Grid>
      <Grid size={{ xs: 0, md: 3 }}></Grid>
    </Grid>
  );
}
