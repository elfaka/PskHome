import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid2";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import { styled } from "@mui/material/styles";
import { ArmoryTotal } from "../../../types/character/ArmoryTotal";
interface ArmoryTotalProps {
  ArmoryTotal: ArmoryTotal | null;
}

export default function CharacterInfo({ ArmoryTotal }: ArmoryTotalProps) {
  if (!ArmoryTotal) return null;

  const Item = styled(Card)(({ theme }) => ({
    backgroundColor: "#fff",
    ...theme.typography.body2,
    padding: theme.spacing(1),
    textAlign: "center",
    color: theme.palette.text.secondary,
    ...theme.applyStyles("dark", {
      backgroundColor: "#1A2027",
    }),
  }));

  return (
    <Box>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 5, lg: 4 }}>
          <Item>
            <img
              src={ArmoryTotal.ArmoryProfile.CharacterImage}
              style={{ width: "200px", height: "auto", borderRadius: "16px" }}
            />
          </Item>
        </Grid>
        <Grid container spacing={1} size={{ xs: 12, md: 7, lg: 8 }}>
          <Grid size={{ xs: 6, lg: 4 }}>
            <Item>
              <Box>ArmoryTotal.ArmoryProfile.CharacterImage</Box>
            </Item>
          </Grid>
          <Grid size={{ xs: 6, lg: 4 }}>
            <Item></Item>
          </Grid>
          <Grid size={{ xs: 6, lg: 4 }}>
            <Item></Item>
          </Grid>
          <Grid size={{ xs: 6, lg: 4 }}>
            <Item></Item>
          </Grid>
          <Grid size={{ xs: 6, lg: 4 }}>
            <Item></Item>
          </Grid>
          <Grid size={{ xs: 6, lg: 4 }}>
            <Item></Item>
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
}
