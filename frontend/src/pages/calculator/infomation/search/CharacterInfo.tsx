import { Box } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { ArmoryTotal } from "../../../types/character/ArmoryTotal";
import StyledItem from "../../../components/layout/StyledItem";
import CharacterEquipment from "./CharacterEquipment";
import CharacterAccessory from "./CharacterAccessory";
import CharacterSpecial from "./CharacterSpecial";

interface ArmoryTotalProps {
  ArmoryTotal: ArmoryTotal | null;
}

export default function CharacterInfo({ ArmoryTotal }: ArmoryTotalProps) {
  if (!ArmoryTotal) return null;

  console.log(ArmoryTotal.ArmoryEquipment[1].Tooltip);

  return (
    <Box>
      <Grid container spacing={1}>
        <Grid container size={{ xs: 12, md: 7, lg: 3 }}>
          <CharacterEquipment equipmentList={ArmoryTotal.ArmoryEquipment} />
        </Grid>
        <Grid container size={{ xs: 12, md: 5, lg: 6 }}>
          <Grid size={{ xs: 12, md: 5, lg: 12 }}>
            <StyledItem>
              <img
                src={ArmoryTotal.ArmoryProfile.CharacterImage}
                style={{
                  width: "100%", // Card의 가로 크기에 맞춤
                  height: "100%", // Card의 세로 크기에 맞춤
                  objectFit: "cover", // 이미지가 찌그러지지 않도록 비율 유
                  borderRadius: "16px",
                }}
              />
            </StyledItem>
          </Grid>
          <Grid container size={{ xs: 12, md: 5, lg: 12 }}>
            <CharacterSpecial equipmentList={ArmoryTotal.ArmoryEquipment} />
          </Grid>
        </Grid>
        <Grid container size={{ xs: 12, md: 7, lg: 3 }}>
          <CharacterAccessory equipmentList={ArmoryTotal.ArmoryEquipment} />
        </Grid>
      </Grid>
    </Box>
  );
}
