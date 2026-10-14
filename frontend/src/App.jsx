import { Route, Routes } from "react-router-dom";
import { MainPage } from "./pages/MainPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
    </Routes>
  );
}
