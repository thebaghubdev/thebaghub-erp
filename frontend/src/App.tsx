import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
} from 'react-router-dom'
import { ClientHtmlTheme } from './components/ClientHtmlTheme'
import { PortalHtmlTheme } from './components/PortalHtmlTheme'
import { ClientAuthProvider } from './context/client-auth'
import { PortalAuthProvider } from './context/portal-auth'
import { ClientLayout } from './components/ClientLayout'
import { Layout } from './components/Layout'
import { RequireClientAuth } from './components/RequireClientAuth'
import { RequirePortalAuth } from './components/RequirePortalAuth'
import { ClientCreateAccountPage } from './pages/ClientCreateAccountPage'
import { ClientLoginPage } from './pages/ClientLoginPage'
import { ClientMyAccountPage } from './pages/ClientMyAccountPage'
import { ClientConsignmentDetailPage } from './pages/ClientConsignmentDetailPage'
import { ConsignItemsPage } from './pages/ConsignItemsPage'
import { InquiryDetailPage } from './pages/InquiryDetailPage'
import { InventoryPage } from './pages/InventoryPage'
import { ConsignmentScheduleDetailPage } from './pages/ConsignmentScheduleDetailPage'
import { ConsignmentSchedulingPage } from './pages/ConsignmentSchedulingPage'
import { InquiryPage } from './pages/InquiryPage'
import { ManageAccountsPage } from './pages/ManageAccountsPage'
import { PortalLoginPage } from './pages/PortalLoginPage'
import { PurchaseItemsPage } from './pages/PurchaseItemsPage'
import { RegisterPage } from './pages/RegisterPage'
import { SettingsPage } from './pages/SettingsPage'

function PortalBranch() {
  return (
    <>
      <PortalHtmlTheme />
      <Outlet />
    </>
  )
}

function ClientBranch() {
  return (
    <>
      <ClientHtmlTheme />
      <Outlet />
    </>
  )
}

const router = createBrowserRouter([
  {
    path: '/portal',
    element: (
      <PortalAuthProvider>
        <PortalBranch />
      </PortalAuthProvider>
    ),
    children: [
      { path: 'login', element: <PortalLoginPage /> },
      {
        element: (
          <RequirePortalAuth>
            <Layout />
          </RequirePortalAuth>
        ),
        children: [
          { index: true, element: <Navigate to="inquiries" replace /> },
          { path: 'inquiries', element: <InquiryPage /> },
          { path: 'inquiries/:id', element: <InquiryDetailPage /> },
          { path: 'inventory', element: <InventoryPage /> },
          {
            path: 'consignment-scheduling',
            element: <ConsignmentSchedulingPage />,
          },
          {
            path: 'consignment-scheduling/:id',
            element: <ConsignmentScheduleDetailPage />,
          },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'accounts/register', element: <RegisterPage /> },
          { path: 'accounts', element: <ManageAccountsPage /> },
          { path: '*', element: <Navigate to="/portal/inquiries" replace /> },
        ],
      },
    ],
  },
  {
    path: '/',
    element: (
      <ClientAuthProvider>
        <ClientBranch />
      </ClientAuthProvider>
    ),
    children: [
      { index: true, element: <Navigate to="/login" replace /> },
      { path: 'login', element: <ClientLoginPage /> },
      { path: 'create-account', element: <ClientCreateAccountPage /> },
      {
        element: (
          <RequireClientAuth>
            <ClientLayout />
          </RequireClientAuth>
        ),
        children: [
          { path: 'consignments/:id', element: <ClientConsignmentDetailPage /> },
          { path: 'consignments', element: <ConsignItemsPage /> },
          { path: 'purchases', element: <PurchaseItemsPage /> },
          { path: 'my-account', element: <ClientMyAccountPage /> },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
