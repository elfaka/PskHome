import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, Tab, Box } from "@mui/material";

export default function PageTab() {
  const [value, setValue] = React.useState("tab1");
  const navigate = useNavigate(); // React Router의 useNavigate 사용

  const handleChange = (_event: React.SyntheticEvent, newValue: string) => {
    setValue(newValue);
    switch (newValue) {
      case "tab1":
        navigate("/"); // SPA 방식으로 이동
        break;
      case "tab2":
        navigate("/infomation");
        break;
      case "tab3":
        navigate("/optimize");
        break;
      case "tab4":
        navigate("/checkequipment");
        break;
      default:
        break;
    }
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Tabs
        value={value}
        onChange={handleChange}
        textColor="primary"
        indicatorColor="primary"
      >
        <Tab value="tab1" label="홈" />
        <Tab value="tab2" label="캐릭터 정보" />
        <Tab value="tab3" label="스펙업 최적화" />
        <Tab value="tab4" label="군장검사" />
      </Tabs>
    </Box>
  );
}
