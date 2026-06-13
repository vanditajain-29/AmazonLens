import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { CartProvider } from "./contexts/CartContext.jsx";
import { SustainabilityProvider } from "./contexts/SustainabilityContext.jsx";
import { CoPlannerProvider } from "./contexts/CoPlannerContext.jsx";
import CoPlannerPicker from "./components/CoPlannerPicker.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <CartProvider>
        <SustainabilityProvider>
          <CoPlannerProvider>
            <App />
            <CoPlannerPicker />
          </CoPlannerProvider>
        </SustainabilityProvider>
      </CartProvider>
    </AuthProvider>
  </BrowserRouter>
);
