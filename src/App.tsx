import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLayout from "@/components/layouts/AdminLayout";
import DriverLayout from "@/components/layouts/DriverLayout";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import VerifyDeclaration from "./pages/VerifyDeclaration";

// Admin pages
import Dashboard from "./pages/admin/Dashboard";
import Fleet from "./pages/admin/Fleet";
import Clients from "./pages/admin/Clients";
import HubsPage from "./pages/admin/Hubs";
import NetworkLocations from "./pages/admin/NetworkLocations";
import RoutesPage from "./pages/admin/Routes";
import Maintenance from "./pages/admin/Maintenance";
import FormBuilder from "./pages/admin/FormBuilder";
import ServiceRequests from "./pages/admin/ServiceRequests";
import Drivers from "./pages/admin/Drivers";
import TachographCards from "./pages/admin/TachographCards";
import AntramSettings from "./pages/admin/AntramSettings";
import FuelManagement from "./pages/admin/FuelManagement";
import Declarations from "./pages/admin/Declarations";
import Compliance from "./pages/admin/Compliance";

// Driver pages
import DriverHome from "./pages/driver/DriverHome";
import Checklist from "./pages/driver/Checklist";
import FuelLog from "./pages/driver/FuelLog";
import DriverRequests from "./pages/driver/DriverRequests";
import Occurrence from "./pages/driver/Occurrence";
import DriverProfile from "./pages/driver/DriverProfile";
import DriverDocuments from "./pages/driver/DriverDocuments";
import DriverDeclarations from "./pages/driver/DriverDeclarations";
import TachoTest from "./pages/driver/TachoTest";

const queryClient = new QueryClient();

const AdminRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute allowedRoles={["admin", "manager", "mechanic"]}>
    <AdminLayout>{children}</AdminLayout>
  </ProtectedRoute>
);

const DriverRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute allowedRoles={["driver"]}>
    <DriverLayout>{children}</DriverLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/verificar" element={<VerifyDeclaration />} />

            {/* Admin routes */}
            <Route path="/admin" element={<AdminRoute><Dashboard /></AdminRoute>} />
            <Route path="/admin/frota" element={<AdminRoute><Fleet /></AdminRoute>} />
            <Route path="/admin/abastecimento" element={<AdminRoute><FuelManagement /></AdminRoute>} />
            <Route path="/admin/clientes" element={<AdminRoute><Clients /></AdminRoute>} />
            <Route path="/admin/hubs" element={<AdminRoute><HubsPage /></AdminRoute>} />
            <Route path="/admin/locais" element={<AdminRoute><NetworkLocations /></AdminRoute>} />
            <Route path="/admin/rotas" element={<AdminRoute><RoutesPage /></AdminRoute>} />
            <Route path="/admin/manutencao" element={<AdminRoute><Maintenance /></AdminRoute>} />
            <Route path="/admin/formularios" element={<AdminRoute><FormBuilder /></AdminRoute>} />
            <Route path="/admin/solicitacoes" element={<AdminRoute><ServiceRequests /></AdminRoute>} />
            <Route path="/admin/motoristas" element={<AdminRoute><Drivers /></AdminRoute>} />
            <Route path="/admin/tacografo" element={<AdminRoute><TachographCards /></AdminRoute>} />
            <Route path="/admin/declaracoes" element={<AdminRoute><Declarations /></AdminRoute>} />
            <Route path="/admin/antram" element={<AdminRoute><AntramSettings /></AdminRoute>} />
            <Route path="/admin/compliance" element={<AdminRoute><Compliance /></AdminRoute>} />

            {/* Driver routes */}
            <Route path="/motorista" element={<DriverRoute><DriverHome /></DriverRoute>} />
            <Route path="/motorista/checklist" element={<DriverRoute><Checklist /></DriverRoute>} />
            <Route path="/motorista/abastecer" element={<DriverRoute><FuelLog /></DriverRoute>} />
            <Route path="/motorista/solicitacoes" element={<DriverRoute><DriverRequests /></DriverRoute>} />
            <Route path="/motorista/ocorrencia" element={<DriverRoute><Occurrence /></DriverRoute>} />
            <Route path="/motorista/documentos" element={<DriverRoute><DriverDocuments /></DriverRoute>} />
            <Route path="/motorista/declaracoes" element={<DriverRoute><DriverDeclarations /></DriverRoute>} />
            <Route path="/motorista/perfil" element={<DriverRoute><DriverProfile /></DriverRoute>} />
            <Route path="/motorista/tacho-test" element={<DriverRoute><TachoTest /></DriverRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
