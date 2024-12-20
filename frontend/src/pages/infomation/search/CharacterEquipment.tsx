import React from "react";
import Tooltip from "@mui/material/Tooltip";
import Grid from "@mui/material/Grid2";
import ItemTooltip from "../../../components/content/ItemTooltip";
import StyledItem from "../../../components/layout/StyledItem";

// Equipment 타입 정의
interface Equipment {
  Type: string;
  Icon: string;
  Name: string;
  Tooltip: any; // Tooltip 데이터의 정확한 타입을 알고 있다면 이를 구체적으로 작성
}

// Props 타입 정의
interface EquipmentGridProps {
  equipmentList: Equipment[];
}

// EquipmentGrid 컴포넌트
const CharacterEquipment: React.FC<EquipmentGridProps> = ({
  equipmentList,
}) => {
  return (
    <>
      {[1, 5, 2, 3, 4, 0].map((index) => (
        <Grid key={index} size={{ xs: 6, lg: 12 }}>
          <StyledItem>
            {equipmentList[index].Type}
            <br />
            <Tooltip
              title={
                <ItemTooltip EquipmentTooltip={equipmentList[index].Tooltip} />
              }
              arrow
            >
              <img src={equipmentList[index].Icon} alt="equipment icon" />
            </Tooltip>
            <br />
            {equipmentList[index].Name}
          </StyledItem>
        </Grid>
      ))}
    </>
  );
};

export default CharacterEquipment;
