import { Route, Routes, Navigate } from "react-router-dom";
import JsonPrettierPage from "./JsonPrettierPage";

export default function JsonPrettier() {
  return (
    <Routes>
      <Route index element={<JsonPrettierPage />} />
      {/* 혹시 /jsonprettier/anything 으로 들어오면 index로 보내기 */}
      <Route path="*" element={<Navigate to="/jsonprettier" replace />} />
    </Routes>
  );
}
