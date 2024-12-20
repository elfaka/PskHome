import React, { ReactNode } from "react";
import { styled } from "@mui/material/styles";
import Card from "@mui/material/Card";

interface StyledItemProps {
  children: ReactNode;
}

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

const StyledItem: React.FC<StyledItemProps> = ({ children }) => {
  return <Item>{children}</Item>;
};

export default StyledItem;
