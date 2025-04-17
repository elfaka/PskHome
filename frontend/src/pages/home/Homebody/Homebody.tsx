import Grid from "@mui/material/Grid2";
import Container from "@mui/material/Container";

export default function Homebody() {
  return (
    <Container>
      <Grid container spacing={4}>
        <Grid size={{ xs: 0, md: 3 }}></Grid>

        <Grid
          size={{ xs: 10, md: 6 }}
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div>1</div>
        </Grid>
        <Grid size={{ xs: 0, md: 3 }}></Grid>
      </Grid>
    </Container>
  );
}
