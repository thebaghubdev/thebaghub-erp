import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useParams,
} from 'react-router-dom'
import { ClientHtmlTheme } from './components/ClientHtmlTheme'
import { PortalHtmlTheme } from './components/PortalHtmlTheme'
import { ClientAuthProvider } from './context/client-auth'
import { PortalAuthProvider } from './context/portal-auth'
import { UnsavedChangesProvider } from './context/unsaved-changes'
import { ClientLayout } from './components/ClientLayout'
import { Layout } from './components/Layout'
import { RequireClientAuth } from './components/RequireClientAuth'
import { RequirePortalAuth } from './components/RequirePortalAuth'
import { RequireFeatureAccess } from './components/RequireFeatureAccess'
import { ClientCreateAccountPage } from './pages/ClientCreateAccountPage'
import { ClientLoginPage } from './pages/ClientLoginPage'
import { ClientResendVerificationPage } from './pages/ClientResendVerificationPage'
import { ClientVerifyEmailPage } from './pages/ClientVerifyEmailPage'
import { ClientMyAccountPage } from './pages/ClientMyAccountPage'
import { ClientConsignmentDetailPage } from './pages/ClientConsignmentDetailPage'
import { ClientOrderItemPage } from './pages/ClientOrderItemPage'
import { ClientReserveItemPage } from './pages/ClientReserveItemPage'
import { ConsignItemsPage } from './pages/ConsignItemsPage'
import { InquiryDetailPage } from './pages/InquiryDetailPage'
import { InventoryItemDetailPage } from './pages/InventoryItemDetailPage'
import { ItemAuthenticationDetailsPage } from './pages/ItemAuthenticationDetailsPage'
import { InventoryPage } from './pages/InventoryPage'
import { ConsignmentScheduleDetailPage } from './pages/ConsignmentScheduleDetailPage'
import { AuthenticationPage } from './pages/AuthenticationPage'
import { ItemAuthenticationPage } from './pages/ItemAuthenticationPage'
import { WalkInAuthenticationPage } from './pages/WalkInAuthenticationPage'
import { WalkInAuthenticationDetailPage } from './pages/WalkInAuthenticationDetailPage'
import { ConsignmentSchedulingPage } from './pages/ConsignmentSchedulingPage'
import { InquiryPage } from './pages/InquiryPage'
import { EmployeesPage } from './pages/EmployeesPage'
import { ClientsPage } from './pages/ClientsPage'
import { ClientAccountDetailPage } from './pages/ClientAccountDetailPage'
import { PhotoshootItemPage } from './pages/PhotoshootItemPage'
import { PhotoshootPage } from './pages/PhotoshootPage'
import { EditingItemPage } from './pages/EditingItemPage'
import { EditingPage } from './pages/EditingPage'
import { PostingItemPage } from './pages/PostingItemPage'
import { PostingPage } from './pages/PostingPage'
import { PricingPage } from './pages/PricingPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { ConsignorPaymentDetailPage } from './pages/ConsignorPaymentDetailPage'
import { ConsignorPaymentsPage } from './pages/ConsignorPaymentsPage'
import { DirectPurchasePaymentDetailPage } from './pages/DirectPurchasePaymentDetailPage'
import { DirectPurchasePaymentsPage } from './pages/DirectPurchasePaymentsPage'
import { PromotionsPage } from './pages/PromotionsPage'
import { VouchersPage } from './pages/VouchersPage'
import { LogisticsPage } from './pages/LogisticsPage'
import { OrdersPage } from './pages/OrdersPage'
import { PortalLoginPage } from './pages/PortalLoginPage'
import { ItemCatalogPage } from './pages/ItemCatalogPage'
import { ClientOrderDetailPage } from './pages/ClientOrderDetailPage'
import { ClientOrdersPage } from './pages/ClientOrdersPage'
import { RegisterPage } from './pages/RegisterPage'
import { SettingsPage } from './pages/SettingsPage'
import { StaffProfilePage } from './pages/StaffProfilePage'
import { DashboardsPage } from './pages/DashboardsPage'
import { TaskboardPage } from './pages/TaskboardPage'
import { UnauthorizedPage } from './pages/UnauthorizedPage'
import { AccessManagementPage } from './pages/AccessManagementPage'
import { MessagingPage } from './pages/MessagingPage'
import { PhotoGuidelinesPage } from './pages/PhotoGuidelinesPage'
import type { FeatureKey } from './lib/feature-access'
import type { ReactNode } from 'react'

function FeatureRoute({
  feature,
  orFeatures,
  children,
}: {
  feature: FeatureKey
  orFeatures?: FeatureKey[]
  children: ReactNode
}) {
  return (
    <RequireFeatureAccess feature={feature} orFeatures={orFeatures}>
      {children}
    </RequireFeatureAccess>
  )
}

function RedirectToThirdPartyAuthenticationDetail() {
  const { id } = useParams()
  return (
    <Navigate to={`/portal/3rd-party-authentication/${id ?? ''}`} replace />
  )
}

function PortalBranch() {
  return (
    <>
      <PortalHtmlTheme />
      <UnsavedChangesProvider>
        <Outlet />
      </UnsavedChangesProvider>
    </>
  )
}

function ClientBranch() {
  return (
    <>
      <ClientHtmlTheme />
      <UnsavedChangesProvider>
        <Outlet />
      </UnsavedChangesProvider>
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
          { index: true, element: <Navigate to="taskboard" replace /> },
          { path: 'unauthorized', element: <UnauthorizedPage /> },
          { path: 'taskboard', element: <TaskboardPage /> },
          { path: 'dashboards', element: <DashboardsPage /> },
          {
            path: 'inquiries',
            element: (
              <FeatureRoute feature="inquiries">
                <InquiryPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'inquiries/:id',
            element: (
              <FeatureRoute
                feature="inquiries"
                orFeatures={['payment-verification']}
              >
                <InquiryDetailPage />
              </FeatureRoute>
            ),
          },
          { path: 'inventory', element: <InventoryPage /> },
          {
            path: 'inventory/:id/authentication',
            element: <ItemAuthenticationDetailsPage />,
          },
          { path: 'inventory/:id', element: <InventoryItemDetailPage /> },
          {
            path: 'consignment-scheduling',
            element: (
              <FeatureRoute feature="consignment-scheduling">
                <ConsignmentSchedulingPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'consignment-scheduling/:id',
            element: (
              <FeatureRoute feature="consignment-scheduling">
                <ConsignmentScheduleDetailPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'authentication/:id',
            element: (
              <FeatureRoute feature="authentication">
                <ItemAuthenticationPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'authentication',
            element: (
              <FeatureRoute feature="authentication">
                <AuthenticationPage />
              </FeatureRoute>
            ),
          },
          {
            path: '3rd-party-authentication/:id',
            element: (
              <FeatureRoute
                feature="walk-in-authentication"
                orFeatures={['payment-verification']}
              >
                <WalkInAuthenticationDetailPage />
              </FeatureRoute>
            ),
          },
          {
            path: '3rd-party-authentication',
            element: (
              <FeatureRoute feature="walk-in-authentication">
                <WalkInAuthenticationPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'walk-in-authentication/:id',
            element: <RedirectToThirdPartyAuthenticationDetail />,
          },
          {
            path: 'walk-in-authentication',
            element: (
              <Navigate to="/portal/3rd-party-authentication" replace />
            ),
          },
          {
            path: 'photoshoot',
            element: (
              <FeatureRoute feature="photoshoot">
                <PhotoshootPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'photoshoot/item/:photoshootId',
            element: (
              <FeatureRoute feature="photoshoot">
                <PhotoshootItemPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'pricing',
            element: (
              <FeatureRoute feature="pricing">
                <PricingPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'editing/:itemId',
            element: (
              <FeatureRoute feature="editing">
                <EditingItemPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'editing',
            element: (
              <FeatureRoute feature="editing">
                <EditingPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'posting/:itemId',
            element: (
              <FeatureRoute feature="posting">
                <PostingItemPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'posting',
            element: (
              <FeatureRoute feature="posting">
                <PostingPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'orders',
            element: (
              <FeatureRoute feature="orders">
                <OrdersPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'orders/:id',
            element: (
              <FeatureRoute
                feature="orders"
                orFeatures={['payment-verification']}
              >
                <OrderDetailPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'consignor-payments',
            element: (
              <FeatureRoute feature="consignor-payments">
                <ConsignorPaymentsPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'consignor-payments/:id',
            element: (
              <FeatureRoute feature="consignor-payments">
                <ConsignorPaymentDetailPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'direct-purchase-payments',
            element: (
              <FeatureRoute feature="direct-purchase-payments">
                <DirectPurchasePaymentsPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'direct-purchase-payments/:id',
            element: (
              <FeatureRoute feature="direct-purchase-payments">
                <DirectPurchasePaymentDetailPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'promotions',
            element: (
              <FeatureRoute feature="promotions">
                <PromotionsPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'vouchers',
            element: (
              <FeatureRoute feature="vouchers">
                <VouchersPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'logistics',
            element: (
              <FeatureRoute feature="logistics">
                <LogisticsPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'settings',
            element: (
              <FeatureRoute feature="settings">
                <SettingsPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'access-management',
            element: (
              <FeatureRoute feature="access-management">
                <AccessManagementPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'employees/register',
            element: (
              <FeatureRoute feature="employees">
                <RegisterPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'employees',
            element: (
              <FeatureRoute feature="employees">
                <EmployeesPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'clients/:clientId',
            element: (
              <FeatureRoute feature="clients">
                <ClientAccountDetailPage />
              </FeatureRoute>
            ),
          },
          {
            path: 'clients',
            element: (
              <FeatureRoute feature="clients">
                <ClientsPage />
              </FeatureRoute>
            ),
          },
          { path: 'messaging', element: <MessagingPage /> },
          { path: 'profile', element: <StaffProfilePage /> },
          { path: '*', element: <Navigate to="/portal/taskboard" replace /> },
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
      { path: 'photo-guide/guidelines', element: <PhotoGuidelinesPage /> },
      {
        path: 'photo-guide/guidelines.html',
        element: <Navigate to="/photo-guide/guidelines" replace />,
      },
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
          { path: 'catalog/:itemId/reserve', element: <ClientReserveItemPage /> },
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
