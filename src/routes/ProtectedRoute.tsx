import { Navigate } from "react-router-dom";

export default function ProtectedRoute({
  isAllowed,
  redirectTo = "/auth",
  children,
}: {
  isAllowed: boolean;
  redirectTo?: string;
  children: React.ReactNode;
}) {
  if (!isAllowed) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
