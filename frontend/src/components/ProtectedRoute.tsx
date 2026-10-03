import React from 'react';
import { Navigate } from 'react-router-dom';

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true; // malformed token, treat as expired
  }
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const userRole = localStorage.getItem('userRole');
  const token = localStorage.getItem('token');

  if (!userRole || !token || isTokenExpired(token)) {
    localStorage.clear();
    return <Navigate to="/" replace />;
  }

  if (!allowedRoles.includes(userRole)) {
    switch (userRole) {
      case 'FACULTY': return <Navigate to="/faculty-dashboard" replace />;
      case 'ADMIN': return <Navigate to="/admin-dashboard" replace />;
      case 'DEAN': return <Navigate to="/dean-dashboard" replace />;
      case 'STUDENT':
      default: return <Navigate to="/student-dashboard" replace />;
    }
  }

  return <>{children}</>;
}