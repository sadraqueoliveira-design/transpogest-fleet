
-- Role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'mechanic', 'driver');

-- Fuel type enum
CREATE TYPE public.fuel_type AS ENUM ('Diesel', 'AdBlue', 'Reefer_Diesel');

-- Maintenance type enum
CREATE TYPE public.maintenance_type AS ENUM ('preventive', 'corrective');

-- Status enums
CREATE TYPE public.maintenance_status AS ENUM ('pending', 'in_progress', 'completed');
CREATE TYPE public.request_type AS ENUM ('Uniform', 'Vacation', 'Document', 'Other');
CREATE TYPE public.request_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.route_status AS ENUM ('planned', 'in_progress', 'completed', 'cancelled');

-- Profiles table (NO role column per security policy)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  license_number TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles table (separate per security requirements)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'driver',
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get user role function
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Vehicles table
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate TEXT NOT NULL UNIQUE,
  brand TEXT,
  model TEXT,
  vin TEXT,
  tachograph_calibration_date DATE,
  insurance_expiry DATE,
  inspection_expiry DATE,
  last_lat FLOAT,
  last_lng FLOAT,
  last_speed INT DEFAULT 0,
  fuel_level_percent FLOAT,
  odometer_km FLOAT,
  current_driver_id UUID REFERENCES auth.users(id),
  engine_hours FLOAT,
  tachograph_status TEXT,
  temperature_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- Maintenance records
CREATE TABLE public.maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  type maintenance_type NOT NULL,
  description TEXT,
  cost NUMERIC(10, 2),
  status maintenance_status NOT NULL DEFAULT 'pending',
  date_scheduled DATE,
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;

-- Fuel logs
CREATE TABLE public.fuel_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES auth.users(id),
  fuel_type fuel_type NOT NULL,
  liters NUMERIC(10, 2) NOT NULL,
  price_per_liter NUMERIC(10, 4),
  odometer_at_fillup FLOAT,
  reefer_engine_hours FLOAT,
  receipt_photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fuel_logs ENABLE ROW LEVEL SECURITY;

-- Service requests
CREATE TABLE public.service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES auth.users(id),
  type request_type NOT NULL,
  status request_status NOT NULL DEFAULT 'pending',
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

-- Occurrences
CREATE TABLE public.occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID REFERENCES public.vehicles(id),
  driver_id UUID NOT NULL REFERENCES auth.users(id),
  description TEXT,
  lat FLOAT,
  lng FLOAT,
  photos TEXT[] DEFAULT '{}',
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.occurrences ENABLE ROW LEVEL SECURITY;

-- Routes
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES auth.users(id),
  vehicle_id UUID REFERENCES public.vehicles(id),
  start_location TEXT,
  end_location TEXT,
  waypoints JSONB DEFAULT '[]',
  status route_status NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

-- Dynamic forms
CREATE TABLE public.dynamic_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  schema JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dynamic_forms ENABLE ROW LEVEL SECURITY;

-- Driver checklist submissions
CREATE TABLE public.checklist_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES public.dynamic_forms(id),
  driver_id UUID NOT NULL REFERENCES auth.users(id),
  vehicle_id UUID REFERENCES public.vehicles(id),
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_submissions ENABLE ROW LEVEL SECURITY;

-- Trigger for auto-creating profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'driver');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_maintenance_updated_at BEFORE UPDATE ON public.maintenance_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_service_requests_updated_at BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_dynamic_forms_updated_at BEFORE UPDATE ON public.dynamic_forms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== RLS POLICIES ==========

-- Profiles: users can read all profiles, update own
CREATE POLICY "Anyone authenticated can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles: admins can manage, users can read own
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Vehicles: admin/manager full access, drivers read assigned
CREATE POLICY "Admin/manager can manage vehicles" ON public.vehicles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Drivers can read assigned vehicle" ON public.vehicles FOR SELECT TO authenticated USING (current_driver_id = auth.uid());
CREATE POLICY "Mechanics can read vehicles" ON public.vehicles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'mechanic'));

-- Maintenance: admin/manager/mechanic full, drivers read own vehicle
CREATE POLICY "Staff can manage maintenance" ON public.maintenance_records FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'mechanic'));
CREATE POLICY "Drivers can read own vehicle maintenance" ON public.maintenance_records FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.vehicles WHERE vehicles.id = vehicle_id AND vehicles.current_driver_id = auth.uid())
);

-- Fuel logs: drivers can insert own, admin/manager read all
CREATE POLICY "Drivers can insert fuel logs" ON public.fuel_logs FOR INSERT TO authenticated WITH CHECK (driver_id = auth.uid());
CREATE POLICY "Drivers can read own fuel logs" ON public.fuel_logs FOR SELECT TO authenticated USING (driver_id = auth.uid());
CREATE POLICY "Admin/manager can manage fuel logs" ON public.fuel_logs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Service requests: drivers can manage own, admin/manager see all
CREATE POLICY "Drivers can manage own requests" ON public.service_requests FOR ALL TO authenticated USING (driver_id = auth.uid());
CREATE POLICY "Admin/manager can manage all requests" ON public.service_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Occurrences: drivers can insert/read own, admin/manager all
CREATE POLICY "Drivers can manage own occurrences" ON public.occurrences FOR ALL TO authenticated USING (driver_id = auth.uid());
CREATE POLICY "Admin/manager can manage all occurrences" ON public.occurrences FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Routes: drivers read own, admin/manager manage all
CREATE POLICY "Drivers can read own routes" ON public.routes FOR SELECT TO authenticated USING (driver_id = auth.uid());
CREATE POLICY "Admin/manager can manage routes" ON public.routes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Dynamic forms: admin can manage, all authenticated can read
CREATE POLICY "Anyone can read forms" ON public.dynamic_forms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage forms" ON public.dynamic_forms FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Checklist submissions: drivers insert own, admin/manager read all
CREATE POLICY "Drivers can insert own submissions" ON public.checklist_submissions FOR INSERT TO authenticated WITH CHECK (driver_id = auth.uid());
CREATE POLICY "Drivers can read own submissions" ON public.checklist_submissions FOR SELECT TO authenticated USING (driver_id = auth.uid());
CREATE POLICY "Admin/manager can read all submissions" ON public.checklist_submissions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
