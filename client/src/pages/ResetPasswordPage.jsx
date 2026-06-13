import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/login", { replace: true }); }, []);
  return null;
}
