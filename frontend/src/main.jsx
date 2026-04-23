import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// 1) Library CSS first
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

// 2) Your Tailwind / global styles last
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);