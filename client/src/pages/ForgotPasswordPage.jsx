import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/login", { replace: true }); }, []);
  return null;
}
