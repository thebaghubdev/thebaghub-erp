import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthProvider";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { InquiryPage } from "./pages/InquiryPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ManageAccountsPage } from "./pages/ManageAccountsPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Navigate to="/inquiries" replace />} />
            <Route path="/inquiries" element={<InquiryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/accounts/register" element={<RegisterPage />} />
            <Route path="/accounts" element={<ManageAccountsPage />} />
            <Route path="*" element={<Navigate to="/inquiries" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
