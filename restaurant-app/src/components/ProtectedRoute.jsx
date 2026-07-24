import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { currentUser } = useAuth();
  const location = useLocation();

  if (!currentUser || currentUser.role !== "restaurant_vendor") {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return children;
}
