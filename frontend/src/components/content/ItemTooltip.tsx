import React from "react";
import { Typography, Box } from "@mui/material";

type TooltipElement = {
  type: string;
  value: string | Record<string, any>;
};

type TooltipData = Record<string, TooltipElement>;

// Helper function to render JSON data with HTML and apply styles
const renderHTMLContent = (html: string, style: React.CSSProperties = {}) => (
  <span
    style={{ fontSize: "14px", ...style }}
    dangerouslySetInnerHTML={{ __html: html }}
  ></span>
);

interface EquipmentTooltipProps {
  tooltipData: TooltipData | null | undefined;
}

const EquipmentTooltip: React.FC<EquipmentTooltipProps> = ({ tooltipData }) => {
  if (!tooltipData) {
    return (
      <Box sx={{ padding: 2, maxWidth: 300 }}>
        <Typography variant="body2" style={{ fontSize: "14px" }}>
          Tooltip data is not available.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ padding: 2, maxWidth: 300 }}>
      {/* Render each element dynamically */}
      {Object.entries(tooltipData).map(([key, element]) => {
        if (!element) return null;

        switch (element.type) {
          case "NameTagBox":
            return (
              <Box key={key} mb={1}>
                {renderHTMLContent(element.value as string, {
                  fontSize: "16px",
                  color: "#E3C7A1",
                })}
              </Box>
            );

          case "ItemTitle":
            const value = element.value as Record<string, string> | null;
            if (!value) return null;
            return (
              <Box key={key} mb={2}>
                {renderHTMLContent(value.leftStr0 || "", {
                  fontSize: "14px",
                  color: "#E3C7A1",
                })}
                <Typography variant="body2" style={{ fontSize: "14px" }}>
                  {renderHTMLContent(value.leftStr1 || "")}
                </Typography>
                <Typography variant="body2" style={{ fontSize: "14px" }}>
                  {renderHTMLContent(value.leftStr2 || "")}
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
            const partValue = element.value as Record<string, string> | null;
            if (!partValue) return null;
            return (
              <Box key={key} mb={2}>
                <Typography variant="body2" style={{ fontSize: "14px" }}>
                  {renderHTMLContent(partValue.Element_000 || "")}
                </Typography>
                <Typography variant="body2" style={{ fontSize: "14px" }}>
                  {renderHTMLContent(partValue.Element_001 || "")}
                </Typography>
              </Box>
            );

          case "Progress":
            const progressValue = element.value as {
              title: string;
              value: number;
              maximum: number;
            } | null;
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
            const groupValue = element.value as {
              Element_000: {
                topStr: string;
                contentStr: Record<string, { contentStr: string }> | null;
              };
            } | null;
            if (!groupValue || !groupValue.Element_000) return null;
            return (
              <Box key={key} mb={2}>
                <Typography variant="body2" style={{ fontSize: "14px" }}>
                  {renderHTMLContent(groupValue.Element_000.topStr || "")}
                </Typography>
                {Object.values(groupValue.Element_000.contentStr || {}).map(
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
};

export default EquipmentTooltip;
