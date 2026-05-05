import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, adminOnly = false, customerOnly = false }) {
  const { user, loading } = useAuth();
  if (loading || user === null) {
    return (
      <div className="min-h-screen grid place-items-center text-[#D4AF37] font-display tracking-widest text-sm">
        LOADING GRID…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/dashboard" replace />;
  if (customerOnly && user.role !== "customer" && user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}
