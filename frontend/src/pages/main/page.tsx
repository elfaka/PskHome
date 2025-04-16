import Top from "../../components/layout/Top";
import Grid from "@mui/material/Grid2"; // Grid2를 사용합니다.

export default function main() {
  return (
    <Grid>
      <Grid size={12} sx={{ height: "120px" }}>
        <Top />
      </Grid>
      <Grid
        size={12}
        sx={{
          height: "50px",
          backgroundColor: "disabled.main",
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <footer>&copy; 2025 Your Company. All rights reserved.</footer>
      </Grid>
    </Grid>
  );
}
