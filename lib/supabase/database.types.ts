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
      }
      leave_balances: {
        Row: {
          id: string
          user_id: string
          leave_year: number
          type: 'wfh' | 'leave' | 'compoff_wfh' | 'compoff_leave'
          allocated: number
          used: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          leave_year: number
          type: 'wfh' | 'leave' | 'compoff_wfh' | 'compoff_leave'
          allocated?: number
          used?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['leave_balances']['Insert']>
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
      }
      leaves: {
        Row: {
          id: string
          user_id: string
          type: 'wfh' | 'leave' | 'compoff_wfh' | 'compoff_leave'
          start_date: string
          end_date: string
          half_day_start: boolean
          half_day_end: boolean
          half_day_position: 'first_half' | 'second_half' | null
          reason: string | null
          days_deducted: number
          status: 'active' | 'deleted'
          created_by: string
          deleted_by: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'wfh' | 'leave' | 'compoff_wfh' | 'compoff_leave'
          start_date: string
          end_date: string
          half_day_start?: boolean
          half_day_end?: boolean
          half_day_position?: 'first_half' | 'second_half' | null
          reason?: string | null
          days_deducted: number
          status?: 'active' | 'deleted'
          created_by: string
          deleted_by?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['leaves']['Insert']>
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
      }
      teams: {
        Row: {
          id: string
          name: string
          wfo_pattern: string
          team_lead_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          wfo_pattern: string
          team_lead_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['teams']['Insert']>
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
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
    }
    Views: {
      leaves_today: {
        Row: {
          id: string
          user_id: string
          type: 'wfh' | 'leave' | 'compoff_wfh' | 'compoff_leave'
          start_date: string
          end_date: string
          half_day_start: boolean
          half_day_end: boolean
        }
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
        Returns: undefined
      }
      recompute_role_bundles: {
        Args: { p_user_id: string; p_new_role: string }
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
