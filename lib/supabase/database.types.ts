export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: number
          slack_dm_enabled: boolean
          slack_whereabouts_on_approval: boolean
          slack_daily_digest: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          slack_dm_enabled?: boolean
          slack_whereabouts_on_approval?: boolean
          slack_daily_digest?: boolean
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['app_settings']['Insert']>
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          actor_id: string
          action: string
          entity_type: string
          entity_id: string
          diff: Json | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id: string
          action: string
          entity_type: string
          entity_id: string
          diff?: Json | null
          note?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['audit_log']['Insert']>
        Relationships: []
      }
      capabilities: {
        Row: {
          key: string
          description: string
          is_scoped: boolean
          is_write: boolean
        }
        Insert: {
          key: string
          description: string
          is_scoped: boolean
          is_write: boolean
        }
        Update: Partial<Database['public']['Tables']['capabilities']['Insert']>
        Relationships: []
      }
      capability_bundles: {
        Row: {
          key: string
          name: string
          description: string
          capabilities: Json
        }
        Insert: {
          key: string
          name: string
          description: string
          capabilities: Json
        }
        Update: Partial<Database['public']['Tables']['capability_bundles']['Insert']>
        Relationships: []
      }
      compoff_grants: {
        Row: {
          id: string
          user_id: string
          type: 'compoff_wfh' | 'compoff_leave'
          amount: number
          work_date: string
          reason: string
          status: 'pending' | 'approved' | 'rejected'
          manager_id: string
          decided_at: string | null
          decided_by: string | null
          expires_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'compoff_wfh' | 'compoff_leave'
          amount: number
          work_date: string
          reason: string
          status?: 'pending' | 'approved' | 'rejected'
          manager_id: string
          decided_at?: string | null
          decided_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['compoff_grants']['Insert']>
        Relationships: []
      }
      equipment_locations: {
        Row: {
          id: string
          label: string
          created_at: string
        }
        Insert: {
          id?: string
          label: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['equipment_locations']['Insert']>
        Relationships: []
      }
      equipment_shoots: {
        Row: {
          id: string
          name: string
          location: string | null
          starts_at: string
          ends_at: string
          owner_id: string
          status: 'planned' | 'active' | 'done' | 'cancelled'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          location?: string | null
          starts_at: string
          ends_at: string
          owner_id: string
          status?: 'planned' | 'active' | 'done' | 'cancelled'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['equipment_shoots']['Insert']>
        Relationships: []
      }
      equipment_items: {
        Row: {
          id: string
          code: string
          name: string
          category:
            | 'camera' | 'lens' | 'light' | 'audio' | 'grip' | 'drone'
            | 'battery' | 'storage' | 'computer' | 'cable_adapter'
            | 'accessory' | 'other'
          brand_model: string | null
          serial_number: string | null
          photo_url: string | null
          home_location_id: string | null
          current_location_id: string | null
          kind: 'pooled' | 'assigned'
          assignee_id: string | null
          status: 'available' | 'checked_out' | 'in_repair' | 'retired' | 'lost'
          requires_approval: boolean
          current_holder_id: string | null
          current_checkout_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          category:
            | 'camera' | 'lens' | 'light' | 'audio' | 'grip' | 'drone'
            | 'battery' | 'storage' | 'computer' | 'cable_adapter'
            | 'accessory' | 'other'
          brand_model?: string | null
          serial_number?: string | null
          photo_url?: string | null
          home_location_id?: string | null
          current_location_id?: string | null
          kind?: 'pooled' | 'assigned'
          assignee_id?: string | null
          status?: 'available' | 'checked_out' | 'in_repair' | 'retired' | 'lost'
          requires_approval?: boolean
          current_holder_id?: string | null
          current_checkout_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['equipment_items']['Insert']>
        Relationships: []
      }
      equipment_checkouts: {
        Row: {
          id: string
          item_id: string
          holder_id: string
          checked_out_at: string
          due_at: string | null
          returned_at: string | null
          /** Shelf it was taken from; null when unknown. */
          picked_up_location_id: string | null
          returned_location_id: string | null
          transferred_from_checkout_id: string | null
          shoot_id: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          item_id: string
          holder_id: string
          checked_out_at?: string
          due_at?: string | null
          returned_at?: string | null
          picked_up_location_id?: string | null
          returned_location_id?: string | null
          transferred_from_checkout_id?: string | null
          shoot_id?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['equipment_checkouts']['Insert']>
        Relationships: []
      }
      equipment_reservations: {
        Row: {
          id: string
          item_id: string
          shoot_id: string
          /** Custom hold window; null/null means the whole shoot. */
          starts_at: string | null
          ends_at: string | null
          reserved_by: string
          status: 'active' | 'pending' | 'rejected' | 'picked_up' | 'expired' | 'cancelled'
          created_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: string
          item_id: string
          shoot_id: string
          starts_at?: string | null
          ends_at?: string | null
          reserved_by: string
          status?: 'active' | 'pending' | 'rejected' | 'picked_up' | 'expired' | 'cancelled'
          created_at?: string
          resolved_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['equipment_reservations']['Insert']>
        Relationships: []
      }
      equipment_kits: {
        Row: {
          id: string
          name: string
          notes: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          notes?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['equipment_kits']['Insert']>
        Relationships: []
      }
      equipment_kit_items: {
        Row: {
          id: string
          kit_id: string
          item_id: string
          created_at: string
        }
        Insert: {
          id?: string
          kit_id: string
          item_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['equipment_kit_items']['Insert']>
        Relationships: []
      }
      equipment_studios: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['equipment_studios']['Insert']>
        Relationships: []
      }
      equipment_studio_blocks: {
        Row: {
          id: string
          studio_id: string
          /** Null for a standalone hold (no shoot); then `title` names it. */
          shoot_id: string | null
          title: string | null
          starts_at: string
          ends_at: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          studio_id: string
          shoot_id?: string | null
          title?: string | null
          starts_at: string
          ends_at: string
          created_by: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['equipment_studio_blocks']['Insert']>
        Relationships: []
      }
      equipment_shoot_editors: {
        Row: {
          id: string
          shoot_id: string
          user_id: string
          added_by: string
          created_at: string
        }
        Insert: {
          id?: string
          shoot_id: string
          user_id: string
          added_by: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['equipment_shoot_editors']['Insert']>
        Relationships: []
      }
      equipment_repairs: {
        Row: {
          id: string
          item_id: string
          sent_by: string
          sent_at: string
          expected_back_on: string | null
          vendor: string | null
          notes: string | null
          returned_at: string | null
        }
        Insert: {
          id?: string
          item_id: string
          sent_by: string
          sent_at?: string
          expected_back_on?: string | null
          vendor?: string | null
          notes?: string | null
          returned_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['equipment_repairs']['Insert']>
        Relationships: []
      }
      equipment_issues: {
        Row: {
          id: string
          item_id: string
          reported_by: string
          checkout_id: string | null
          note: string
          status: 'open' | 'resolved'
          resolved_by: string | null
          resolved_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          item_id: string
          reported_by: string
          checkout_id?: string | null
          note: string
          status?: 'open' | 'resolved'
          resolved_by?: string | null
          resolved_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['equipment_issues']['Insert']>
        Relationships: []
      }
      equipment_private: {
        Row: {
          item_id: string
          purchase_date: string | null
          purchase_price_inr: number | null
          purchase_notes: string | null
        }
        Insert: {
          item_id: string
          purchase_date?: string | null
          purchase_price_inr?: number | null
          purchase_notes?: string | null
        }
        Update: Partial<Database['public']['Tables']['equipment_private']['Insert']>
        Relationships: []
      }
      equipment_settings: {
        Row: {
          id: number
          slack_dm_enabled: boolean
          slack_reminders_enabled: boolean
          slack_channel_feed: boolean
          /** Who hears about overdue gear first; null falls back to every
           *  manage_equipment holder. */
          tech_lead_user_id: string | null
          escalate_to_leads_after_days: number
          escalate_to_channel_after_days: number
          updated_at: string
        }
        Insert: {
          id?: number
          slack_dm_enabled?: boolean
          slack_reminders_enabled?: boolean
          slack_channel_feed?: boolean
          tech_lead_user_id?: string | null
          escalate_to_leads_after_days?: number
          escalate_to_channel_after_days?: number
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['equipment_settings']['Insert']>
        Relationships: []
      }
      holidays: {
        Row: {
          id: string
          date: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          date: string
          name: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['holidays']['Insert']>
        Relationships: []
      }
      leave_balances: {
        Row: {
          id: string
          user_id: string
          leave_year: number
          type: string
          allocated: number
          used: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          leave_year: number
          type: string
          allocated?: number
          used?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['leave_balances']['Insert']>
        Relationships: []
      }
      leave_types: {
        Row: {
          key: string
          name: string
          category: 'leave' | 'wfh' | 'compoff_leave' | 'compoff_wfh'
          annual_quota: number
          monthly_quota: number | null
          eligibility_mode: 'all' | 'selected'
          is_active: boolean
          is_system: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          key: string
          name: string
          category: 'leave' | 'wfh' | 'compoff_leave' | 'compoff_wfh'
          annual_quota?: number
          monthly_quota?: number | null
          eligibility_mode?: 'all' | 'selected'
          is_active?: boolean
          is_system?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['leave_types']['Insert']>
        Relationships: []
      }
      leave_year_resets: {
        Row: {
          id: string
          leave_year: number
          triggered_by: string
          triggered_at: string
        }
        Insert: {
          id?: string
          leave_year: number
          triggered_by: string
          triggered_at?: string
        }
        Update: Partial<Database['public']['Tables']['leave_year_resets']['Insert']>
        Relationships: []
      }
      leave_requests: {
        Row: {
          id: string
          user_id: string
          status: 'active' | 'pending' | 'delete_requested' | 'rejected' | 'deleted'
          reason: string | null
          created_by: string
          decided_by: string | null
          decided_at: string | null
          deleted_by: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          status?: 'active' | 'pending' | 'delete_requested' | 'rejected' | 'deleted'
          reason?: string | null
          created_by: string
          decided_by?: string | null
          decided_at?: string | null
          deleted_by?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['leave_requests']['Insert']>
        Relationships: []
      }
      leaves: {
        Row: {
          id: string
          request_id: string | null
          user_id: string
          type: string
          requested_type: string | null
          start_date: string
          end_date: string
          half_day_start: boolean
          half_day_end: boolean
          half_day_position: 'first_half' | 'second_half' | null
          reason: string | null
          days_deducted: number
          status: 'active' | 'pending' | 'delete_requested' | 'rejected' | 'deleted'
          created_by: string
          decided_by: string | null
          decided_at: string | null
          deleted_by: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          request_id?: string | null
          user_id: string
          type: string
          requested_type?: string | null
          start_date: string
          end_date: string
          half_day_start?: boolean
          half_day_end?: boolean
          half_day_position?: 'first_half' | 'second_half' | null
          reason?: string | null
          days_deducted: number
          status?: 'active' | 'pending' | 'delete_requested' | 'rejected' | 'deleted'
          created_by: string
          decided_by?: string | null
          decided_at?: string | null
          deleted_by?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['leaves']['Insert']>
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          body: string
          link_url: string | null
          related_entity_type: string | null
          related_entity_id: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title: string
          body: string
          link_url?: string | null
          related_entity_type?: string | null
          related_entity_id?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>
        Relationships: []
      }
      system_state: {
        Row: {
          id: number
          bootstrap_state: 'awaiting_root_admin' | 'awaiting_first_hr' | 'awaiting_first_team' | 'operational'
          bootstrapped_at: string | null
          bootstrapped_by: string | null
        }
        Insert: {
          id?: number
          bootstrap_state?: 'awaiting_root_admin' | 'awaiting_first_hr' | 'awaiting_first_team' | 'operational'
          bootstrapped_at?: string | null
          bootstrapped_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['system_state']['Insert']>
        Relationships: []
      }
      team_members: {
        Row: {
          id: string
          user_id: string
          team_id: string
          is_primary: boolean
          joined_at: string
          left_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          team_id: string
          is_primary?: boolean
          joined_at?: string
          left_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['team_members']['Insert']>
        Relationships: []
      }
      teams: {
        Row: {
          id: string
          name: string
          wfo_pattern: string
          off_days: string
          photo_url: string | null
          team_lead_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          wfo_pattern: string
          off_days?: string
          photo_url?: string | null
          team_lead_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['teams']['Insert']>
        Relationships: []
      }
      user_capabilities: {
        Row: {
          id: string
          user_id: string
          capability_key: string
          scope_type: 'self' | 'users' | 'teams' | 'all' | null
          scope_user_ids: string[] | null
          scope_team_ids: string[] | null
          granted_by: string
          granted_at: string
          source: 'manual' | 'role' | 'bundle'
          source_ref: string | null
          note: string | null
        }
        Insert: {
          id?: string
          user_id: string
          capability_key: string
          scope_type?: 'self' | 'users' | 'teams' | 'all' | null
          scope_user_ids?: string[] | null
          scope_team_ids?: string[] | null
          granted_by: string
          granted_at?: string
          source?: 'manual' | 'role' | 'bundle'
          source_ref?: string | null
          note?: string | null
        }
        Update: Partial<Database['public']['Tables']['user_capabilities']['Insert']>
        Relationships: []
      }
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          phone: string | null
          photo_url: string | null
          role: 'employee' | 'team_lead' | 'hr' | 'founder'
          manager_id: string | null
          status: 'active' | 'exited'
          joined_at: string
          exited_at: string | null
          notifications_muted: boolean
          designation: string | null
          slack_user_id: string | null
          date_of_birth: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          phone?: string | null
          photo_url?: string | null
          role: 'employee' | 'team_lead' | 'hr' | 'founder'
          manager_id?: string | null
          status?: 'active' | 'exited'
          joined_at: string
          exited_at?: string | null
          notifications_muted?: boolean
          designation?: string | null
          slack_user_id?: string | null
          date_of_birth?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['users']['Insert']>
        Relationships: []
      }
      user_leave_type_eligibility: {
        Row: {
          user_id: string
          leave_type_key: string
          created_at: string
        }
        Insert: {
          user_id: string
          leave_type_key: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['user_leave_type_eligibility']['Insert']>
        Relationships: []
      }
    }
    Views: {
      leaves_today: {
        Row: {
          id: string
          user_id: string
          type: string
          start_date: string
          end_date: string
          half_day_start: boolean
          half_day_end: boolean
        }
        Relationships: []
      }
      compoff_active: {
        Row: {
          id: string
          user_id: string
          type: 'compoff_wfh' | 'compoff_leave'
          amount: number
          work_date: string
          reason: string
          status: 'pending' | 'approved' | 'rejected'
          manager_id: string
          decided_at: string | null
          decided_by: string | null
          expires_at: string
          created_at: string
          updated_at: string
        }
        Relationships: []
      }
    }
    Functions: {
      user_can: {
        Args: { cap: string; target_user_id?: string }
        Returns: boolean
      }
      apply_bundle: {
        Args: {
          p_user_id: string
          p_bundle_key: string
          p_granted_by: string
          p_source?: string
          p_source_ref?: string
        }
        Returns: void
      }
      recompute_role_bundles: {
        Args: { p_user_id: string; p_new_role: string }
        Returns: void
      }
      leave_balance_year: {
        Args: { p_type: string }
        Returns: number
      }
      apply_balance_delta: {
        Args: {
          p_user_id: string
          p_leave_year: number
          p_type: string
          p_delta: number
          p_enforce?: boolean
        }
        Returns: undefined
      }
      approve_leave_atomic: {
        Args: { p_leave_id: string; p_actor: string }
        Returns: number
      }
      mark_leave_deleted_atomic: {
        Args: { p_leave_id: string; p_actor: string }
        Returns: string
      }
      remove_compoff_grant_atomic: {
        Args: { p_grant_id: string; p_actor: string }
        Returns: undefined
      }
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type Inserts<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type Updates<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
