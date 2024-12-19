import React from "react";
import { Typography, Box } from "@mui/material";
import {
  EquipmentTooltip,
  IndentStringGroup,
  ItemPartBox,
  ItemTitle,
  Progress,
} from "../../types/tooltip/EquipmentTooltip";

// Helper function to render HTML content and apply custom styles
const renderHTMLContent = (html: string, style: React.CSSProperties = {}) => (
  <span
    style={{ fontSize: "14px", ...style }}
    dangerouslySetInnerHTML={{ __html: html }}
  ></span>
);

interface EquipmentTooltipProps {
  EquipmentTooltip: EquipmentTooltip | null | undefined;
}

export default function ItemTooltip({
  EquipmentTooltip,
}: EquipmentTooltipProps) {
  // Check if the tooltip data exists
  if (!EquipmentTooltip) {
    return (
      <Box sx={{ padding: 2, maxWidth: 300 }}>
        <Typography variant="body2" style={{ fontSize: "14px" }}>
          Tooltip data is not available.
        </Typography>
      </Box>
    );
  }

  // Render elements based on the EquipmentTooltip data
  return (
    <Box sx={{ padding: 2, maxWidth: 300 }}>
      {/* Iterate through each element in the EquipmentTooltip */}
      {Object.entries(EquipmentTooltip).map(([key, element]) => {
        if (!element) return null;

        switch (element?.type) {
          case "NameTagBox":
            return (
              <Box key={key} mb={1}>
                {renderHTMLContent(element.value as string, {
                  fontSize: "16px",
                  color: "#E3C7A1", // Customize for NameTagBox
                })}
              </Box>
            );

          case "ItemTitle":
            const itemTitleValue = element.value as ItemTitle | null;
            if (!itemTitleValue) return null;
            return (
              <Box key={key} mb={2}>
                {renderHTMLContent(itemTitleValue.leftStr0 || "", {
                  fontSize: "14px",
                  color: "#E3C7A1", // Customize for ItemTitle
                })}
                <Typography variant="body2" style={{ fontSize: "14px" }}>
                  {renderHTMLContent(itemTitleValue.leftStr1 || "")}
                </Typography>
                <Typography variant="body2" style={{ fontSize: "14px" }}>
                  {renderHTMLContent(itemTitleValue.leftStr2 || "")}
                </Typography>
              </Box>
            );

          case "SingleTextBox":
          case "MultiTextBox":
            return (
              <Typography
                key={key}
                variant="body2"
                mb={1}
                style={{ fontSize: "14px" }}
              >
                {renderHTMLContent(element.value as string)}
              </Typography>
            );

          case "ItemPartBox":
            const partBoxValue = element.value as ItemPartBox | null;
            if (!partBoxValue) return null;
            return (
              <Box key={key} mb={2}>
                <Typography variant="body2" style={{ fontSize: "14px" }}>
                  {renderHTMLContent(partBoxValue.Element_000 || "")}
                </Typography>
                <Typography variant="body2" style={{ fontSize: "14px" }}>
                  {renderHTMLContent(partBoxValue.Element_001 || "")}
                </Typography>
              </Box>
            );

          case "Progress":
            const progressValue = element.value as Progress | null;
            if (!progressValue) return null;
            return (
              <Box key={key} mb={2}>
                <Typography variant="body2" style={{ fontSize: "14px" }}>
                  {renderHTMLContent(progressValue.title || "")}
                </Typography>
                <Typography variant="body2" style={{ fontSize: "14px" }}>
                  {`Progress: ${progressValue.value || 0} / ${
                    progressValue.maximum || 0
                  }`}
                </Typography>
              </Box>
            );

          case "IndentStringGroup":
            const indentGroupValue = element.value as IndentStringGroup | null;
            if (!indentGroupValue || !indentGroupValue.Element_000) return null;
            return (
              <Box key={key} mb={2}>
                <Typography variant="body2" style={{ fontSize: "14px" }}>
                  {renderHTMLContent(indentGroupValue.Element_000.topStr || "")}
                </Typography>
                {indentGroupValue.Element_000.contentStr?.map(
                  (content, idx) => (
                    <Typography
                      key={idx}
                      variant="body2"
                      style={{ fontSize: "14px" }}
                    >
                      {renderHTMLContent(content.contentStr || "")}
                    </Typography>
                  )
                )}
              </Box>
            );

          default:
            return null;
        }
      })}
    </Box>
  );
}
