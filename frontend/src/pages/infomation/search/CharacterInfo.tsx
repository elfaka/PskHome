import { Card, Box, Tooltip } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { styled } from "@mui/material/styles";
import { ArmoryTotal } from "../../../types/character/ArmoryTotal";
import ItemTooltip from "../../../components/content/ItemTooltip";

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
    borderRadius: "16px",
    color: theme.palette.text.secondary,
    ...theme.applyStyles("dark", {
      backgroundColor: "#1A2027",
    }),
  }));

  console.log(ArmoryTotal.ArmoryEquipment[1].Tooltip);

  return (
    <Box>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 5, lg: 4 }}>
          <Item>
            <img
              src={ArmoryTotal.ArmoryProfile.CharacterImage}
              style={{
                width: "100%", // Card의 가로 크기에 맞춤
                height: "100%", // Card의 세로 크기에 맞춤
                objectFit: "cover", // 이미지가 찌그러지지 않도록 비율 유
                borderRadius: "16px",
              }}
            />
          </Item>
        </Grid>
        <Grid container spacing={1} size={{ xs: 12, md: 7, lg: 8 }}>
          {ArmoryTotal.ArmoryEquipment.map((equipment, index) => (
            <Grid key={index} size={{ xs: 6, lg: 4 }}>
              <Item>
                {equipment.Type}
                <br />
                <Tooltip
                  title={<ItemTooltip EquipmentTooltip={equipment.Tooltip} />}
                  arrow
                >
                  <img src={equipment.Icon} alt="equipment icon" />
                </Tooltip>
                <br />
                {equipment.Name}
              </Item>
            </Grid>
          ))}
        </Grid>
      </Grid>
    </Box>
  );
}
