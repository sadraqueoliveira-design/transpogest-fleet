export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_declarations: {
        Row: {
          company_name: string
          created_at: string
          document_url: string | null
          driver_id: string
          driver_signature_url: string | null
          gap_end_date: string
          gap_start_date: string
          id: string
          manager_id: string | null
          manager_name: string | null
          manager_signature_url: string | null
          reason_code: Database["public"]["Enums"]["declaration_reason"] | null
          reason_text: string | null
          signed_at: string | null
          signed_ip: string | null
          signed_pdf_url: string | null
          status: Database["public"]["Enums"]["declaration_status"]
          updated_at: string
        }
        Insert: {
          company_name?: string
          created_at?: string
          document_url?: string | null
          driver_id: string
          driver_signature_url?: string | null
          gap_end_date?: string
          gap_start_date: string
          id?: string
          manager_id?: string | null
          manager_name?: string | null
          manager_signature_url?: string | null
          reason_code?: Database["public"]["Enums"]["declaration_reason"] | null
          reason_text?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signed_pdf_url?: string | null
          status?: Database["public"]["Enums"]["declaration_status"]
          updated_at?: string
        }
        Update: {
          company_name?: string
          created_at?: string
          document_url?: string | null
          driver_id?: string
          driver_signature_url?: string | null
          gap_end_date?: string
          gap_start_date?: string
          id?: string
          manager_id?: string | null
          manager_name?: string | null
          manager_signature_url?: string | null
          reason_code?: Database["public"]["Enums"]["declaration_reason"] | null
          reason_text?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signed_pdf_url?: string | null
          status?: Database["public"]["Enums"]["declaration_status"]
          updated_at?: string
        }
        Relationships: []
      }
      antram_settings: {
        Row: {
          alert_minutes: number
          id: string
          max_minutes: number
          notify_on_alert: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_minutes?: number
          id?: string
          max_minutes?: number
          notify_on_alert?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_minutes?: number
          id?: string
          max_minutes?: number
          notify_on_alert?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      checklist_submissions: {
        Row: {
          created_at: string
          data: Json
          driver_id: string
          form_id: string | null
          id: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json
          driver_id: string
          form_id?: string | null
          id?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          driver_id?: string
          form_id?: string | null
          id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "dynamic_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_submissions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          api_enabled: boolean
          code: string
          created_at: string
          id: string
          last_sync_at: string | null
          name: string
          nif: string | null
          status: string
          trackit_password: string | null
          trackit_username: string | null
          updated_at: string
        }
        Insert: {
          api_enabled?: boolean
          code: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          name: string
          nif?: string | null
          status?: string
          trackit_password?: string | null
          trackit_username?: string | null
          updated_at?: string
        }
        Update: {
          api_enabled?: boolean
          code?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          name?: string
          nif?: string | null
          status?: string
          trackit_password?: string | null
          trackit_username?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      compliance_rules: {
        Row: {
          description: string | null
          id: string
          rule_key: string
          updated_at: string
          updated_by: string | null
          value_minutes: number
        }
        Insert: {
          description?: string | null
          id?: string
          rule_key: string
          updated_at?: string
          updated_by?: string | null
          value_minutes: number
        }
        Update: {
          description?: string | null
          id?: string
          rule_key?: string
          updated_at?: string
          updated_by?: string | null
          value_minutes?: number
        }
        Relationships: []
      }
      compliance_violations: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          details: Json | null
          detected_at: string
          driver_id: string
          id: string
          severity: string
          violation_type: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          details?: Json | null
          detected_at?: string
          driver_id: string
          id?: string
          severity?: string
          violation_type: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          details?: Json | null
          detected_at?: string
          driver_id?: string
          id?: string
          severity?: string
          violation_type?: string
        }
        Relationships: []
      }
      driver_activities: {
        Row: {
          activity_type: string
          created_at: string
          driver_id: string
          duration_minutes: number | null
          end_time: string | null
          id: string
          source: string
          start_time: string
          vehicle_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          driver_id: string
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          source?: string
          start_time: string
          vehicle_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          driver_id?: string
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          source?: string
          start_time?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_activities_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      dynamic_forms: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          schema: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          schema?: Json
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          schema?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          birth_date: string | null
          card_expiry_date: string | null
          card_issue_date: string | null
          card_number: string | null
          card_start_date: string | null
          category_code: string | null
          category_description: string | null
          company: string | null
          created_at: string
          employee_number: number
          full_name: string
          hire_date: string | null
          id: string
          license_number: string | null
          nif: string | null
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          card_expiry_date?: string | null
          card_issue_date?: string | null
          card_number?: string | null
          card_start_date?: string | null
          category_code?: string | null
          category_description?: string | null
          company?: string | null
          created_at?: string
          employee_number: number
          full_name: string
          hire_date?: string | null
          id?: string
          license_number?: string | null
          nif?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          card_expiry_date?: string | null
          card_issue_date?: string | null
          card_number?: string | null
          card_start_date?: string | null
          category_code?: string | null
          category_description?: string | null
          company?: string | null
          created_at?: string
          employee_number?: number
          full_name?: string
          hire_date?: string | null
          id?: string
          license_number?: string | null
          nif?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fuel_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          id: string
          level_percent: number | null
          threshold_percent: number
          vehicle_id: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          id?: string
          level_percent?: number | null
          threshold_percent: number
          vehicle_id: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          id?: string
          level_percent?: number | null
          threshold_percent?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_alerts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_logs: {
        Row: {
          created_at: string
          driver_id: string
          fuel_type: Database["public"]["Enums"]["fuel_type"]
          id: string
          liters: number
          odometer_at_fillup: number | null
          payment_method: string
          price_per_liter: number | null
          receipt_photo_url: string | null
          reefer_engine_hours: number | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          fuel_type: Database["public"]["Enums"]["fuel_type"]
          id?: string
          liters: number
          odometer_at_fillup?: number | null
          payment_method?: string
          price_per_liter?: number | null
          receipt_photo_url?: string | null
          reefer_engine_hours?: number | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          fuel_type?: Database["public"]["Enums"]["fuel_type"]
          id?: string
          liters?: number
          odometer_at_fillup?: number | null
          payment_method?: string
          price_per_liter?: number | null
          receipt_photo_url?: string | null
          reefer_engine_hours?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      hubs: {
        Row: {
          address: string | null
          arp2_code: string | null
          ativo: boolean
          categoria: string | null
          client_id: string
          code: string
          codigo_postal: string | null
          concelho: string | null
          created_at: string
          distrito: string | null
          freguesia: string | null
          id: string
          janelas_horarias: string | null
          lat: number | null
          lng: number | null
          localidade: string | null
          name: string
          status: string
          traffic_manager_id: string | null
          traffic_manager_name: string | null
          type: string | null
          updated_at: string
          zona_vida: string | null
        }
        Insert: {
          address?: string | null
          arp2_code?: string | null
          ativo?: boolean
          categoria?: string | null
          client_id: string
          code: string
          codigo_postal?: string | null
          concelho?: string | null
          created_at?: string
          distrito?: string | null
          freguesia?: string | null
          id?: string
          janelas_horarias?: string | null
          lat?: number | null
          lng?: number | null
          localidade?: string | null
          name: string
          status?: string
          traffic_manager_id?: string | null
          traffic_manager_name?: string | null
          type?: string | null
          updated_at?: string
          zona_vida?: string | null
        }
        Update: {
          address?: string | null
          arp2_code?: string | null
          ativo?: boolean
          categoria?: string | null
          client_id?: string
          code?: string
          codigo_postal?: string | null
          concelho?: string | null
          created_at?: string
          distrito?: string | null
          freguesia?: string | null
          id?: string
          janelas_horarias?: string | null
          lat?: number | null
          lng?: number | null
          localidade?: string | null
          name?: string
          status?: string
          traffic_manager_id?: string | null
          traffic_manager_name?: string | null
          type?: string | null
          updated_at?: string
          zona_vida?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hubs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_records: {
        Row: {
          cost: number | null
          created_at: string
          date_scheduled: string | null
          description: string | null
          id: string
          photos: string[] | null
          status: Database["public"]["Enums"]["maintenance_status"]
          type: Database["public"]["Enums"]["maintenance_type"]
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          date_scheduled?: string | null
          description?: string | null
          id?: string
          photos?: string[] | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          type: Database["public"]["Enums"]["maintenance_type"]
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          date_scheduled?: string | null
          description?: string | null
          id?: string
          photos?: string[] | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          type?: Database["public"]["Enums"]["maintenance_type"]
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrences: {
        Row: {
          created_at: string
          date: string
          description: string | null
          driver_id: string
          id: string
          lat: number | null
          lng: number | null
          photos: string[] | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          date?: string
          description?: string | null
          driver_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          photos?: string[] | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          description?: string | null
          driver_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          photos?: string[] | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "occurrences_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          full_name: string | null
          hire_date: string | null
          id: string
          last_card_download_at: string | null
          license_number: string | null
          next_card_download_due: string | null
          saved_signature_url: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          full_name?: string | null
          hire_date?: string | null
          id: string
          last_card_download_at?: string | null
          license_number?: string | null
          next_card_download_due?: string | null
          saved_signature_url?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          full_name?: string | null
          hire_date?: string | null
          id?: string
          last_card_download_at?: string | null
          license_number?: string | null
          next_card_download_due?: string | null
          saved_signature_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      refueling_events: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          detected_at: string
          estimated_liters: number | null
          fuel_after: number | null
          fuel_before: number | null
          id: string
          lat: number | null
          lng: number | null
          location_name: string | null
          matched_fuel_log_id: string | null
          notes: string | null
          source: string
          status: string
          suspicious: boolean
          suspicious_reason: string | null
          vehicle_id: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          detected_at?: string
          estimated_liters?: number | null
          fuel_after?: number | null
          fuel_before?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          matched_fuel_log_id?: string | null
          notes?: string | null
          source?: string
          status?: string
          suspicious?: boolean
          suspicious_reason?: string | null
          vehicle_id: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          detected_at?: string
          estimated_liters?: number | null
          fuel_after?: number | null
          fuel_before?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          matched_fuel_log_id?: string | null
          notes?: string | null
          source?: string
          status?: string
          suspicious?: boolean
          suspicious_reason?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refueling_events_matched_fuel_log_id_fkey"
            columns: ["matched_fuel_log_id"]
            isOneToOne: false
            referencedRelation: "fuel_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refueling_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          client_id: string | null
          created_at: string
          driver_id: string | null
          end_location: string | null
          hub_id: string | null
          id: string
          start_location: string | null
          status: Database["public"]["Enums"]["route_status"]
          updated_at: string
          vehicle_id: string | null
          waypoints: Json | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          driver_id?: string | null
          end_location?: string | null
          hub_id?: string | null
          id?: string
          start_location?: string | null
          status?: Database["public"]["Enums"]["route_status"]
          updated_at?: string
          vehicle_id?: string | null
          waypoints?: Json | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          driver_id?: string | null
          end_location?: string | null
          hub_id?: string | null
          id?: string
          start_location?: string | null
          status?: Database["public"]["Enums"]["route_status"]
          updated_at?: string
          vehicle_id?: string | null
          waypoints?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          created_at: string
          details: Json | null
          driver_id: string
          id: string
          status: Database["public"]["Enums"]["request_status"]
          type: Database["public"]["Enums"]["request_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          driver_id: string
          id?: string
          status?: Database["public"]["Enums"]["request_status"]
          type: Database["public"]["Enums"]["request_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          driver_id?: string
          id?: string
          status?: Database["public"]["Enums"]["request_status"]
          type?: Database["public"]["Enums"]["request_type"]
          updated_at?: string
        }
        Relationships: []
      }
      signature_audit_logs: {
        Row: {
          created_at: string
          declaration_id: string
          device_info: string | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          ip_address: string | null
          pdf_url: string | null
          signature_url: string | null
          signed_at: string
          signed_by_user_id: string
          signer_name: string
          signer_role: string
          verification_id: string
        }
        Insert: {
          created_at?: string
          declaration_id: string
          device_info?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          ip_address?: string | null
          pdf_url?: string | null
          signature_url?: string | null
          signed_at?: string
          signed_by_user_id: string
          signer_name: string
          signer_role: string
          verification_id?: string
        }
        Update: {
          created_at?: string
          declaration_id?: string
          device_info?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          ip_address?: string | null
          pdf_url?: string | null
          signature_url?: string | null
          signed_at?: string
          signed_by_user_id?: string
          signer_name?: string
          signer_role?: string
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_audit_logs_declaration_id_fkey"
            columns: ["declaration_id"]
            isOneToOne: false
            referencedRelation: "activity_declarations"
            referencedColumns: ["id"]
          },
        ]
      }
      tachograph_cards: {
        Row: {
          card_number: string
          created_at: string
          driver_id: string | null
          driver_name: string | null
          expiry_date: string | null
          id: string
          updated_at: string
        }
        Insert: {
          card_number: string
          created_at?: string
          driver_id?: string | null
          driver_name?: string | null
          expiry_date?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          card_number?: string
          created_at?: string
          driver_id?: string | null
          driver_name?: string | null
          expiry_date?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      trailers: {
        Row: {
          created_at: string
          id: string
          internal_id: string | null
          last_lat: number | null
          last_linked_vehicle_id: string | null
          last_lng: number | null
          plate: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          internal_id?: string | null
          last_lat?: number | null
          last_linked_vehicle_id?: string | null
          last_lng?: number | null
          plate: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          internal_id?: string | null
          last_lat?: number | null
          last_linked_vehicle_id?: string | null
          last_lng?: number | null
          plate?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailers_last_linked_vehicle_id_fkey"
            columns: ["last_linked_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_fcm_tokens: {
        Row: {
          created_at: string
          device_type: string
          id: string
          last_active_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_type?: string
          id?: string
          last_active_at?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_type?: string
          id?: string
          last_active_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_url: string
          id: string
          name: string
          uploaded_by: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          doc_type?: string
          file_url: string
          id?: string
          name: string
          uploaded_by?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_url?: string
          id?: string
          name?: string
          uploaded_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          adblue_level_percent: number | null
          brand: string | null
          client_id: string | null
          created_at: string
          current_driver_id: string | null
          engine_hours: number | null
          fuel_level_percent: number | null
          id: string
          inspection_expiry: string | null
          insurance_expiry: string | null
          last_lat: number | null
          last_lng: number | null
          last_location_name: string | null
          last_speed: number | null
          last_vehicle_unit_download_at: string | null
          mobile_number: string | null
          model: string | null
          next_vehicle_unit_download_due: string | null
          odometer_km: number | null
          plate: string
          reefer_set_point_1: number | null
          reefer_set_point_2: number | null
          rpm: number | null
          tachograph_calibration_date: string | null
          tachograph_status: string | null
          temperature_data: Json | null
          trackit_id: string | null
          updated_at: string
          vin: string | null
        }
        Insert: {
          adblue_level_percent?: number | null
          brand?: string | null
          client_id?: string | null
          created_at?: string
          current_driver_id?: string | null
          engine_hours?: number | null
          fuel_level_percent?: number | null
          id?: string
          inspection_expiry?: string | null
          insurance_expiry?: string | null
          last_lat?: number | null
          last_lng?: number | null
          last_location_name?: string | null
          last_speed?: number | null
          last_vehicle_unit_download_at?: string | null
          mobile_number?: string | null
          model?: string | null
          next_vehicle_unit_download_due?: string | null
          odometer_km?: number | null
          plate: string
          reefer_set_point_1?: number | null
          reefer_set_point_2?: number | null
          rpm?: number | null
          tachograph_calibration_date?: string | null
          tachograph_status?: string | null
          temperature_data?: Json | null
          trackit_id?: string | null
          updated_at?: string
          vin?: string | null
        }
        Update: {
          adblue_level_percent?: number | null
          brand?: string | null
          client_id?: string | null
          created_at?: string
          current_driver_id?: string | null
          engine_hours?: number | null
          fuel_level_percent?: number | null
          id?: string
          inspection_expiry?: string | null
          insurance_expiry?: string | null
          last_lat?: number | null
          last_lng?: number | null
          last_location_name?: string | null
          last_speed?: number | null
          last_vehicle_unit_download_at?: string | null
          mobile_number?: string | null
          model?: string | null
          next_vehicle_unit_download_due?: string | null
          odometer_km?: number | null
          plate?: string
          reefer_set_point_1?: number | null
          reefer_set_point_2?: number | null
          rpm?: number | null
          tachograph_calibration_date?: string | null
          tachograph_status?: string | null
          temperature_data?: Json | null
          trackit_id?: string | null
          updated_at?: string
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "mechanic" | "driver"
      declaration_reason:
        | "sick_leave"
        | "vacation"
        | "rest"
        | "other_work"
        | "exempt_vehicle"
        | "other"
      declaration_status: "draft" | "signed" | "archived"
      fuel_type: "Diesel" | "AdBlue" | "Reefer_Diesel"
      maintenance_status: "pending" | "in_progress" | "completed"
      maintenance_type: "preventive" | "corrective"
      request_status: "pending" | "approved" | "rejected"
      request_type: "Uniform" | "Vacation" | "Document" | "Other"
      route_status: "planned" | "in_progress" | "completed" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "mechanic", "driver"],
      declaration_reason: [
        "sick_leave",
        "vacation",
        "rest",
        "other_work",
        "exempt_vehicle",
        "other",
      ],
      declaration_status: ["draft", "signed", "archived"],
      fuel_type: ["Diesel", "AdBlue", "Reefer_Diesel"],
      maintenance_status: ["pending", "in_progress", "completed"],
      maintenance_type: ["preventive", "corrective"],
      request_status: ["pending", "approved", "rejected"],
      request_type: ["Uniform", "Vacation", "Document", "Other"],
      route_status: ["planned", "in_progress", "completed", "cancelled"],
    },
  },
} as const
