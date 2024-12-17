import Card from "@mui/material/Card";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid2";
import { ArmoryTotal } from "../../../types/character/ArmoryTotal";
interface ArmoryTotalProps {
  ArmoryTotal: ArmoryTotal | null;
}

export default function CharacterInfo({ ArmoryTotal }: ArmoryTotalProps) {
  if (!ArmoryTotal) return null;

  return (
    <Grid container>
      <Container>
        <Card>
          <img src={ArmoryTotal.ArmoryProfile.CharacterImage} />
        </Card>
      </Container>
    </Grid>
    // <div
    //   style={{
    //     marginTop: "20px",
    //     textAlign: "left",
    //     display: "inline-block",
    //     maxHeight: "500px",
    //     overflow: "auto",
    //     padding: "10px",
    //     border: "1px solid #ccc",
    //     borderRadius: "4px",
    //     width: "80%",
    //   }}
    // >
    //   <h2>검색 결과:</h2>
    //   <Card
    //     style={{
    //       backgroundColor: "#f4f4f4",
    //       padding: "10px",
    //       borderRadius: "4px",
    //     }}
    //   >
    //     {JSON.stringify(characterInfo, null, 2)}
    //   </Card>
    // </div>
  );
}
