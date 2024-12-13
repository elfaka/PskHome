import * as React from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";

export default function ColorTabs() {
  const [value, setValue] = React.useState("tab1");

  const handleChange = (_event: React.SyntheticEvent, newValue: string) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Tabs
        value={value}
        onChange={handleChange}
        textColor="primary"
        indicatorColor="primary"
        centered
      >
        <Tab value="tab1" label="홈" />
        <Tab value="tab2" label="캐릭터 정보" />
        <Tab value="tab3" label="스펙업 최적화" />
        <Tab value="tab4" label="군장검사" />
      </Tabs>
    </Box>
  );
}
