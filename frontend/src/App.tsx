import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ClientAuthProvider } from "./context/client-auth";
import { PortalAuthProvider } from "./context/portal-auth";
import { ClientLayout } from "./components/ClientLayout";
import { Layout } from "./components/Layout";
import { RequireClientAuth } from "./components/RequireClientAuth";
import { RequirePortalAuth } from "./components/RequirePortalAuth";
import { ClientCreateAccountPage } from "./pages/ClientCreateAccountPage";
import { ClientLoginPage } from "./pages/ClientLoginPage";
import { ClientMyAccountPage } from "./pages/ClientMyAccountPage";
import { ConsignItemsPage } from "./pages/ConsignItemsPage";
import { InquiryPage } from "./pages/InquiryPage";
import { ManageAccountsPage } from "./pages/ManageAccountsPage";
import { PortalLoginPage } from "./pages/PortalLoginPage";
import { PurchaseItemsPage } from "./pages/PurchaseItemsPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SettingsPage } from "./pages/SettingsPage";

function PortalRoutes() {
  return (
    <PortalAuthProvider>
      <Routes>
        <Route path="login" element={<PortalLoginPage />} />
        <Route element={<RequirePortalAuth><Layout /></RequirePortalAuth>}>
          <Route index element={<Navigate to="inquiries" replace />} />
          <Route path="inquiries" element={<InquiryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="accounts/register" element={<RegisterPage />} />
          <Route path="accounts" element={<ManageAccountsPage />} />
          <Route path="*" element={<Navigate to="inquiries" replace />} />
        </Route>
      </Routes>
    </PortalAuthProvider>
  );
}

function ClientRoutes() {
  return (
    <ClientAuthProvider>
      <Routes>
        <Route index element={<Navigate to="/login" replace />} />
        <Route path="login" element={<ClientLoginPage />} />
        <Route path="create-account" element={<ClientCreateAccountPage />} />
        <Route element={<RequireClientAuth><ClientLayout /></RequireClientAuth>}>
          <Route path="consign-items" element={<ConsignItemsPage />} />
          <Route path="purchase-items" element={<PurchaseItemsPage />} />
          <Route path="my-account" element={<ClientMyAccountPage />} />
        </Route>
      </Routes>
    </ClientAuthProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/portal"
          element={<Navigate to="/portal/inquiries" replace />}
        />
        <Route path="/portal/*" element={<PortalRoutes />} />
        <Route path="/*" element={<ClientRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}
