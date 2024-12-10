import { Route, Routes } from "react-router-dom";
import Home from "./pages/home/page";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}
