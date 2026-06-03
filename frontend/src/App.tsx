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
import { ClientResendVerificationPage } from './pages/ClientResendVerificationPage'
import { ClientVerifyEmailPage } from './pages/ClientVerifyEmailPage'
import { ClientMyAccountPage } from './pages/ClientMyAccountPage'
import { ClientConsignmentDetailPage } from './pages/ClientConsignmentDetailPage'
import { ClientOrderItemPage } from './pages/ClientOrderItemPage'
import { ConsignItemsPage } from './pages/ConsignItemsPage'
import { InquiryDetailPage } from './pages/InquiryDetailPage'
import { InventoryItemDetailPage } from './pages/InventoryItemDetailPage'
import { ItemAuthenticationDetailsPage } from './pages/ItemAuthenticationDetailsPage'
import { InventoryPage } from './pages/InventoryPage'
import { ConsignmentScheduleDetailPage } from './pages/ConsignmentScheduleDetailPage'
import { AuthenticationPage } from './pages/AuthenticationPage'
import { ItemAuthenticationPage } from './pages/ItemAuthenticationPage'
import { ConsignmentSchedulingPage } from './pages/ConsignmentSchedulingPage'
import { InquiryPage } from './pages/InquiryPage'
import { ManageAccountsPage } from './pages/ManageAccountsPage'
import { PhotoshootItemPage } from './pages/PhotoshootItemPage'
import { PhotoshootPage } from './pages/PhotoshootPage'
import { EditingItemPage } from './pages/EditingItemPage'
import { EditingPage } from './pages/EditingPage'
import { PostingItemPage } from './pages/PostingItemPage'
import { PostingPage } from './pages/PostingPage'
import { PricingPage } from './pages/PricingPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { OrdersPage } from './pages/OrdersPage'
import { PortalLoginPage } from './pages/PortalLoginPage'
import { ItemCatalogPage } from './pages/ItemCatalogPage'
import { ClientOrderDetailPage } from './pages/ClientOrderDetailPage'
import { ClientOrdersPage } from './pages/ClientOrdersPage'
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
            path: 'inventory/:id/authentication',
            element: <ItemAuthenticationDetailsPage />,
          },
          { path: 'inventory/:id', element: <InventoryItemDetailPage /> },
          {
            path: 'consignment-scheduling',
            element: <ConsignmentSchedulingPage />,
          },
          {
            path: 'consignment-scheduling/:id',
            element: <ConsignmentScheduleDetailPage />,
          },
          {
            path: 'authentication/:id',
            element: <ItemAuthenticationPage />,
          },
          { path: 'authentication', element: <AuthenticationPage /> },
          { path: 'photoshoot', element: <PhotoshootPage /> },
          { path: 'photoshoot/item/:photoshootId', element: <PhotoshootItemPage /> },
          { path: 'pricing', element: <PricingPage /> },
          { path: 'editing/:itemId', element: <EditingItemPage /> },
          { path: 'editing', element: <EditingPage /> },
          { path: 'posting/:itemId', element: <PostingItemPage /> },
          { path: 'posting', element: <PostingPage /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'orders/:id', element: <OrderDetailPage /> },
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
      { path: 'verify-email', element: <ClientVerifyEmailPage /> },
      {
        path: 'resend-verification',
        element: <ClientResendVerificationPage />,
      },
      {
        element: (
          <RequireClientAuth>
            <ClientLayout />
          </RequireClientAuth>
        ),
        children: [
          { path: 'consignments/:id', element: <ClientConsignmentDetailPage /> },
          { path: 'consignments', element: <ConsignItemsPage /> },
          { path: 'catalog/:itemId/order', element: <ClientOrderItemPage /> },
          { path: 'catalog', element: <ItemCatalogPage /> },
          { path: 'orders/:id', element: <ClientOrderDetailPage /> },
          { path: 'orders', element: <ClientOrdersPage /> },
          { path: 'profile', element: <ClientMyAccountPage /> },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
